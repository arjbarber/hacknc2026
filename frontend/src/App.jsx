import { useEffect, useState } from 'react'
import './App.css'

const assets = [
  { symbol: 'NVDA', name: 'NVIDIA Corporation', price: 142.87, change: 2.84, color: '#87a98c', path: 'M0 76 C18 70 24 75 38 58 S61 68 77 47 S95 54 112 39 S132 43 148 27 S168 37 184 18 S203 25 220 8' },
  { symbol: 'AAPL', name: 'Apple Inc.', price: 237.49, change: 0.92, color: '#c89555', path: 'M0 66 C17 58 23 67 39 51 S61 57 79 43 S99 52 116 34 S138 45 154 30 S173 34 190 16 S208 23 220 12' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', price: 513.12, change: -0.38, color: '#68829b', path: 'M0 24 C17 31 24 17 41 37 S61 29 78 44 S98 34 116 54 S136 39 153 58 S173 48 191 68 S207 57 220 75' },
  { symbol: 'TSLA', name: 'Tesla, Inc.', price: 332.05, change: -1.64, color: '#bb6f5a', path: 'M0 19 C17 30 23 24 39 40 S59 32 77 52 S98 39 115 60 S136 51 153 67 S174 57 191 78 S207 69 220 84' },
  { symbol: 'AMZN', name: 'Amazon.com, Inc.', price: 224.19, change: 1.27, color: '#9c8c60', path: 'M0 71 C17 68 24 59 40 66 S60 51 77 56 S99 40 116 48 S136 35 153 38 S173 24 190 29 S207 15 220 11' },
]

const startingPortfolio = {
  cash: 91129.15,
  positions: {
    AAPL: { quantity: 15, averagePrice: 218.4 },
    NVDA: { quantity: 10, averagePrice: 137.82 },
    MSFT: { quantity: 8, averagePrice: 492.55 },
  },
  history: [
    { id: 1, side: 'BUY', symbol: 'AAPL', quantity: 15, price: 218.4, time: '09:42:18' },
    { id: 2, side: 'BUY', symbol: 'NVDA', quantity: 10, price: 137.82, time: '09:38:04' },
    { id: 3, side: 'BUY', symbol: 'MSFT', quantity: 8, price: 492.55, time: '09:31:52' },
  ],
}

const money = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
const loadPortfolio = () => {
  try {
    return JSON.parse(localStorage.getItem('paperdesk-portfolio')) || startingPortfolio
  } catch {
    return startingPortfolio
  }
}

function App() {
  const [portfolio, setPortfolio] = useState(loadPortfolio)
  const [selectedSymbol, setSelectedSymbol] = useState('NVDA')
  const [side, setSide] = useState('BUY')
  const [quantity, setQuantity] = useState('10')
  const [range, setRange] = useState('1D')
  const [notice, setNotice] = useState('')
  const selectedAsset = assets.find((asset) => asset.symbol === selectedSymbol)
  const holdings = Object.entries(portfolio.positions).filter(([, position]) => position.quantity > 0)
  const positionsValue = holdings.reduce((total, [symbol, position]) => total + position.quantity * assets.find((asset) => asset.symbol === symbol).price, 0)
  const totalValue = portfolio.cash + positionsValue
  const totalCost = holdings.reduce((total, [, position]) => total + position.quantity * position.averagePrice, 0)
  const totalPnl = positionsValue - totalCost

  useEffect(() => {
    localStorage.setItem('paperdesk-portfolio', JSON.stringify(portfolio))
  }, [portfolio])

  function placeOrder(event) {
    event.preventDefault()
    const amount = Number(quantity)
    if (!Number.isInteger(amount) || amount <= 0) {
      setNotice('Enter a whole number of shares.')
      return
    }

    const position = portfolio.positions[selectedSymbol] || { quantity: 0, averagePrice: 0 }
    if (side === 'BUY' && amount * selectedAsset.price > portfolio.cash) {
      setNotice('Not enough buying power for this order.')
      return
    }
    if (side === 'SELL' && amount > position.quantity) {
      setNotice(`You only hold ${position.quantity} shares of ${selectedSymbol}.`)
      return
    }

    const nextQuantity = side === 'BUY' ? position.quantity + amount : position.quantity - amount
    const nextAverage = side === 'BUY'
      ? (position.quantity * position.averagePrice + amount * selectedAsset.price) / nextQuantity
      : position.averagePrice
    const order = {
      id: Date.now(), side, symbol: selectedSymbol, quantity: amount,
      price: selectedAsset.price,
      time: new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date()),
    }

    setPortfolio((current) => ({
      cash: current.cash + (side === 'BUY' ? -1 : 1) * amount * selectedAsset.price,
      positions: { ...current.positions, [selectedSymbol]: { quantity: nextQuantity, averagePrice: nextAverage } },
      history: [order, ...current.history].slice(0, 12),
    }))
    setNotice(`${side === 'BUY' ? 'Bought' : 'Sold'} ${amount} ${selectedSymbol} at ${money(selectedAsset.price)}.`)
  }

  return (
    <div className="terminal">
      <aside className="rail">
        <a className="brand-mark" href="#top" aria-label="Paperdesk home">p<span>.</span></a>
        <nav className="rail-nav" aria-label="Main navigation">
          <a className="rail-link selected" href="#overview" aria-label="Overview" title="Overview"><span>▦</span></a>
          <a className="rail-link" href="#markets" aria-label="Markets" title="Markets"><span>⌁</span></a>
          <a className="rail-link" href="#portfolio" aria-label="Portfolio" title="Portfolio"><span>◫</span></a>
        </nav>
        <div className="avatar" title="Demo account">JD</div>
      </aside>

      <main className="workspace" id="top">
        <header className="topbar">
          <div className="wordmark">paper<span>desk</span><span className="demo-tag">SIMULATOR</span></div>
          <div className="session-status"><span className="status-dot" /> Market open <span className="status-divider">/</span> Demo account</div>
          <button className="reset-button" type="button" onClick={() => { localStorage.removeItem('paperdesk-portfolio'); setPortfolio(startingPortfolio); setNotice('Demo account reset.') }}>Reset account</button>
        </header>

        <div className="page-content" id="overview">
          <div className="page-heading">
            <div><p className="eyebrow">MONDAY, OCTOBER 12, 2026 <span>·</span> PAPER TRADING</p><h1>Your market, your move.</h1></div>
            <div className="account-chip"><span className="chip-label">ACCOUNT VALUE</span><strong>{money(totalValue)}</strong></div>
          </div>

          <section className="summary-grid" aria-label="Account summary">
            <article className="summary-item"><span className="summary-label">PORTFOLIO VALUE</span><strong>{money(totalValue)}</strong><span className="summary-foot"><span className={totalPnl >= 0 ? 'positive' : 'negative'}>{totalPnl >= 0 ? '+' : ''}{money(totalPnl)}</span> all-time return</span></article>
            <article className="summary-item"><span className="summary-label">BUYING POWER</span><strong>{money(portfolio.cash)}</strong><span className="summary-foot">Available to trade</span></article>
            <article className="summary-item"><span className="summary-label">INVESTED</span><strong>{money(positionsValue)}</strong><span className="summary-foot">Across {holdings.length} positions</span></article>
            <article className="summary-item summary-note"><span className="summary-label">PAPER ACCOUNT</span><strong>$100,000 <span>START</span></strong><span className="summary-foot">Practice with simulated funds</span></article>
          </section>

          <div className="trading-grid">
            <section className="panel market-panel" id="markets">
              <div className="panel-heading"><div><p className="eyebrow">MARKET WATCH</p><h2>Today’s movers</h2></div><span className="live-label"><span className="status-dot" /> SIMULATED</span></div>
              <div className="watchlist">
                {assets.map((asset) => (
                  <button className={`watch-row ${selectedSymbol === asset.symbol ? 'active' : ''}`} key={asset.symbol} onClick={() => { setSelectedSymbol(asset.symbol); setNotice('') }} type="button">
                    <span className="ticker-badge" style={{ '--ticker-color': asset.color }}>{asset.symbol.slice(0, 1)}</span>
                    <span className="ticker-name"><strong>{asset.symbol}</strong><small>{asset.name}</small></span>
                    <span className="mini-chart"><svg viewBox="0 0 60 24" preserveAspectRatio="none" aria-hidden="true"><path d={asset.path} /></svg></span>
                    <span className="ticker-quote"><strong>{money(asset.price)}</strong><small className={asset.change >= 0 ? 'positive' : 'negative'}>{asset.change > 0 ? '+' : ''}{asset.change}%</small></span>
                  </button>
                ))}
              </div>
              <div className="market-footnote">Quotes are illustrative and do not reflect live market data.</div>
            </section>

            <section className="panel chart-panel">
              <div className="chart-topline"><div><p className="eyebrow">{selectedAsset.name.toUpperCase()}</p><h2>{selectedAsset.symbol} <span>· NASDAQ</span></h2></div><div className="quote-block"><strong>{money(selectedAsset.price)}</strong><span className={selectedAsset.change >= 0 ? 'positive' : 'negative'}>{selectedAsset.change > 0 ? '+' : ''}{selectedAsset.change}% today</span></div></div>
              <div className="chart-wrap">
                <div className="chart-values"><span>{money(selectedAsset.price + 5)}</span><span>{money(selectedAsset.price - 3)}</span><span>{money(selectedAsset.price - 11)}</span></div>
                <svg className={`price-chart ${selectedAsset.change < 0 ? 'chart-down' : ''}`} viewBox="0 0 600 190" preserveAspectRatio="none" role="img" aria-label={`${selectedAsset.symbol} illustrative price chart`}>
                  <defs><linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".19" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
                  <path className="chart-gridline" d="M0 24H600 M0 71H600 M0 118H600 M0 165H600" />
                  <path className="chart-area" d={`${selectedAsset.path.replaceAll(/(\d+)(\.\d+)?/g, (match, number, decimal = '') => `${Number(number) * (600 / 220)}${decimal}`)} L600 190 L0 190 Z`} />
                  <path className="chart-line" d={selectedAsset.path.replaceAll(/(\d+)(\.\d+)?/g, (match, number, decimal = '') => `${Number(number) * (600 / 220)}${decimal}`)} />
                </svg>
                <div className="chart-times"><span>09:30</span><span>11:00</span><span>12:30</span><span>14:00</span><span>16:00</span></div>
              </div>
              <div className="range-row" aria-label="Chart time range">{['1D', '1W', '1M', '3M', '1Y', 'ALL'].map((item) => <button className={range === item ? 'range-active' : ''} key={item} type="button" onClick={() => setRange(item)}>{item}</button>)}<span className="chart-caption">Illustrative performance</span></div>
            </section>

            <section className="panel order-panel">
              <div className="panel-heading"><div><p className="eyebrow">PLACE AN ORDER</p><h2>Trade {selectedAsset.symbol}</h2></div><span className="order-type">MARKET</span></div>
              <div className="side-switch" role="group" aria-label="Order side"><button className={side === 'BUY' ? 'buy-selected' : ''} type="button" onClick={() => { setSide('BUY'); setNotice('') }}>Buy</button><button className={side === 'SELL' ? 'sell-selected' : ''} type="button" onClick={() => { setSide('SELL'); setNotice('') }}>Sell</button></div>
              <form onSubmit={placeOrder}>
                <label className="field-label" htmlFor="quantity">SHARES</label>
                <div className="quantity-control"><button type="button" aria-label="Decrease shares" onClick={() => setQuantity(String(Math.max(1, Number(quantity || 1) - 1)))}>−</button><input id="quantity" type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} /><button type="button" aria-label="Increase shares" onClick={() => setQuantity(String(Number(quantity || 0) + 1))}>+</button></div>
                <div className="order-detail"><span>Market price</span><strong>{money(selectedAsset.price)}</strong></div>
                <div className="order-detail"><span>Estimated total</span><strong>{money((Number(quantity) || 0) * selectedAsset.price)}</strong></div>
                <div className="order-detail buying-power"><span>Buying power</span><strong>{money(portfolio.cash)}</strong></div>
                <button className={`submit-order ${side === 'SELL' ? 'submit-sell' : ''}`} type="submit">{side} {selectedAsset.symbol}<span>↗</span></button>
                <p className={`order-notice ${notice.startsWith('Not') || notice.startsWith('Enter') || notice.startsWith('You') ? 'notice-error' : ''}`} aria-live="polite">{notice || 'Orders execute instantly at the displayed price.'}</p>
              </form>
            </section>

            <section className="panel portfolio-panel" id="portfolio">
              <div className="panel-heading"><div><p className="eyebrow">YOUR POSITIONS</p><h2>Portfolio</h2></div><span className="position-count">{holdings.length} OPEN</span></div>
              <div className="table-scroll"><table><thead><tr><th>ASSET</th><th>SHARES</th><th>AVG. COST</th><th>MARK VALUE</th><th>RETURN</th></tr></thead><tbody>
                {holdings.length ? holdings.map(([symbol, position]) => {
                  const asset = assets.find((item) => item.symbol === symbol)
                  const pnl = (asset.price - position.averagePrice) * position.quantity
                  return <tr key={symbol}><td><button className="portfolio-ticker" type="button" onClick={() => setSelectedSymbol(symbol)}><span className="ticker-badge" style={{ '--ticker-color': asset.color }}>{symbol.slice(0, 1)}</span><strong>{symbol}</strong></button></td><td>{position.quantity}</td><td>{money(position.averagePrice)}</td><td>{money(asset.price * position.quantity)}</td><td className={pnl >= 0 ? 'positive' : 'negative'}>{pnl >= 0 ? '+' : ''}{money(pnl)}</td></tr>
                }) : <tr><td className="empty-state" colSpan="5">No positions yet. Place your first trade above.</td></tr>}
              </tbody></table></div>
            </section>

            <section className="panel activity-panel">
              <div className="panel-heading"><div><p className="eyebrow">RECENT ORDERS</p><h2>Activity</h2></div><span className="position-count">{portfolio.history.length} ORDERS</span></div>
              <div className="activity-list">{portfolio.history.slice(0, 5).map((order) => <div className="activity-row" key={order.id}><span className={`activity-icon ${order.side.toLowerCase()}`}>{order.side === 'BUY' ? '↓' : '↑'}</span><span className="activity-description"><strong>{order.side} {order.symbol}</strong><small>{order.quantity} shares · {money(order.price)}</small></span><time>{order.time}</time></div>)}</div>
            </section>
          </div>
          <footer className="disclaimer">Paperdesk is a trading simulator. Quotes and executions are simulated and are not investment advice.</footer>
        </div>
      </main>
    </div>
  )
}

export default App
