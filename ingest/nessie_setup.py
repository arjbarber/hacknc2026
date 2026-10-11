import json, pathlib, random
from datetime import date, timedelta
import nessie_client as n

CACHE = pathlib.Path(__file__).parent / "cache"
CACHE.mkdir(exist_ok=True)

customers = n.list_customers()
if customers:
    cust = customers[0]
    print("reusing customer:", cust["_id"])
else:
    cust = n.create_customer("Demo", "Student")
    print("created customer:", cust["_id"])

accounts = n.list_accounts(cust["_id"])
if accounts:
    acct = accounts[0]
    print("reusing account:", acct["_id"])
else:
    acct = n.create_account(cust["_id"], "PaperTrade Checking", 5000)
    print("created account:", acct["_id"])
account_id = acct["_id"]

purchases = n.list_purchases(account_id)
if len(purchases) < 3:
    merchants = n.list_merchants()
    if not merchants:
        print("NOTE: no merchants returned, skipping seed purchases")
    else:
        random.seed(7)
        samples = [(4.35, "Coffee"), (12.80, "Lunch"), (7.45, "Bus pass"),
                   (23.10, "Groceries"), (3.90, "Snack"), (15.25, "Books")]
        for i, (amt, desc) in enumerate(samples):
            day = (date.today() - timedelta(days=i)).isoformat()
            n.create_purchase(account_id, random.choice(merchants)["_id"], amt, day, desc)
        purchases = n.list_purchases(account_id)
        print(f"seeded {len(samples)} purchases")

acct = n.get_account(account_id)
total = round(sum(n.roundup(p["amount"]) for p in purchases), 2)
print(f"\naccount: {acct.get('nickname')} | type: {acct.get('type')} | balance: {acct.get('balance')}")
print(f"purchases: {len(purchases)} | round-up total: ${total}")
for p in purchases[:6]:
    print(f"  {p.get('purchase_date')}  ${p['amount']:<7} -> round-up ${n.roundup(p['amount'])}  {p.get('description')}")

(CACHE / "nessie_demo.json").write_text(json.dumps(
    {"customer_id": cust["_id"], "account_id": account_id}))
print(f"\nAdd this line to .env and the team vault:\nNESSIE_DEMO_ACCOUNT_ID={account_id}")