import { useEffect, useRef, useState } from 'react'
import { CandlestickSeries, HistogramSeries, LineSeries, createChart, createSeriesMarkers } from 'lightweight-charts'
import './ModelChart.css'

// Price candles with a trained model drawn on top, from the model's start onward:
//  - shading: the position the model holds on each candle (long, short, or out)
//  - orange line: your money if you followed it, in price units, so it starts on
//    the start candle's close and compares directly with the price (buy & hold)
// With onStartChange, a slider (or a click on the chart) picks when the model starts;
// everything before the start is shaded as the training period.
//
// candles: [{ ts, o, h, l, c }] (ms timestamps)
// overlay: { start_ts, threshold, predictions: [{ ts, p_up }], backtest: { equity_curve },
//            trained_through_ts } from /models/train or /models/{id}/overlay

const COLORS = {
  up: '#19876a', down: '#c95c51', model: '#f27b35', text: '#71899a', grid: 'rgba(116, 169, 194, .16)',
  bandUp: 'rgba(25, 135, 106, .13)', bandDown: 'rgba(201, 92, 81, .13)', start: '#178f9d',
}

export default function ModelChart({ candles, overlay, startTs, onStartChange, digits = 2 }) {
  const box = useRef(null)
  const shade = useRef(null)
  const parts = useRef(null)
  const latest = useRef({})
  const [dragIndex, setDragIndex] = useState(null)

  const times = candles.map((candle) => candle.ts / 1000)
  const startIndex = startTs == null ? -1 : times.findIndex((time) => time >= startTs / 1000)
  const shownIndex = dragIndex ?? startIndex
  // The chart's click handler is registered once, so it reads the newest props from here.
  useEffect(() => { latest.current = { times, onStartChange } })

  // Create the chart once.
  useEffect(() => {
    const chart = createChart(box.current, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: COLORS.text, fontSize: 10, attributionLogo: false },
      grid: { vertLines: { color: COLORS.grid }, horzLines: { color: COLORS.grid } },
      rightPriceScale: { borderColor: COLORS.grid },
      // Small minBarSpacing so thousands of hourly candles fit on screen.
      timeScale: { borderColor: COLORS.grid, timeVisible: true, minBarSpacing: 0.01 },
    })
    // Bands first so they sit behind the candles, full height on their own 0..1 scale.
    const bands = chart.addSeries(HistogramSeries, {
      priceScaleId: 'bands', priceLineVisible: false, lastValueVisible: false,
      autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 1 } }),
    })
    chart.priceScale('bands').applyOptions({ scaleMargins: { top: 0, bottom: 0 }, visible: false })
    const price = chart.addSeries(CandlestickSeries, {
      upColor: COLORS.up, downColor: COLORS.down, borderVisible: false,
      wickUpColor: COLORS.up, wickDownColor: COLORS.down,
    })
    const model = chart.addSeries(LineSeries, { color: COLORS.model, lineWidth: 2, priceLineVisible: false, title: 'Model' })
    const markers = createSeriesMarkers(price, [])
    chart.subscribeClick((param) => {
      const { times: t, onStartChange: change } = latest.current
      if (!change || param.time === undefined) return
      const i = t.findIndex((time) => time >= param.time)
      if (i >= 0) change(t[i] * 1000)
    })
    parts.current = { chart, bands, price, model, markers }
    return () => { chart.remove(); parts.current = null }
  }, [])

  // Candles.
  useEffect(() => {
    const p = parts.current
    p.price.applyOptions({ priceFormat: { type: 'price', precision: digits, minMove: 10 ** -digits } })
    p.price.setData(candles.map((c) => ({ time: c.ts / 1000, open: c.o, high: c.h, low: c.l, close: c.c })))
    p.chart.timeScale().fitContent()
  }, [candles, digits])

  // Model overlay. Every series gets the candles' exact timestamps, with empty
  // (whitespace) points outside the overlay: series covering only part of the
  // range make lightweight-charts misplace the time axis.
  useEffect(() => {
    const p = parts.current
    const t = candles.map((candle) => candle.ts / 1000)
    const index = new Map(t.map((time, i) => [time, i]))
    const bandAt = new Map()
    const modelAt = new Map()
    const i0 = overlay ? index.get(overlay.start_ts / 1000) : undefined
    if (overlay && i0 !== undefined) {
      const threshold = overlay.threshold ?? 0.55
      for (const pred of overlay.predictions || []) {
        const i = index.get(pred.ts / 1000)
        if (i === undefined || i + 1 >= t.length) continue
        // The bet made at candle i's close plays out over candle i+1.
        const color = pred.p_up > threshold ? COLORS.bandUp : pred.p_up < 1 - threshold ? COLORS.bandDown : 'transparent'
        bandAt.set(t[i + 1], color)
      }
      const p0 = candles[i0].c
      modelAt.set(t[i0], p0)
      for (const point of overlay.backtest?.equity_curve || []) {
        const i = index.get(point.ts / 1000)
        if (i !== undefined && i + 1 < t.length) modelAt.set(t[i + 1], p0 * point.equity / 100000)
      }
    }
    p.bands.setData(t.map((time) => bandAt.has(time) ? { time, value: 1, color: bandAt.get(time) } : { time }))
    p.model.setData(t.map((time) => modelAt.has(time) ? { time, value: modelAt.get(time) } : { time }))
  }, [candles, overlay])

  // Start marker, "live from here" marker, and the training-period shade.
  useEffect(() => {
    const p = parts.current
    const t = candles.map((candle) => candle.ts / 1000)
    const marks = []
    const startAt = shownIndex >= 0 ? t[shownIndex] : overlay ? overlay.start_ts / 1000 : null
    if (startAt != null) marks.push({ time: startAt, position: 'aboveBar', color: COLORS.start, shape: 'arrowDown', text: 'Start' })
    const live = overlay?.trained_through_ts / 1000
    if (live && live < t.at(-1)) {
      const i = t.findIndex((time) => time > live)
      if (i >= 0) marks.push({ time: t[i], position: 'belowBar', color: COLORS.model, shape: 'arrowUp', text: 'Live' })
    }
    p.markers.setMarkers(marks.filter((m) => t.includes(m.time)).sort((a, b) => a.time - b.time))

    const drawShade = () => {
      const x = shownIndex >= 0 && onStartChange ? p.chart.timeScale().timeToCoordinate(t[shownIndex]) : null
      shade.current.style.display = x === null ? 'none' : 'block'
      if (x !== null) shade.current.style.width = `${Math.max(0, x)}px`
    }
    drawShade()
    p.chart.timeScale().subscribeVisibleLogicalRangeChange(drawShade)
    const resize = new ResizeObserver(drawShade)
    resize.observe(box.current)
    return () => { p.chart.timeScale().unsubscribeVisibleLogicalRangeChange(drawShade); resize.disconnect() }
  }, [candles, overlay, shownIndex, onStartChange])

  const commit = () => {
    if (dragIndex !== null && onStartChange) onStartChange(times[dragIndex] * 1000)
    setDragIndex(null)
  }
  const fmt = (sec) => new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC',
  }).format(new Date(sec * 1000)) + ' UTC'

  return (
    <div className="model-chart">
      <div className="model-chart-canvas" ref={box}>
        <div className="model-chart-shade" ref={shade}><span>trains on this</span></div>
      </div>
      {onStartChange && times.length > 0 && <div className="model-chart-start">
        <input type="range" aria-label="Model start time"
          min={Math.ceil(times.length * 0.1)} max={Math.floor(times.length * 0.97)} step="1"
          value={Math.max(0, shownIndex)}
          onChange={(event) => setDragIndex(Number(event.target.value))}
          onPointerUp={commit} onKeyUp={commit} onBlur={commit} />
        {shownIndex >= 0 && <div className="model-chart-when">
          <b>Starts {fmt(times[shownIndex])}</b>
          <small>learns from {shownIndex.toLocaleString()} candles · trades {(times.length - shownIndex).toLocaleString()}</small>
        </div>}
      </div>}
    </div>
  )
}
