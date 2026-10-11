import math, os
import httpx
from dotenv import load_dotenv
load_dotenv()

BASE = "https://api.nessieisreal.com"
KEY = os.environ["NESSIE_API_KEY"]

class NessieError(Exception):
    pass

def _call(method, path, json=None):
    r = httpx.request(method, f"{BASE}{path}", params={"key": KEY}, json=json, timeout=15)
    if r.status_code >= 400:
        raise NessieError(f"{method} {path} -> {r.status_code} {r.text[:300]}")
    return r.json()

def _created(resp):
    return resp.get("objectCreated", resp)

def list_customers():
    return _call("GET", "/customers")

def create_customer(first, last):
    return _created(_call("POST", "/customers", {
        "first_name": first, "last_name": last,
        "address": {"street_number": "1", "street_name": "Franklin St",
                    "city": "Chapel Hill", "state": "NC", "zip": "27514"}}))

def list_accounts(customer_id):
    return _call("GET", f"/customers/{customer_id}/accounts")

def create_account(customer_id, nickname, balance, type_="Checking"):
    return _created(_call("POST", f"/customers/{customer_id}/accounts", {
        "type": type_, "nickname": nickname, "rewards": 0, "balance": balance}))

def get_account(account_id):
    return _call("GET", f"/accounts/{account_id}")

def list_merchants():
    return _call("GET", "/merchants")

def list_purchases(account_id):
    return _call("GET", f"/accounts/{account_id}/purchases")

def create_purchase(account_id, merchant_id, amount, day, description):
    return _created(_call("POST", f"/accounts/{account_id}/purchases", {
        "merchant_id": merchant_id, "medium": "balance",
        "purchase_date": day, "amount": amount, "description": description}))

def roundup(amount):
    """Spare change to the next whole dollar. $4.35 -> 0.65, $5.00 -> 0.00."""
    amount = round(float(amount), 2)
    up = math.ceil(amount)
    return round(up - amount, 2) if up != amount else 0.0