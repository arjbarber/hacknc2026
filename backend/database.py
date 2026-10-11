import os
import psycopg
from dotenv import load_dotenv

load_dotenv()

DB_URL = os.getenv("TIGER_DATABASE_URL")

def get_connection():
    conn = psycopg.connect(DB_URL, autocommit=True)
    return conn

def init_db():
    with get_connection() as conn:
        with conn.cursor() as cur:
            # Create Users table
            cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(100),
                is_bot BOOLEAN DEFAULT FALSE,
                cash DOUBLE PRECISION DEFAULT 100000.0
            );
            """)

            # Create Ticks table
            cur.execute("""
            CREATE TABLE IF NOT EXISTS ticks (
                ts TIMESTAMPTZ NOT NULL,
                symbol VARCHAR(20) NOT NULL,
                price DOUBLE PRECISION NOT NULL,
                source VARCHAR(20)
            );
            """)
            # The ingest feeds write a source column; older databases were created without it.
            cur.execute("ALTER TABLE ticks ADD COLUMN IF NOT EXISTS source VARCHAR(20);")
            try:
                cur.execute("SELECT create_hypertable('ticks', 'ts', if_not_exists => TRUE);")
            except psycopg.errors.Error as e:
                if "already" not in str(e).lower():
                    print(f"Hypertable ticks err: {e}")

            # Create Orders table
            cur.execute("""
            CREATE TABLE IF NOT EXISTS orders (
                id VARCHAR(50) PRIMARY KEY,
                user_id VARCHAR(50) REFERENCES users(id),
                symbol VARCHAR(20) NOT NULL,
                side VARCHAR(10) NOT NULL,
                qty DOUBLE PRECISION NOT NULL,
                status VARCHAR(20) DEFAULT 'filled',
                fill_price DOUBLE PRECISION,
                ts TIMESTAMPTZ DEFAULT NOW()
            );
            """)

            # Create Positions table
            cur.execute("""
            CREATE TABLE IF NOT EXISTS positions (
                user_id VARCHAR(50) REFERENCES users(id),
                symbol VARCHAR(20) NOT NULL,
                qty DOUBLE PRECISION NOT NULL,
                avg_price DOUBLE PRECISION NOT NULL,
                PRIMARY KEY (user_id, symbol)
            );
            """)

            # Create Portfolio Snapshots table
            cur.execute("""
            CREATE TABLE IF NOT EXISTS portfolio_snapshots (
                ts TIMESTAMPTZ NOT NULL,
                user_id VARCHAR(50) REFERENCES users(id),
                cash DOUBLE PRECISION NOT NULL,
                equity DOUBLE PRECISION NOT NULL,
                pnl DOUBLE PRECISION NOT NULL
            );
            """)
            try:
                cur.execute("SELECT create_hypertable('portfolio_snapshots', 'ts', if_not_exists => TRUE);")
            except psycopg.errors.Error as e:
                if "already" not in str(e).lower():
                    print(f"Hypertable portfolio_snapshots err: {e}")

            # Create Candles 1m
            try:
                cur.execute("""
                CREATE MATERIALIZED VIEW IF NOT EXISTS candles_1m
                WITH (timescaledb.continuous) AS
                SELECT time_bucket('1 minute', ts) AS bucket,
                       symbol,
                       FIRST(price, ts) as o,
                       MAX(price) as h,
                       MIN(price) as l,
                       LAST(price, ts) as c,
                       COUNT(price) as v
                FROM ticks
                GROUP BY bucket, symbol;
                """)
            except psycopg.errors.Error as e:
                if "already exists" not in str(e).lower():
                    print(f"Mat view err: {e}")

            # Insert some mock users
            cur.execute("""
            INSERT INTO users (id, name, is_bot, cash) VALUES
            ('u_123', 'alice', FALSE, 100000.0),
            ('u_bot1', 'LightGBM-SOL-bot', TRUE, 100000.0)
            ON CONFLICT (id) DO NOTHING;
            """)

            # Latest-price lookups filter by symbol and sort by time. transaction_per_chunk builds
            # it one chunk at a time, so the first build doesn't block the live feeds' writes.
            cur.execute("CREATE INDEX IF NOT EXISTS ticks_symbol_ts ON ticks (symbol, ts DESC) "
                        "WITH (timescaledb.transaction_per_chunk);")

if __name__ == "__main__":
    print("Initializing database...")
    init_db()
    print("Database initialized successfully.")
