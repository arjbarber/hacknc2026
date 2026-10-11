import json
import math
import os
import re
import threading
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel


ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
GEMINI_TTS_MODEL = os.getenv("GEMINI_TTS_MODEL", "gemini-3.8-flash-lite-tts")
GEMINI_TTS_VOICE = os.getenv("GEMINI_TTS_VOICE", "Puck")
STARTING_EQUITY = 100_000.0
ASSET_SYMBOLS = {
    asset["symbol"] for asset in json.loads((ROOT / "shared" / "assets.json").read_text())
}

router = APIRouter()
_CACHE = {}
_AUDIO_CACHE = {}
_CACHE_LOCK = threading.Lock()
_MAX_CACHE_ENTRIES = 128
_MAX_AUDIO_CACHE_ENTRIES = 64


class FihMessageRequest(BaseModel):
    kind: str
    symbol: str | None = None
    side: str | None = None
    quantity: float | None = None
    estimated_value: float | None = None
    fill_price: float | None = None
    buying_power: float | None = None
    equity: float | None = None


def _finite(value):
    return value is not None and math.isfinite(value)


def _fallback(context):
    kind = context["kind"]
    if kind == "preview":
        trade = f"{context['quantity']:g} {context['symbol']} {context['side']}"
        value = context.get("estimated_value")
        buying_power = context.get("buying_power")
        if value is not None and buying_power:
            share = value / buying_power * 100
            if value > buying_power:
                return f"{trade}: ${value:,.2f} exceeds buying power; alerting the emergency fish committee."
            if share >= 25:
                return f"{trade}: ${value:,.2f}, {share:.0f}% of buying power; my inner accountant put on a tiny helmet."
            if share <= 1:
                return f"{trade}: ${value:,.2f}, {share:.1f}% of buying power; the tiniest fish in my brain just cheered."
        amount = f"about ${value:,.2f}" if value is not None else "a mystery-sized move"
        return f"{trade}: {amount}; my internal weather report predicts one dramatic fin wave."
    if kind == "order":
        trade = f"{context['side'].capitalize()} {context['quantity']:g} {context['symbol']}"
        if context.get("fill_price") is not None:
            trade += f" at ${context['fill_price']:,.2f}"
        change = context["equity_change"]
        change_pct = context["equity_change_pct"]
        if change > 0:
            return f"{trade}; portfolio is ${change:,.2f} up (+{change_pct:.5f}%); the fishbowl bubbles are doing victory laps."
        if change < 0:
            return f"{trade}; portfolio is ${abs(change):,.2f} down ({change_pct:.5f}%); I am mourning in the kelp."
        return f"{trade}; portfolio is exactly even at $100,000; I am suspiciously calm."
    change = context.get("equity_change", 0)
    change_pct = context.get("equity_change_pct", 0)
    if change > 0:
        return f"Portfolio is ${change:,.2f} up (+{change_pct:.5f}%); I have promoted the bubbles to confetti."
    if change < 0:
        return f"Portfolio is ${abs(change):,.2f} down ({change_pct:.5f}%); I am composing a tiny sea shanty."
    return "At exactly $100,000, even the tide is holding its breath."


def _normalize_message(text, fallback):
    message = re.sub(r"\s+", " ", str(text or "")).strip().strip('"')
    message = re.split(r"(?<=[.!?])\s+", message, maxsplit=1)[0]
    words = message.split()
    if not words:
        return fallback
    if len(words) > 18:
        message = " ".join(words[:18]).rstrip(".,;:!?") + "."
    elif message[-1] not in ".!?":
        message += "."
    return message


def _validated_context(body):
    if body.kind not in {"preview", "equity", "order"}:
        raise HTTPException(status_code=400, detail="Unknown Fih message context")

    context = {"kind": body.kind}
    if body.kind in {"preview", "order"}:
        if body.symbol not in ASSET_SYMBOLS or body.side not in {"buy", "sell"}:
            raise HTTPException(status_code=400, detail="Invalid trade context")
        if not (_finite(body.quantity) and body.quantity > 0):
            raise HTTPException(status_code=400, detail="Quantity must be positive")
        context.update(symbol=body.symbol, side=body.side, quantity=round(body.quantity, 8))

    for name in ("estimated_value", "fill_price", "buying_power"):
        value = getattr(body, name)
        if _finite(value) and value >= 0:
            context[name] = round(value, 2)

    if _finite(body.equity) and body.equity >= 0:
        change = body.equity - STARTING_EQUITY
        context.update(
            equity=round(body.equity, 2),
            equity_change=round(change, 2),
            equity_change_pct=round(change / STARTING_EQUITY * 100, 4),
            equity_tone="positive" if change > 0 else "negative" if change < 0 else "neutral",
        )
    elif body.kind in {"equity", "order"}:
        raise HTTPException(status_code=400, detail="Equity is required")

    return context


def _generate_message(context):
    fallback = _fallback(context)
    if not GEMINI_API_KEY:
        return fallback, "fallback"

    prompt = f"""You are Fih, a surreal silver fish with a curious, witty, slightly chaotic voice.
Write exactly one witty, slightly chaotic, expressive sentence of at most 18 words.
Be specific to the supplied trade or portfolio context. Never invent market facts or give financial advice.
Vary imagery and sentence structure: use fishy observations, dry humor, and theatrical reactions; avoid repeating shoe references or catchphrases.
For preview context, the order is unsubmitted: never describe gains, losses, or a completed trade.
For equity context, react negatively below $100,000, neutrally at exactly $100,000, and positively above it.
For order context, prioritize the updated portfolio result and mention the completed trade when natural.
Return only the sentence, with no quotation marks or markdown.
Context: {json.dumps(context, sort_keys=True)}"""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.9, "maxOutputTokens": 48},
    }
    try:
        with httpx.Client(timeout=20) as client:
            response = client.post(url, headers={"x-goog-api-key": GEMINI_API_KEY}, json=body)
            response.raise_for_status()
        parts = response.json()["candidates"][0]["content"]["parts"]
        text = "".join(part.get("text", "") for part in parts)
        return _normalize_message(text, fallback), "gemini"
    except Exception as error:
        print(f"Fih Gemini message unavailable: {type(error).__name__}")
        return fallback, "fallback"


def _speech_style(context):
    character = "Witty, curious silver-fish character; warm conversational tone, lively pitch contours, playful emphasis, varied pacing, and crisp comic pauses."
    if context["kind"] == "preview":
        value = context.get("estimated_value", 0)
        buying_power = context.get("buying_power", 0)
        delivery = "build mock-serious suspense, then pop into a playful upward lilt" if buying_power and value / buying_power >= 0.25 else "use a curious, lightly teasing lilt"
    elif context.get("equity_tone") == "positive":
        delivery = "sound delighted, with a bright rising inflection and a tiny celebratory bounce"
    elif context.get("equity_tone") == "negative":
        delivery = "dip into mock-tragic disappointment, then rebound playfully; never sound harsh"
    else:
        delivery = "stay dry and deadpan, with one curious upward lilt at the end"
    return f"{character} {delivery}."


def _generate_speech(message, context):
    if not GEMINI_API_KEY:
        return None

    style = _speech_style(context)
    cache_key = json.dumps(
        [message, style, GEMINI_TTS_MODEL, GEMINI_TTS_VOICE],
        separators=(",", ":"),
    )
    with _CACHE_LOCK:
        cached = _AUDIO_CACHE.get(cache_key)
    if cached:
        return cached

    url = "https://generativelanguage.googleapis.com/v1beta/interactions"
    body = {
        "model": GEMINI_TTS_MODEL,
        "input": [{
            "type": "user_input",
            "content": [{
                "type": "text",
                "text": message,
                "annotations": [{"type": "speech_metadata", "style": style}],
            }],
        }],
        "response_format": {"type": "audio"},
        "generation_config": {"speech_config": [{"voice": GEMINI_TTS_VOICE}]},
        "store": False,
    }
    try:
        with httpx.Client(timeout=20) as client:
            response = client.post(
                url,
                headers={"x-goog-api-key": GEMINI_API_KEY},
                json=body,
            )
            response.raise_for_status()
        interaction = response.json()
        speech = interaction.get("output_audio", {}).get("data")
        if not speech:
            speech = next((
                item["data"]
                for step in interaction.get("steps", [])
                for item in step.get("content", [])
                if item.get("type") == "audio" and item.get("data")
            ), None)
        if not speech:
            raise ValueError("Gemini TTS response contained no audio")
        with _CACHE_LOCK:
            if len(_AUDIO_CACHE) >= _MAX_AUDIO_CACHE_ENTRIES:
                _AUDIO_CACHE.pop(next(iter(_AUDIO_CACHE)))
            _AUDIO_CACHE[cache_key] = speech
        return speech
    except httpx.HTTPStatusError as error:
        print(f"Fih Gemini speech unavailable: HTTP {error.response.status_code}")
        return None
    except Exception as error:
        print(f"Fih Gemini speech unavailable: {type(error).__name__}")
        return None


@router.post("/fih/message")
def fih_message(body: FihMessageRequest):
    context = _validated_context(body)
    cache_key = json.dumps(context, sort_keys=True, separators=(",", ":"))
    with _CACHE_LOCK:
        cached = _CACHE.get(cache_key)
    if cached:
        return {**cached, "source": "cache"}

    message, source = _generate_message(context)
    result = {"message": message, "source": source, "speech": _generate_speech(message, context)}
    with _CACHE_LOCK:
        if len(_CACHE) >= _MAX_CACHE_ENTRIES:
            _CACHE.pop(next(iter(_CACHE)))
        _CACHE[cache_key] = result
    return result


@router.get("/fih/quit")
def fih_quit(lang: str = "en"):
    """Return the Support Fish's one and only piece of career advice."""
    message = "İstifa ediyorum." if lang == "tr" else "I quit."
    context = {"kind": "equity", "equity_tone": "neutral"}
    return {"message": message, "speech": _generate_speech(message, context)}
