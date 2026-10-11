import json, os, pathlib
from contextlib import contextmanager
from datetime import date
import psycopg
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
load_dotenv()

ROOT = pathlib.Path(__file__).parent.parent
try:
    from ingest import nessie_client as nessie
except ImportError:
    import sys
    sys.path.insert(0, str(ROOT / "ingest"))
    import nessie_client as nessie

router = APIRouter(prefix="/nessie", tags=["nessie"])
SYMBOLS = {a["symbol"] for a in json.loads((ROOT / "shared" / "assets.json").read_text())}
MIN_SWEEP = float(os.getenv("NESSIE_MIN_SWEEP", "0.25"))  # dollars

SCHEMA = """
CREATE TABLE IF NOT EXISTS nessie_links (
  user_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  linked_at TIMESTAMPTZ DEFAULT now(),
  roundup_enabled BOOLEAN DEFAULT FALSE,
  roundup_symbol TEXT DEFAULT 'SOL'
);
CREATE TABLE IF NOT EXISTS nessie_sweeps (
  purchase_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  roundup DOUBLE PRECISION NOT NULL,
  symbol TEXT,
  qty DOUBLE PRECISION,
  fill_price DOUBLE PRECISION,
  swept_at TIMESTAMPTZ DEFAULT now()
);
"""
_ready = False
_merchant_id = None

def _db():
    return psycopg.connect(os.environ["TIGER_DATABASE_URL"])

def _ensure():
    global _ready
    if not _ready:
        with _db() as c:
            c.execute(SCHEMA)
        _ready = True

@contextmanager
def nessie_errors():
    try:
        yield
    except nessie.NessieError as e:
        raise HTTPException(502, {"error": "nessie_unavailable", "message": str(e)})

def _get_link(c, user_id):
    row = c.execute("SELECT account_id, roundup_enabled, roundup_symbol "
                    "FROM nessie_links WHERE user_id=%s", (user_id,)).fetchone()
    if not row:
        raise HTTPException(404, {"error": "not_linked", "message": "Link a Nessie account first"})
    return row

def _swept_ids(c, user_id):
    return {r[0] for r in c.execute(
        "SELECT purchase_id FROM nessie_sweeps WHERE user_id=%s", (user_id,))}

def _pending(account_id, swept):
    with nessie_errors():
        purchases = nessie.list_purchases(account_id)
    out = [(p, nessie.roundup(p["amount"])) for p in purchases if p["_id"] not in swept]
    return [(p, r) for p, r in out if r > 0]

def _account_view(acct):
    num = str(acct.get("account_number") or "")
    return {"nickname": acct.get("nickname"), "type": acct.get("type"),
            "balance": acct.get("balance"), "last4": num[-4:] if num else None}

class LinkBody(BaseModel):
    user_id: str
    account_id: str | None = None

class RoundupBody(BaseModel):
    user_id: str
    enabled: bool
    symbol: str | None = None

class SweepBody(BaseModel):
    user_id: str

class DemoPurchaseBody(BaseModel):
    user_id: str
    amount: float
    description: str = "Demo purchase"

@router.post("/link")
def link(body: LinkBody):
    _ensure()
    account_id = body.account_id or os.getenv("NESSIE_DEMO_ACCOUNT_ID")
    if not account_id:
        raise HTTPException(400, {"error": "no_account", "message": "No account_id and NESSIE_DEMO_ACCOUNT_ID not set"})
    with nessie_errors():
        acct = nessie.get_account(account_id)
        existing = nessie.list_purchases(account_id)
    with _db() as c:
        c.execute("INSERT INTO nessie_links (user_id, account_id) VALUES (%s, %s) "
                  "ON CONFLICT (user_id) DO UPDATE SET account_id = EXCLUDED.account_id",
                  (body.user_id, account_id))
        # baseline: purchases that already exist don't count toward round-ups
        with c.cursor() as cur:
            cur.executemany(
                "INSERT INTO nessie_sweeps (purchase_id, user_id, roundup) VALUES (%s, %s, 0) "
                "ON CONFLICT DO NOTHING", [(p["_id"], body.user_id) for p in existing])
    return {"linked": True, "account": _account_view(acct)}

@router.get("/status/{user_id}")
def status(user_id: str):
    _ensure()
    with _db() as c:
        row = c.execute("SELECT account_id, roundup_enabled, roundup_symbol "
                        "FROM nessie_links WHERE user_id=%s", (user_id,)).fetchone()
        if not row:
            return {"linked": False}
        account_id, enabled, symbol = row
        swept = _swept_ids(c, user_id)
        swept_total, swept_n = c.execute(
            "SELECT coalesce(sum(roundup),0), count(*) FILTER (WHERE roundup > 0) "
            "FROM nessie_sweeps WHERE user_id=%s", (user_id,)).fetchone()
    with nessie_errors():
        acct = nessie.get_account(account_id)
    pend = _pending(account_id, swept)
    return {"linked": True, "account": _account_view(acct),
            "roundup": {"enabled": enabled, "symbol": symbol,
                        "pending_total": round(sum(r for _, r in pend), 2),
                        "invested_total": round(swept_total, 2),
                        "purchases_swept": swept_n}}

@router.post("/roundup")
def roundup_toggle(body: RoundupBody):
    _ensure()
    if body.symbol and body.symbol not in SYMBOLS:
        raise HTTPException(400, {"error": "bad_symbol", "message": f"{body.symbol} is not in assets.json"})
    with _db() as c:
        _get_link(c, body.user_id)
        c.execute("UPDATE nessie_links SET roundup_enabled=%s, "
                  "roundup_symbol=COALESCE(%s, roundup_symbol) WHERE user_id=%s",
                  (body.enabled, body.symbol, body.user_id))
    return {"enabled": body.enabled, "symbol": body.symbol}

def _do_sweep(user_id):
    from backend.main import order, latest_price  # lazy import avoids a circular import
    with _db() as c:
        account_id, _, symbol = _get_link(c, user_id)
        swept = _swept_ids(c, user_id)
    pend = _pending(account_id, swept)
    total = round(sum(r for _, r in pend), 2)
    if total < MIN_SWEEP:
        return {"swept": False, "reason": f"pending round-ups ${total} below ${MIN_SWEEP} minimum",
                "pending_total": total}
    quote = latest_price(symbol)
    if not quote:
        raise HTTPException(409, {"error": "no_price", "message": f"No price for {symbol}"})
    price = quote[0]
    qty = round(total / price, 8)
    try:
        res = order({"user_id": user_id, "symbol": symbol, "side": "buy", "qty": qty})
    except HTTPException as e:
        raise HTTPException(e.status_code, {"error": "sweep_failed", "message": str(e.detail)})
    fill = res.get("fill_price", price) if isinstance(res, dict) else price
    with _db() as c:
        with c.cursor() as cur:
            cur.executemany(
                "INSERT INTO nessie_sweeps (purchase_id, user_id, roundup, symbol, qty, fill_price) "
                "VALUES (%s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING",
                [(p["_id"], user_id, r, symbol, qty * r / total, fill) for p, r in pend])
    return {"swept": True, "invested_usd": total, "symbol": symbol, "qty": qty,
            "fill_price": fill, "purchases": len(pend)}

@router.post("/sweep")
def sweep(body: SweepBody):
    _ensure()
    return _do_sweep(body.user_id)

@router.post("/demo-purchase")
def demo_purchase(body: DemoPurchaseBody):
    """Creates a new mock bank purchase (for the live demo). Auto-sweeps if round-ups are on."""
    global _merchant_id
    _ensure()
    with _db() as c:
        account_id, enabled, _ = _get_link(c, body.user_id)
    with nessie_errors():
        if not _merchant_id:
            merchants = nessie.list_merchants()
            if merchants:
                _merchant_id = merchants[0]["_id"]
            else:
                _merchant_id = nessie.create_merchant("PaperTrade Cafe")["_id"]
        p = nessie.create_purchase(account_id, _merchant_id, round(body.amount, 2),
                                   date.today().isoformat(), body.description)
    out = {"purchase_id": p.get("_id"), "amount": round(body.amount, 2),
           "roundup": nessie.roundup(body.amount), "sweep": None}
    if enabled and out["roundup"] > 0:
        try:
            out["sweep"] = _do_sweep(body.user_id)
        except HTTPException as e:
            out["sweep"] = {"swept": False, "error": e.detail}
    return out