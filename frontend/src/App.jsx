import { api } from './lib/api.js'
import ModelChart from './components/ModelChart.jsx'
import { useEffect, useRef, useState } from 'react'
import './Aerorithmetic.css'

const assets = [
  { symbol: 'SOL', name: 'Solana', type: 'crypto' },
  { symbol: 'BTC', name: 'Bitcoin', type: 'crypto' },
  { symbol: 'ETH', name: 'Ethereum', type: 'crypto' },
  { symbol: 'BONK', name: 'Bonk', type: 'crypto' },
  { symbol: 'WIF', name: 'dogwifhat', type: 'crypto' },
  { symbol: 'AAPL', name: 'Apple', type: 'stock' },
  { symbol: 'MSFT', name: 'Microsoft', type: 'stock' },
  { symbol: 'NVDA', name: 'Nvidia', type: 'stock' },
  { symbol: 'AMZN', name: 'Amazon', type: 'stock' },
  { symbol: 'GOOGL', name: 'Alphabet', type: 'stock' },
  { symbol: 'META', name: 'Meta', type: 'stock' },
  { symbol: 'TSLA', name: 'Tesla', type: 'stock' },
  { symbol: 'JPM', name: 'JPMorgan Chase', type: 'stock' },
  { symbol: 'WMT', name: 'Walmart', type: 'stock' },
  { symbol: 'XOM', name: 'ExxonMobil', type: 'stock' },
  { symbol: 'UNH', name: 'UnitedHealth', type: 'stock' },
  { symbol: 'JNJ', name: 'Johnson & Johnson', type: 'stock' },
  { symbol: 'HD', name: 'Home Depot', type: 'stock' },
  { symbol: 'KO', name: 'Coca-Cola', type: 'stock' },
  { symbol: 'BAC', name: 'Bank of America', type: 'stock' },
  { symbol: 'COST', name: 'Costco', type: 'stock' },
  { symbol: 'DIS', name: 'Disney', type: 'stock' },
  { symbol: 'PFE', name: 'Pfizer', type: 'stock' },
  { symbol: 'EURUSD', name: 'Euro / US Dollar', type: 'forex' },
  { symbol: 'GBPUSD', name: 'Pound / US Dollar', type: 'forex' },
  { symbol: 'USDJPY', name: 'US Dollar / Yen', type: 'forex' },
  { symbol: 'AUDUSD', name: 'Aussie / US Dollar', type: 'forex' },
]

const navItems = [
  { id: 'trade', label: 'Trade', icon: '⌁' },
  { id: 'arena', label: 'The Arena', icon: '♧' },
  { id: 'lab', label: 'Model Lab', icon: '⚙' },
  { id: 'signals', label: 'Market Signals', icon: '⌖' },
  { id: 'portfolio', label: 'Portfolio', icon: '▤' },
]
const modelOptions = [
  { id: 'logreg', label: 'Logistic Regression' },
  { id: 'random_forest', label: 'Random Forest' },
  { id: 'lightgbm', label: 'LightGBM' },
]
const treeParams = [['n_estimators', 'Trees', 10, 1000, 10], ['max_depth', 'Max depth', 1, 20, 1]]
const modelParams = {
  logreg: [['C', 'Regularization C', 0.001, 100, 0.001]],
  random_forest: treeParams,
  lightgbm: [...treeParams, ['learning_rate', 'Learning rate', 0.001, 0.5, 0.001]],
}
const sharedParams = [['lookback', 'Lookback (candles)', 5, 200, 1], ['horizon', 'Forecast horizon (candles)', 1, 30, 1], ['threshold', 'Trade threshold', 0.5, 0.9, 0.01], ['fee_bps', 'Fee (bps)', 0, 100, 1]]
const chartRanges = [
  { id: '1D', candles: 24 },
  { id: '1W', candles: 24 * 7 },
  { id: '1M', candles: 24 * 30 },
  { id: '3M', candles: 24 * 90 },
  { id: '1Y', candles: 24 * 365 },
  { id: 'ALL', candles: Infinity },
]
// Enough decimals for sub-cent coins (BONK) and forex.
const priceDigits = (candles, type) => {
  const last = candles.at(-1)?.c
  if (type === 'forex') return 4
  return last < 0.01 ? 8 : last < 1 ? 4 : 2
}
const userId = (() => {
  try {
    const stored = localStorage.getItem('aerorithmetic-user-id')
    if (stored) return stored
    const created = `u_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`
    localStorage.setItem('aerorithmetic-user-id', created)
    return created
  } catch {
    return `u_${Date.now()}_${Math.random().toString(36).slice(2)}`
  }
})()
const money = (value, digits = 2) => Number.isFinite(Number(value))
  ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)
  : '—'
const percent = (value, multiply = false) => Number.isFinite(Number(value)) ? `${(multiply ? value * 100 : value).toFixed(2)}%` : '—'
const formatTime = (timestamp) => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(timestamp))
const loadReceipts = () => {
  try {
    return JSON.parse(localStorage.getItem('aerorithmetic-order-receipts')) || []
  } catch {
    return []
  }
}

function StatusMessage({ loading, error, empty, children }) {
  if (loading) return <div className="state-message"><span className="loader" /> Loading backend data…</div>
  if (error) return <div className="state-message state-error"><span className="state-icon">!</span><span>{error}</span></div>
  if (empty) return <div className="state-message">{empty}</div>
  return children || null
}

function App() {
  const [page, setPage] = useState('trade')
  const [aeroCursorEnabled, setAeroCursorEnabled] = useState(() => {
    try {
      const savedPreference = localStorage.getItem('aerorithmetic-aero-cursor')
      return savedPreference === null ? true : savedPreference === 'true'
    } catch {
      return true
    }
  })
  const [cursorImageLoaded, setCursorImageLoaded] = useState(false)
  const cursorImageRef = useRef(null)
  const [selectedSymbol, setSelectedSymbol] = useState('SOL')
  const [chartRange, setChartRange] = useState('1D')
  const [assetClass, setAssetClass] = useState('crypto')
  const [side, setSide] = useState('buy')
  const [quantity, setQuantity] = useState('1')
  const [portfolio, setPortfolio] = useState(null)
  const [portfolioLoading, setPortfolioLoading] = useState(true)
  const [portfolioError, setPortfolioError] = useState('')
  const [quote, setQuote] = useState(null)
  const [candles, setCandles] = useState([])
  const [marketLoading, setMarketLoading] = useState(true)
  const [marketError, setMarketError] = useState('')
  const [orderLoading, setOrderLoading] = useState(false)
  const [orderMessage, setOrderMessage] = useState('')
  const [receipts, setReceipts] = useState(loadReceipts)
  const [forecastEnabled, setForecastEnabled] = useState(false)
  const [trainedModels, setTrainedModels] = useState([])
  const [selectedModelId, setSelectedModelId] = useState('')
  const [forecast, setForecast] = useState(null)
  const [forecastOverlay, setForecastOverlay] = useState(null)
  const [candleSource, setCandleSource] = useState('')
  const [startTs, setStartTs] = useState(null)
  const [forecastLoading, setForecastLoading] = useState(false)
  const [leaderboard, setLeaderboard] = useState([])
  const [leaderboardLoading, setLeaderboardLoading] = useState(false)
  const [leaderboardError, setLeaderboardError] = useState('')
  const [news, setNews] = useState([])
  const [newsLoading, setNewsLoading] = useState(false)
  const [newsError, setNewsError] = useState('')
  const [modelType, setModelType] = useState('lightgbm')
  const [hyperparams, setHyperparams] = useState({ C: 1, n_estimators: 200, max_depth: 4, learning_rate: 0.05, lookback: 30, horizon: 5, threshold: 0.55, fee_bps: 10 })
  const [training, setTraining] = useState(false)
  const [trainingError, setTrainingError] = useState('')
  const [trainingResult, setTrainingResult] = useState(null)
  const selectedAsset = assets.find((asset) => asset.symbol === selectedSymbol)
  const digits = priceDigits(candles, selectedAsset?.type)
  // Model Lab start: the user's pick, or 80% of the way through the history by default.
  const labStartTs = startTs ?? (candles.length ? candles[Math.floor(candles.length * 0.8)].ts : null)
  const openPositions = portfolio?.positions || []
  const buyingPower = portfolio?.cash ?? null
  const holdingsValue = portfolio ? portfolio.equity - portfolio.cash : null
  const newsSentiment = news.length ? news.reduce((sum, item) => sum + Number(item.sentiment || 0), 0) / news.length : null
  const chartCandleLimit = chartRanges.find((range) => range.id === chartRange)?.candles ?? Infinity
  const displayedCandles = Number.isFinite(chartCandleLimit) ? candles.slice(-chartCandleLimit) : candles

  useEffect(() => {
    const root = document.documentElement
    const cursorImage = cursorImageRef.current
    root.classList.remove('aero-custom-cursor-active')
    if (cursorImage) cursorImage.style.visibility = 'hidden'

    if (!aeroCursorEnabled || !cursorImageLoaded || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return undefined

    function hideCustomCursor() {
      root.classList.remove('aero-custom-cursor-active')
      if (cursorImageRef.current) cursorImageRef.current.style.visibility = 'hidden'
    }

    function moveCustomCursor(event) {
      if (event.pointerType !== 'mouse') {
        hideCustomCursor()
        return
      }

      if (event.target instanceof Element && event.target.closest('input:not([type="button"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea, [contenteditable="true"]')) {
        hideCustomCursor()
        return
      }

      const image = cursorImageRef.current
      if (!image || !cursorImageLoaded) return
      image.style.transform = `translate3d(${event.clientX - 6}px, ${event.clientY - 2}px, 0)`
      image.style.visibility = 'visible'
      root.classList.add('aero-custom-cursor-active')
    }

    function handlePointerOut(event) {
      if (!event.relatedTarget) hideCustomCursor()
    }

    document.addEventListener('pointermove', moveCustomCursor, { passive: true })
    document.addEventListener('pointerout', handlePointerOut)
    window.addEventListener('blur', hideCustomCursor)
    return () => {
      document.removeEventListener('pointermove', moveCustomCursor)
      document.removeEventListener('pointerout', handlePointerOut)
      window.removeEventListener('blur', hideCustomCursor)
      hideCustomCursor()
    }
  }, [aeroCursorEnabled, cursorImageLoaded])

  useEffect(() => {
    let active = true
    api.portfolio(userId).then((data) => {
      if (active) { setPortfolio(data); setPortfolioError('') }
    }).catch((error) => { if (active) setPortfolioError(error.message) }).finally(() => { if (active) setPortfolioLoading(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    const requestTimer = setTimeout(() => {
      setMarketLoading(true)
      setMarketError('')
      setQuote(null)
      setCandles([])
      Promise.all([api.price(selectedSymbol), api.history(selectedSymbol, 5000)]).then(([nextQuote, history]) => {
        if (active) { setQuote(nextQuote); setCandles(history.candles); setCandleSource(history.source); setMarketError('') }
      }).catch((error) => { if (active) setMarketError(error.message) }).finally(() => { if (active) setMarketLoading(false) })
    }, 0)
    return () => { active = false; clearTimeout(requestTimer) }
  }, [selectedSymbol])

  useEffect(() => {
    if (page !== 'arena' || leaderboard.length) return
    let active = true
    Promise.resolve().then(() => {
      setLeaderboardLoading(true)
      setLeaderboardError('')
      return api.leaderboard(20)
    }).then((rows) => { if (active) setLeaderboard(rows) })
      .catch((error) => { if (active) setLeaderboardError(error.message) })
      .finally(() => { if (active) setLeaderboardLoading(false) })
    return () => { active = false }
  }, [page, leaderboard.length])

  useEffect(() => {
    if (page !== 'signals') return
    let active = true
    Promise.resolve().then(() => {
      setNewsLoading(true)
      setNewsError('')
      return api.news(selectedSymbol, 20)
    }).then((items) => { if (active) setNews(items) })
      .catch((error) => { if (active) setNewsError(error.message) })
      .finally(() => { if (active) setNewsLoading(false) })
    return () => { active = false }
  }, [page, selectedSymbol])

  useEffect(() => {
    if (!forecastEnabled || !selectedModelId) return
    let active = true
    const requestTimer = setTimeout(() => {
      setForecastLoading(true)
      Promise.all([api.predict(selectedModelId), api.overlay(selectedModelId)]).then(([result, modelOverlay]) => {
        if (!active) return
        if (result.symbol !== selectedSymbol) {
          setForecast(null)
          setForecastOverlay(null)
          setOrderMessage(`The selected model returned ${result.symbol}; choose a model trained for ${selectedSymbol}.`)
          return
        }
        setForecast(result)
        setForecastOverlay(modelOverlay)
      })
        .catch((error) => { if (active) { setForecast(null); setForecastOverlay(null); setOrderMessage(error.message) } })
        .finally(() => { if (active) setForecastLoading(false) })
    }, 0)
    return () => { active = false; clearTimeout(requestTimer) }
  }, [forecastEnabled, selectedModelId, selectedSymbol])

  async function refreshPortfolio() {
    setPortfolioLoading(true)
    setPortfolioError('')
    try { setPortfolio(await api.portfolio(userId)) }
    catch (error) { setPortfolioError(error.message) }
    finally { setPortfolioLoading(false) }
  }

  async function placeOrder(event) {
    event.preventDefault()
    const amount = Number(quantity)
    if (!Number.isFinite(amount) || amount <= 0) { setOrderMessage('Enter a quantity greater than zero.'); return }
    if (!quote) { setOrderMessage('A backend price is required before placing an order.'); return }
    setOrderLoading(true)
    setOrderMessage('')
    try {
      const result = await api.order({ user_id: userId, symbol: selectedSymbol, side, qty: amount })
      const receipt = { ...result, symbol: selectedSymbol, side, qty: amount, localTime: Date.now() }
      setReceipts((current) => {
        const next = [receipt, ...current].slice(0, 20)
        localStorage.setItem('aerorithmetic-order-receipts', JSON.stringify(next))
        return next
      })
      setOrderMessage(`${side === 'buy' ? 'Bought' : 'Sold'} ${amount} ${selectedSymbol} at ${money(result.fill_price)}.`)
      await refreshPortfolio()
    } catch (error) { setOrderMessage(error.message) }
    finally { setOrderLoading(false) }
  }

  async function trainModel(event, start = labStartTs) {
    event?.preventDefault()
    setTraining(true)
    setTrainingError('')
    try {
      const result = await api.train({ symbol: selectedSymbol, model_type: modelType, hyperparams: { ...hyperparams, start_ts: start } })
      setTrainingResult(result)
      const model = { id: result.model_id, type: modelType, symbol: selectedSymbol, createdAt: Date.now() }
      setTrainedModels((current) => [model, ...current.filter((item) => item.id !== model.id)])
      setSelectedModelId(result.model_id)
      setForecastEnabled(true)
    } catch (error) { setTrainingError(error.message) }
    finally { setTraining(false) }
  }

  function changeAssetClass(nextClass) {
    setAssetClass(nextClass)
    const firstAsset = assets.find((asset) => asset.type === nextClass)
    if (firstAsset) selectAsset(firstAsset.symbol)
  }

  // Moving the start retrains right away if a model is already showing (training takes under a second).
  function changeStart(ts) {
    setStartTs(ts)
    if (trainingResult) trainModel(null, ts)
  }

  function selectAsset(symbol) {
    setSelectedSymbol(symbol)
    setTrainingResult(null)
    setStartTs(null)
    setForecastOverlay(null)
    const asset = assets.find((item) => item.symbol === symbol)
    if (asset) setAssetClass(asset.type)
    setMarketLoading(true)
    setMarketError('')
    setQuote(null)
    setCandles([])
    setForecast(null)
    setForecastEnabled(false)
    setSelectedModelId('')
  }

  function updateHyperparam(name, value) {
    setHyperparams((current) => ({ ...current, [name]: Number(value) }))
  }

  return (
    <div className="aero-app">
      <aside className="side-nav">
        <a className="brand" href="#trade" onClick={(event) => { event.preventDefault(); setPage('trade') }} aria-label="Aerorithmetic home">
          <span className="brand-glyph">a<span>+</span></span><span className="brand-name">aerorithmetic</span><small>Make cents of the future.</small>
        </a>
        <div className="nav-caption">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {navItems.map((item) => <button className={`nav-item ${page === item.id ? 'nav-active' : ''}`} key={item.id} type="button" onClick={() => setPage(item.id)}><span className="nav-icon">{item.icon}</span><span>{item.label}</span>{page === item.id && <i />}</button>)}
        </nav>
        <div className="nav-bottom">
          <div className="api-status"><span className="api-led" /><span>API connection</span><strong className={portfolioError || marketError ? 'api-offline' : ''}>{portfolioError || marketError ? 'Check' : 'Ready'}</strong></div>
          <button
            className="cursor-toggle"
            type="button"
            aria-pressed={aeroCursorEnabled}
            onClick={() => {
              const enabled = !aeroCursorEnabled
              if (!enabled) document.documentElement.classList.remove('aero-custom-cursor-active')
              if (cursorImageRef.current) cursorImageRef.current.style.visibility = 'hidden'
              setAeroCursorEnabled(enabled)
              try {
                localStorage.setItem('aerorithmetic-aero-cursor', String(enabled))
              } catch {
                // Cursor preference remains available for this session.
              }
            }}
          >
            <span>Aero Cursor</span><span className={`cursor-switch ${aeroCursorEnabled ? 'switch-on' : ''}`} aria-hidden="true"><i /></span><strong>{aeroCursorEnabled ? 'ON' : 'OFF'}</strong>
          </button>
        </div>
      </aside>

      <main className="main-shell">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><b>/</b><strong>{navItems.find((item) => item.id === page)?.label}</strong></div>
          <div className="topbar-right"><span className="market-pill"><i /> Simulator</span><button className="user-chip" type="button" title={`Backend user ${userId}`}><span>U</span><b>Demo account</b></button></div>
        </header>

        <div className="page-body">
          {page === 'trade' && <>
            <div className="page-title-row"><div><p className="kicker">TRADE DESK <span>·</span> PAPER MARKETS</p><h1>Make your next move.</h1><p className="page-subtitle">Build conviction before you put capital on the line.</p></div><div className="account-value"><span>ACCOUNT EQUITY</span><strong>{portfolio ? money(portfolio.equity) : '—'}</strong><small>{portfolio ? `${percent(portfolio.pnl_pct, true)} total return` : 'Waiting for account data'}</small></div></div>
            <section className="summary-strip" aria-label="Portfolio summary">
              <div className="summary-cell"><span>Cash available</span><strong>{buyingPower === null ? '—' : money(buyingPower)}</strong><small>Backend buying power</small></div>
              <div className="summary-cell"><span>Invested value</span><strong>{holdingsValue === null ? '—' : money(holdingsValue)}</strong><small>{openPositions.length} open positions</small></div>
              <div className="summary-cell"><span>Total return</span><strong className={portfolio?.pnl >= 0 ? 'positive' : 'negative'}>{portfolio ? `${portfolio.pnl >= 0 ? '+' : ''}${money(portfolio.pnl)}` : '—'}</strong><small>{portfolio ? percent(portfolio.pnl_pct, true) : 'From starting equity'}</small></div>
              <div className="summary-mark"><span className="sparkle">✳</span><span>Simulation account</span><small>Starting capital $100,000</small></div>
            </section>

            <div className="trade-layout">
              <section className="glass-panel chart-panel-main">
                <div className="section-heading"><div><p className="kicker">MARKET OVERVIEW</p><h2>Price action</h2></div><div className="class-switch" aria-label="Asset class">{['stock', 'crypto', 'forex'].map((kind) => <button className={assetClass === kind ? 'class-selected' : ''} key={kind} type="button" onClick={() => changeAssetClass(kind)}>{kind === 'stock' ? 'Stocks' : kind === 'crypto' ? 'Crypto' : 'Forex'}</button>)}</div></div>
                <div className="symbol-line">
                  <label className="symbol-select"><i aria-hidden="true">{selectedSymbol.slice(0, 1)}</i><select aria-label="Select asset" value={selectedSymbol} onChange={(event) => selectAsset(event.target.value)}>{assets.filter((asset) => asset.type === assetClass).map((asset) => <option key={asset.symbol} value={asset.symbol}>{asset.symbol} · {asset.name}</option>)}</select><span>⌄</span></label>
                  <div className="live-quote"><strong>{quote ? money(quote.price, selectedAsset?.type === 'forex' ? 4 : 2) : '—'}</strong><span>{quote ? `Backend sample · ${formatTime(quote.ts)}` : 'API quote'}</span></div>
                  <div className="chart-ranges" aria-label="Chart range">{chartRanges.map((range) => <button className={chartRange === range.id ? 'range-active' : ''} key={range.id} type="button" onClick={() => setChartRange(range.id)}>{range.id}</button>)}</div>
                </div>
                <StatusMessage loading={marketLoading} error={marketError} />
                {!marketLoading && !marketError && <>
                  <ModelChart candles={displayedCandles} overlay={forecastEnabled && forecast ? forecastOverlay : null} digits={digits} />
                  <div className="chart-legend"><span><i className="legend-history" /> Hourly price <small>{candleSource === 'synthetic' ? 'synthetic data (history unavailable)' : `${candleSource} history`}</small></span>{forecastEnabled && forecastOverlay && <><span><i className="legend-model" /> Model <small>your money if you followed it</small></span><span><i className="legend-swatch" style={{ background: 'rgba(25, 135, 106, .35)' }} /> Long</span><span><i className="legend-swatch" style={{ background: 'rgba(201, 92, 81, .35)' }} /> Short</span></>}</div>
                </>}
                <div className="forecast-tools"><label className="toggle-control"><input type="checkbox" checked={forecastEnabled} onChange={(event) => { setForecastEnabled(event.target.checked); if (!event.target.checked) setForecast(null) }} /><span className="toggle-track" /><b>AI forecast</b></label><select aria-label="Select trained model" value={selectedModelId} onChange={(event) => { setSelectedModelId(event.target.value); setForecast(null); setForecastEnabled(Boolean(event.target.value)) }}><option value="">Select trained model</option>{trainedModels.filter((model) => model.symbol === selectedSymbol).map((model) => <option key={model.id} value={model.id}>{model.type.replace('_', ' ')} · {model.symbol} · {model.id}</option>)}</select><button className="text-action" type="button" onClick={() => setPage('lab')}>Train model <span>↗</span></button></div>
                {forecastEnabled && <p className="forecast-note">{forecastLoading ? 'Loading prediction…' : forecast ? `Next ${forecast.horizon_candles} candles: ${forecast.direction} (${(Number(forecast.confidence) * 100).toFixed(0)}% confident). From its start, shading shows the position the model held on each candle and the orange line shows your money if you had followed it${forecastOverlay?.trained_through_ts < candles.at(-1)?.ts ? '; candles after "Live" were never seen in training' : ''}.` : 'Train a model in Model Lab, then select it to see how it trades on this chart.'}</p>}
              </section>

              <section className="glass-panel order-panel-main">
                <div className="section-heading"><div><p className="kicker">PAPER ORDER</p><h2>Place a trade</h2></div><span className="market-order-label">MARKET</span></div>
                <div className="order-switch"><button className={side === 'buy' ? 'buy-active' : ''} type="button" onClick={() => { setSide('buy'); setOrderMessage('') }}>Buy</button><button className={side === 'sell' ? 'sell-active' : ''} type="button" onClick={() => { setSide('sell'); setOrderMessage('') }}>Sell</button></div>
                <form className="order-form" onSubmit={placeOrder}>
                  <label htmlFor="order-qty">Quantity <span>fractional allowed</span></label>
                  <input id="order-qty" type="number" min="0.000001" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
                  <div className="order-estimate"><span>Asset</span><b>{selectedSymbol}</b></div><div className="order-estimate"><span>Backend price</span><b>{quote ? money(quote.price) : '—'}</b></div><div className="order-estimate estimate-total"><span>Estimated total</span><b>{quote ? money(Number(quantity || 0) * quote.price) : '—'}</b></div>
                  <button className={`place-order ${side === 'sell' ? 'place-sell' : ''}`} type="submit" disabled={orderLoading || !quote}>{orderLoading ? 'Submitting order…' : `${side === 'buy' ? 'Buy' : 'Sell'} ${selectedSymbol}`}<span>↗</span></button>
                  <p className="order-feedback" aria-live="polite">{orderMessage || (portfolioLoading ? 'Loading buying power…' : portfolioError || `Buying power ${buyingPower === null ? '—' : money(buyingPower)}`)}</p>
                </form>
              </section>

              <section className="glass-panel positions-panel">
                <div className="section-heading"><div><p className="kicker">ACCOUNT HOLDINGS</p><h2>Your positions</h2></div><button className="text-action" type="button" onClick={() => setPage('portfolio')}>View portfolio <span>↗</span></button></div>
                <StatusMessage loading={portfolioLoading} error={portfolioError} empty={!openPositions.length && portfolio ? 'No open positions yet. Place an order to begin.' : null}>
                  <div className="table-scroll"><table><thead><tr><th>Asset</th><th>Shares</th><th>Avg. cost</th><th>Market value</th><th>Unrealized P/L</th></tr></thead><tbody>{openPositions.map((position) => <tr key={position.symbol}><td><button className="table-asset" type="button" onClick={() => { selectAsset(position.symbol); setPage('trade') }}><span className="asset-token">{position.symbol.slice(0, 1)}</span><b>{position.symbol}</b></button></td><td>{Number(position.qty).toLocaleString('en-US')}</td><td>{money(position.avg_price)}</td><td>{money(position.last_price * position.qty)}</td><td className={position.unrealized_pnl >= 0 ? 'positive' : 'negative'}>{position.unrealized_pnl >= 0 ? '+' : ''}{money(position.unrealized_pnl)}</td></tr>)}</tbody></table></div>
                </StatusMessage>
              </section>
            </div>
          </>}

          {page === 'arena' && <>
            <div className="page-title-row"><div><p className="kicker">HUMAN VS. MACHINE</p><h1>The Arena</h1><p className="page-subtitle">Compare trader performance from the leaderboard API.</p></div><span className="soft-badge">{leaderboardLoading ? 'CONNECTING' : leaderboardError ? 'API OFFLINE' : leaderboard.length ? 'BACKEND SAMPLE' : 'NO DATA'}</span></div>
            <section className="glass-panel arena-panel"><div className="section-heading"><div><p className="kicker">LEADERBOARD</p><h2>Performance rankings</h2></div><span className="muted-label">Ranked by equity return</span></div><StatusMessage loading={leaderboardLoading} error={leaderboardError} empty={!leaderboard.length && !leaderboardLoading ? 'The backend has no leaderboard entries yet.' : null}><div className="leaderboard-table-wrap"><table className="leaderboard-table"><thead><tr><th>Rank</th><th>Trader</th><th>Type</th><th>Equity</th><th>Return</th><th>Comparison</th></tr></thead><tbody>{leaderboard.map((row) => <tr key={`${row.rank}-${row.name}`}><td><span className={`rank-number ${row.rank === 1 ? 'rank-first' : ''}`}>{String(row.rank).padStart(2, '0')}</span></td><td><span className="leader-name"><span className={`leader-avatar ${row.is_bot ? 'bot-avatar' : ''}`}>{row.is_bot ? 'AI' : row.name.slice(0, 1).toUpperCase()}</span><b>{row.name}</b></span></td><td><span className={`identity-pill ${row.is_bot ? 'identity-ai' : ''}`}>{row.is_bot ? 'AI model' : 'Human'}</span></td><td>{money(row.equity)}</td><td className={row.pnl_pct >= 0 ? 'positive' : 'negative'}>{row.pnl_pct >= 0 ? '+' : ''}{percent(row.pnl_pct)}</td><td><div className="return-track"><i style={{ width: `${Math.max(2, Math.min(100, Math.abs(row.pnl_pct) * 10))}%` }} className={row.pnl_pct < 0 ? 'track-negative' : ''} /></div></td></tr>)}</tbody></table></div><div className="arena-footnote">The backend currently returns sample rankings and only equity and return metrics.</div></StatusMessage></section>
            <section className="arena-summary-grid">{leaderboard.slice(0, 2).map((row) => <article className="glass-panel arena-stat" key={row.name}><span className="identity-pill">{row.is_bot ? 'AI MODEL' : 'HUMAN TRADER'}</span><h2>{row.name}</h2><strong className={row.pnl_pct >= 0 ? 'positive' : 'negative'}>{row.pnl_pct >= 0 ? '+' : ''}{percent(row.pnl_pct)}</strong><small>{money(row.equity)} equity · Rank #{row.rank}</small></article>)}</section>
          </>}

          {page === 'lab' && <>
            <div className="page-title-row"><div><p className="kicker">TRAIN. TEST. COMPETE.</p><h1>Model Lab</h1><p className="page-subtitle">Configure a supported model and run it through the backend training endpoint.</p></div><span className="soft-badge">3 SUPPORTED MODELS</span></div>
            <div className="lab-layout"><section className="glass-panel model-config"><div className="section-heading"><div><p className="kicker">CONFIGURATION</p><h2>Model parameters</h2></div></div><form onSubmit={trainModel}><label className="form-label" htmlFor="model-type">Model type</label><select id="model-type" value={modelType} onChange={(event) => setModelType(event.target.value)}>{modelOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select><label className="form-label" htmlFor="model-symbol">Training asset</label><select id="model-symbol" value={selectedSymbol} onChange={(event) => selectAsset(event.target.value)}>{assets.map((asset) => <option key={asset.symbol} value={asset.symbol}>{asset.symbol} · {asset.name}</option>)}</select><div className="parameter-grid">{[...modelParams[modelType], ...sharedParams].map(([key, label, min, max, step]) => <label className="parameter-field" key={key}><span>{label}</span><input type="number" min={min} max={max} step={step} value={hyperparams[key]} onChange={(event) => updateHyperparam(key, event.target.value)} /></label>)}</div><button className="primary-action" type="submit" disabled={training}>{training ? 'Training with backend…' : 'Train and backtest'}<span>✳</span></button>{trainingError && <p className="inline-error" role="alert">{trainingError}</p>}</form></section>
              <section className="glass-panel results-panel"><div className="section-heading"><div><p className="kicker">BACKTEST OUTPUT</p><h2>Model results</h2></div>{trainingResult && <span className="soft-badge">{trainingResult.data_source?.toUpperCase()} DATA · {trainingResult.model_id}</span>}</div>{!trainingResult ? <div className="empty-results"><span className="result-glyph">⌁</span><p>Train a model to see backend-reported metrics and backtest results here.</p></div> : <><div className="metrics-grid"><div><span>Accuracy</span><strong>{percent(trainingResult.metrics?.accuracy, true)}</strong></div><div><span>Precision</span><strong>{percent(trainingResult.metrics?.precision, true)}</strong></div><div><span>Sharpe ratio</span><strong>{trainingResult.backtest?.sharpe ?? '—'}</strong></div><div><span>Max drawdown</span><strong>{percent(trainingResult.backtest?.max_drawdown, true)}</strong></div><div><span>Return</span><strong className={trainingResult.backtest?.total_return >= 0 ? 'positive' : 'negative'}>{percent(trainingResult.backtest?.total_return, true)}</strong></div><div><span>Baseline</span><strong>{percent(Math.max(trainingResult.metrics?.baseline_always_up, 1 - trainingResult.metrics?.baseline_always_up), true)}</strong></div><div><span>Training time</span><strong>{trainingResult.train_seconds ? `${Number(trainingResult.train_seconds).toFixed(1)}s` : '—'}</strong></div></div><p className="forecast-note">{trainingResult.metrics?.accuracy > Math.max(trainingResult.metrics?.baseline_always_up, 1 - trainingResult.metrics?.baseline_always_up) ? 'Accuracy beats always guessing the more common direction' : 'Accuracy does not beat always guessing the more common direction'}, on {trainingResult.metrics?.n_test?.toLocaleString()} candles the model never trained on. Neighboring forecasts overlap, so small edges are often noise.</p></>}</section>
            </div>
            <section className="glass-panel">
              <div className="section-heading"><div><p className="kicker">BACKTEST ON THE CHART</p><h2>When does the model start trading?</h2></div></div>
              {candles.length ? <ModelChart candles={candles} overlay={trainingResult} startTs={labStartTs} onStartChange={changeStart} digits={digits} /> : <StatusMessage loading={marketLoading} error={marketError} />}
              <div className="chart-legend"><span>Drag the slider or click the chart. The model learns from everything before the start, then trades from there on.</span>{trainingResult && <><span><i className="legend-model" /> Model</span><span><i className="legend-swatch" style={{ background: 'rgba(25, 135, 106, .35)' }} /> Long</span><span><i className="legend-swatch" style={{ background: 'rgba(201, 92, 81, .35)' }} /> Short</span></>}</div>
            </section>
            <section className="glass-panel supported-models"><p className="kicker">AVAILABLE THROUGH THE API</p><div>{modelOptions.map((model) => <span key={model.id}>{model.label}<i>✓</i></span>)}</div></section>
          </>}

          {page === 'signals' && <>
            <div className="page-title-row"><div><p className="kicker">NEWS. SENTIMENT. OPPORTUNITY.</p><h1>Market Signals</h1><p className="page-subtitle">Stories and sentiment returned by the configured news feed.</p></div><label className="symbol-select signals-select"><select aria-label="News asset" value={selectedSymbol} onChange={(event) => selectAsset(event.target.value)}>{assets.map((asset) => <option key={asset.symbol} value={asset.symbol}>{asset.symbol}</option>)}</select><span>⌄</span></label></div>
            <div className="signals-layout"><section className="glass-panel news-panel"><div className="section-heading"><div><p className="kicker">LATEST COVERAGE</p><h2>{selectedSymbol} news</h2></div><span className="soft-badge">BACKEND SAMPLE FEED</span></div><StatusMessage loading={newsLoading} error={newsError} empty={!news.length && !newsLoading ? 'No news items were returned for this asset.' : null}>{news.map((item, index) => <article className="news-item" key={`${item.ts}-${index}`}><div className="news-meta"><span>{item.source}</span><time>{item.ts ? formatTime(item.ts) : 'Time unavailable'}</time></div><a href={item.url} target="_blank" rel="noreferrer"><h3>{item.headline}</h3></a><p>{item.summary}</p><div className="news-bottom"><span>{item.symbol}</span><span className={`sentiment-tag ${Number(item.sentiment) >= 0 ? 'sentiment-positive' : 'sentiment-negative'}`}>Sentiment {Number(item.sentiment) > 0 ? '+' : ''}{Number(item.sentiment).toFixed(2)}</span></div></article>)}</StatusMessage></section><aside className="glass-panel insight-panel"><p className="kicker">AI INSIGHT</p><h2>{selectedSymbol}</h2><div className="sentiment-score">{newsSentiment === null ? '—' : `${newsSentiment > 0 ? '+' : ''}${newsSentiment.toFixed(2)}`}</div><span className="muted-label">Mean news sentiment</span><div className="sentiment-meter"><i style={{ width: `${newsSentiment === null ? 0 : Math.max(0, Math.min(100, (newsSentiment + 1) * 50))}%` }} /></div><p className="insight-copy">{news.length ? 'The current backend news route returns example feed data; sentiment is computed from that response. Not a trading recommendation.' : 'Sentiment becomes available when the news API returns scored items.'}</p></aside></div>
          </>}

          {page === 'portfolio' && <>
            <div className="page-title-row"><div><p className="kicker">YOUR PAPER ACCOUNT</p><h1>Portfolio</h1><p className="page-subtitle">Balances and positions are read directly from your backend account.</p></div><button className="secondary-action" type="button" onClick={refreshPortfolio} disabled={portfolioLoading}>{portfolioLoading ? 'Refreshing…' : 'Refresh account'}↻</button></div>
            <section className="summary-strip portfolio-summary"><div className="summary-cell"><span>Account equity</span><strong>{portfolio ? money(portfolio.equity) : '—'}</strong><small>Total account value</small></div><div className="summary-cell"><span>Cash balance</span><strong>{portfolio ? money(portfolio.cash) : '—'}</strong><small>Available buying power</small></div><div className="summary-cell"><span>Total return</span><strong className={portfolio?.pnl >= 0 ? 'positive' : 'negative'}>{portfolio ? `${portfolio.pnl >= 0 ? '+' : ''}${money(portfolio.pnl)}` : '—'}</strong><small>{portfolio ? percent(portfolio.pnl_pct, true) : 'Since account start'}</small></div></section>
            <section className="glass-panel full-positions"><div className="section-heading"><div><p className="kicker">MARK-TO-MARKET</p><h2>Open positions</h2></div><span className="muted-label">{openPositions.length} assets</span></div><StatusMessage loading={portfolioLoading} error={portfolioError} empty={!openPositions.length && portfolio ? 'No open positions in this account.' : null}><div className="table-scroll"><table><thead><tr><th>Asset</th><th>Quantity</th><th>Average price</th><th>Last price</th><th>Market value</th><th>Unrealized P/L</th></tr></thead><tbody>{openPositions.map((position) => <tr key={position.symbol}><td><button className="table-asset" type="button" onClick={() => { selectAsset(position.symbol); setPage('trade') }}><span className="asset-token">{position.symbol.slice(0, 1)}</span><b>{position.symbol}</b></button></td><td>{Number(position.qty).toLocaleString('en-US')}</td><td>{money(position.avg_price)}</td><td>{money(position.last_price)}</td><td>{money(position.last_price * position.qty)}</td><td className={position.unrealized_pnl >= 0 ? 'positive' : 'negative'}>{position.unrealized_pnl >= 0 ? '+' : ''}{money(position.unrealized_pnl)}</td></tr>)}</tbody></table></div></StatusMessage></section>
            <section className="glass-panel receipts-panel"><div className="section-heading"><div><p className="kicker">LOCAL ORDER RECEIPTS</p><h2>Recent orders</h2></div><span className="muted-label">Successful backend responses saved in this browser</span></div>{receipts.length ? <div className="receipt-list">{receipts.map((receipt) => <div className="receipt-row" key={receipt.order_id}><span className={`receipt-side ${receipt.side}`}>{receipt.side.toUpperCase()}</span><b>{receipt.symbol}</b><span>{receipt.qty} units</span><span>{money(receipt.fill_price)}</span><span>{receipt.status}</span><time>{formatTime(receipt.ts)}</time></div>)}</div> : <div className="empty-results compact-empty">No successful orders recorded in this browser yet.</div>}</section>
          </>}
          <footer className="page-footer"><span>AERORITHMETIC <b>·</b> MAKE CENTS OF THE FUTURE.</span><span>Practice only. Not investment advice.</span></footer>
        </div>
      </main>
      <img
        ref={cursorImageRef}
        className="aero-cursor-image"
        src="/images/cursor-transparent.png"
        alt=""
        aria-hidden="true"
        draggable="false"
        onLoad={() => setCursorImageLoaded(true)}
        onError={() => setCursorImageLoaded(false)}
      />
    </div>
  )
}

export default App
