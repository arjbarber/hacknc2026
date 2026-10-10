import asyncio, json, os, websockets
from dotenv import load_dotenv
load_dotenv()
KEY = os.environ["FINNHUB_API_KEY"]

async def main():
    async with websockets.connect(f"wss://ws.finnhub.io?token={KEY}") as ws:
        for s in ["AAPL", "MSFT", "OANDA:EUR_USD", "BINANCE:BTCUSDT"]:
            await ws.send(json.dumps({"type": "subscribe", "symbol": s}))
        for _ in range(15):
            print(await asyncio.wait_for(ws.recv(), 30))

asyncio.run(main())