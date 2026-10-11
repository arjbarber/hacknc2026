import os, httpx
from dotenv import load_dotenv
load_dotenv()
KEY = os.getenv("NESSIE_API_KEY")
print("key loaded:", bool(KEY), "| length:", len(KEY or ""))

for scheme in ("https", "http"):
    for path in ("", "customers"):
        url = f"{scheme}://api.nessieisreal.com/{path}"
        try:
            r = httpx.get(url, params={"key": KEY} if path else None, timeout=10, follow_redirects=True)
            print(f"{scheme:5} /{path:10} -> {r.status_code} {r.text[:120]!r}")
        except Exception as e:
            print(f"{scheme:5} /{path:10} -> FAILED: {type(e).__name__}: {e}")