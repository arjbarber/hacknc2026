import os, time, psycopg
from dotenv import load_dotenv
load_dotenv()

from datetime import datetime, timezone

def insert_ticks(conn, rows, source="live"):
    data = [(datetime.fromtimestamp(ts / 1000, tz=timezone.utc), sym, price, source)
            for sym, price, ts in rows]
    with conn.cursor() as cur:
        cur.executemany(
            "INSERT INTO ticks (ts, symbol, price, source) VALUES (%s, %s, %s, %s)", data)
    conn.commit()

conn = psycopg.connect(os.environ["TIGER_DATABASE_URL"])
now = int(time.time() * 1000)
insert_ticks(conn, [("TEST", 1.23, now)], source="test")

print(conn.execute(
    "SELECT ts, symbol, price, source FROM ticks WHERE symbol = 'TEST' ORDER BY ts DESC LIMIT 3"
).fetchall())

conn.execute("DELETE FROM ticks WHERE symbol = 'TEST'")
conn.commit()
print("cleaned up")