import { useEffect, useRef } from 'react'

/** Pre-render one glossy soap-bubble sprite so per-frame drawing is a cheap drawImage. */
function makeBubbleSprite(size = 160): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const R = size / 2 - 2
  const cx = size / 2
  // body: clear centre, brighter rim
  const body = g.createRadialGradient(cx, cx, R * 0.15, cx, cx, R)
  body.addColorStop(0, 'rgba(255,255,255,0.03)')
  body.addColorStop(0.7, 'rgba(190,240,255,0.14)')
  body.addColorStop(0.94, 'rgba(160,230,255,0.42)')
  body.addColorStop(1, 'rgba(255,255,255,0.75)')
  g.fillStyle = body
  g.beginPath()
  g.arc(cx, cx, R, 0, Math.PI * 2)
  g.fill()
  // iridescent rim: pink lower-right, aqua upper-left
  g.save()
  g.beginPath()
  g.arc(cx, cx, R, 0, Math.PI * 2)
  g.clip()
  const pink = g.createRadialGradient(cx + R * 0.55, cx + R * 0.6, R * 0.2, cx + R * 0.35, cx + R * 0.4, R * 1.05)
  pink.addColorStop(0, 'rgba(244,184,212,0)')
  pink.addColorStop(0.75, 'rgba(244,184,212,0.0)')
  pink.addColorStop(1, 'rgba(244,184,212,0.55)')
  g.fillStyle = pink
  g.fillRect(0, 0, size, size)
  const aqua = g.createRadialGradient(cx - R * 0.5, cx - R * 0.5, R * 0.2, cx - R * 0.3, cx - R * 0.3, R * 1.05)
  aqua.addColorStop(0.75, 'rgba(141,236,241,0)')
  aqua.addColorStop(1, 'rgba(141,236,241,0.5)')
  g.fillStyle = aqua
  g.fillRect(0, 0, size, size)
  g.restore()
  // specular glints
  g.save()
  g.translate(cx - R * 0.38, cx - R * 0.42)
  g.rotate(-0.7)
  const hl = g.createLinearGradient(0, -R * 0.2, 0, R * 0.2)
  hl.addColorStop(0, 'rgba(255,255,255,0.95)')
  hl.addColorStop(1, 'rgba(255,255,255,0.05)')
  g.fillStyle = hl
  g.beginPath()
  g.ellipse(0, 0, R * 0.3, R * 0.14, 0, 0, Math.PI * 2)
  g.fill()
  g.restore()
  g.fillStyle = 'rgba(255,255,255,0.7)'
  g.beginPath()
  g.arc(cx + R * 0.45, cx + R * 0.5, R * 0.06, 0, Math.PI * 2)
  g.fill()
  return c
}

function makeStarSprite(size = 64, color = '255,255,255'): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const m = size / 2
  const glow = g.createRadialGradient(m, m, 0, m, m, m)
  glow.addColorStop(0, `rgba(${color},0.9)`)
  glow.addColorStop(0.25, `rgba(${color},0.25)`)
  glow.addColorStop(1, `rgba(${color},0)`)
  g.fillStyle = glow
  g.fillRect(0, 0, size, size)
  g.fillStyle = `rgba(${color},1)`
  g.beginPath()
  const o = m * 0.95, i = m * 0.1
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4 - Math.PI / 2
    const r = k % 2 === 0 ? o : i
    g.lineTo(m + Math.cos(a) * r, m + Math.sin(a) * r)
  }
  g.closePath()
  g.fill()
  return c
}

interface Bubble { x: number; y: number; r: number; vy: number; ph: number; z: number; ox: number; oy: number }
interface Star { x: number; y: number; s: number; ph: number; sp: number; z: number; pink: boolean }

export function AquaBackground() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const bubbleSprite = makeBubbleSprite()
    const starWhite = makeStarSprite(64, '255,255,255')
    const starPink = makeStarSprite(64, '244,184,212')
    let w = 0, h = 0, dpr = 1
    const mouse = { x: 0.5, y: 0.5, sx: 0.5, sy: 0.5, px: -999, py: -999 }
    let bubbles: Bubble[] = []
    let stars: Star[] = []
    let wowImpulse = 0

    const rnd = (a: number, b: number) => a + Math.random() * (b - a)

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      const nb = Math.round(Math.min(46, Math.max(20, (w * h) / 38000)))
      bubbles = Array.from({ length: nb }, () => {
        const z = rnd(0.25, 1)
        return { x: Math.random() * w, y: Math.random() * h, r: rnd(7, 46) * (0.55 + z * 0.6), vy: rnd(10, 34) * (0.5 + z), ph: rnd(0, 6.28), z, ox: 0, oy: 0 }
      })
      stars = Array.from({ length: Math.round(Math.min(70, Math.max(28, (w * h) / 30000))) }, () => ({
        x: Math.random() * w, y: Math.random() * h, s: rnd(5, 17), ph: rnd(0, 6.28), sp: rnd(0.6, 2), z: rnd(0.2, 1), pink: Math.random() < 0.35,
      }))
    }
    resize()
    window.addEventListener('resize', resize)

    const onMove = (e: PointerEvent) => {
      mouse.x = e.clientX / window.innerWidth
      mouse.y = e.clientY / window.innerHeight
      mouse.px = e.clientX
      mouse.py = e.clientY
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    const onWow = () => { wowImpulse = 1 }
    window.addEventListener('aqua-wow', onWow)

    let raf = 0
    let last = performance.now()
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const t = now / 1000
      mouse.sx += (mouse.x - mouse.sx) * Math.min(1, dt * 3)
      mouse.sy += (mouse.y - mouse.sy) * Math.min(1, dt * 3)
      const par = reduce ? 0 : 1
      wowImpulse *= Math.max(0, 1 - dt * 1.7)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      // sparkles (far layer)
      for (const s of stars) {
        const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * s.sp + s.ph))
        const x = s.x + (mouse.sx - 0.5) * -40 * s.z * par
        const y = s.y + (mouse.sy - 0.5) * -26 * s.z * par
        const size = s.s * (0.6 + tw * 0.5)
        ctx.globalAlpha = tw * 0.9
        ctx.drawImage(s.pink ? starPink : starWhite, x - size, y - size, size * 2, size * 2)
      }

      // bubbles
      for (const b of bubbles) {
        if (!reduce) {
          b.y -= b.vy * dt
          if (b.y + b.r < -20) { b.y = h + b.r + 10; b.x = Math.random() * w }
        }
        const wob = reduce ? 0 : Math.sin(t * 0.9 + b.ph) * (14 + wowImpulse * 90) * b.z
        // gentle repel from the pointer
        const px = b.x + wob + b.ox, py = b.y + b.oy
        const dx = px - mouse.px, dy = py - mouse.py
        const d2 = dx * dx + dy * dy
        if (!reduce && d2 < 130 * 130 && d2 > 1) {
          const d = Math.sqrt(d2), f = (1 - d / 130) * 90 * dt
          b.ox += (dx / d) * f
          b.oy += (dy / d) * f
        }
        b.ox *= 1 - Math.min(1, dt * 1.6)
        b.oy *= 1 - Math.min(1, dt * 1.6)
        const x = b.x + wob + b.ox + (mouse.sx - 0.5) * -70 * b.z * par
        const y = b.y + b.oy + (mouse.sy - 0.5) * -40 * b.z * par
        ctx.globalAlpha = 0.45 + b.z * 0.5
        ctx.drawImage(bubbleSprite, x - b.r, y - b.r, b.r * 2, b.r * 2)
      }
      ctx.globalAlpha = 1
    }
    const onVis = () => {
      cancelAnimationFrame(raf)
      if (!document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame) }
    }
    document.addEventListener('visibilitychange', onVis)
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('aqua-wow', onWow)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  return (
    <div className="aqua-bg" aria-hidden="true">
      <div className="aqua-bg__water" />
      <div className="aqua-bg__caustics" />
      <div className="aqua-bg__rays">
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i} className="ray" style={{ ['--i' as string]: i }} />
        ))}
      </div>
      <div className="aqua-bg__seabed" />
      <canvas ref={ref} className="aqua-bg__canvas" />
    </div>
  )
}
