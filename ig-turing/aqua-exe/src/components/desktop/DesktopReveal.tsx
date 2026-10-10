import { useState } from 'react'
import { CloudSun, Fish, Headphones, HelpCircle, MonitorCog, Sparkles } from 'lucide-react'
import { AquaPlayer } from '../apps/AquaPlayer'

interface Props {
  visible: boolean
  onReset: () => void
}

const icons = [
  { label: 'AQUA Player', icon: Headphones, note: 'emotionally available audio' },
  { label: 'Support Fish', icon: Fish, note: 'certified-ish assistance' },
  { label: 'Weather.exe', icon: CloudSun, note: 'currently: damp' },
  { label: 'Settings', icon: MonitorCog, note: 'fish are deciding' },
  { label: 'Help!', icon: HelpCircle, note: 'summons a dolphin' },
]

export function DesktopReveal({ visible, onReset }: Props) {
  const [playerOpen, setPlayerOpen] = useState(false)
  const [welcomeOpen, setWelcomeOpen] = useState(true)

  const resetDesktop = () => {
    setPlayerOpen(false)
    setWelcomeOpen(true)
    onReset()
  }

  return (
    <section className={`desktop-reveal ${visible ? 'is-visible' : ''}`} aria-hidden={!visible}>
      <div className="desktop-reveal__reflection" />
      <div className="desktop-shell">
        {welcomeOpen && <div className="desktop-welcome glass">
          <div className="desktop-welcome__bar">
            <span>AQUA.exe welcomes you</span>
            <button type="button" onClick={() => setWelcomeOpen(false)} aria-label="Close welcome window">×</button>
          </div>
          <div className="desktop-welcome__body">
            <span className="welcome-orb"><Sparkles size={28} /></span>
            <div>
              <h2>Welcome to absolutely nothing.</h2>
              <p>Your aquatic productivity suite is ready to waste your time.</p>
            </div>
          </div>
        </div>}

        <nav className="desktop-icons" aria-label="Desktop applications">
          {icons.map(({ label, icon: Icon, note }, index) => (
            <button key={label} type="button" className="desktop-icon" onDoubleClick={() => label === 'AQUA Player' && setPlayerOpen(true)} onClick={() => {
              if (label === 'AQUA Player') setPlayerOpen(true)
            }} style={{ '--delay': `${.62 + index * .09}s` } as React.CSSProperties}>
              <span className="desktop-icon__gem"><Icon size={28} /></span>
              <strong>{label}</strong>
              <small>{note}</small>
            </button>
          ))}
        </nav>

        {playerOpen && <AquaPlayer onClose={() => setPlayerOpen(false)} />}

        <div className="desktop-bubble desktop-bubble--one" />
        <div className="desktop-bubble desktop-bubble--two" />

        <footer className="taskbar glass">
          <button className="start-pearl" type="button" aria-label="Open AQUA menu">♡</button>
          <span className="taskbar__app">AQUA.exe</span>
          <span className="taskbar__spacer" />
          {playerOpen && <button type="button" className="taskbar__app taskbar__app--active" onClick={() => setPlayerOpen(true)}>♫ AQUA Player</button>}
          <button type="button" className="demo-reset" onClick={resetDesktop}>↻ Demo reset</button>
          <time>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
        </footer>
      </div>
    </section>
  )
}
