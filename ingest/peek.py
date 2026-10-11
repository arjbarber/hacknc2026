import os, psycopg
from dotenv import load_dotenv
load_dotenv()
c = psycopg.connect(os.environ["TIGER_DATABASE_URL"])

print("now UTC:", c.execute("select now() at time zone 'utc'").fetchone()[0])

print("\n== EURUSD by source (UTC) ==")
for r in c.execute("""SELECT source, count(*), min(ts) at time zone 'utc', max(ts) at time zone 'utc'
                      FROM ticks WHERE symbol='EURUSD' GROUP BY source ORDER BY source"""):
    print(r)

print("\n== EURUSD history per hour since Fri 18:00 UTC (rows, distinct prices, min, max) ==")
for r in c.execute("""SELECT date_trunc('hour', ts at time zone 'utc') h, count(*), count(distinct price),
                      min(price), max(price)
                      FROM ticks WHERE symbol='EURUSD' AND source='history'
                      AND ts > '2026-10-09 18:00+00' GROUP BY 1 ORDER BY 1"""):
    print(r)