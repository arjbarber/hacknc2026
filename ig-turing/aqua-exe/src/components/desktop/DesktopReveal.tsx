import { Suspense, useEffect, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Bounds, Center, OrbitControls, useGLTF } from '@react-three/drei'
import type { Group } from 'three'
import { CloudSun, Fish, Headphones, HelpCircle, MonitorCog, Sparkles } from 'lucide-react'
import { AquaPlayer } from '../apps/AquaPlayer'
import { BrandMark } from '../ui/BrandMark'
import type { Language, Translation } from '../../i18n'

interface Props { visible: boolean; onReset: () => void; language: Language; t: Translation }
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

function QuitFish() {
  const model = useGLTF('/models/sneaker_fih.glb')
  const ref = useRef<Group>(null)
  useFrame(({ clock }) => { if (ref.current) ref.current.rotation.y = Math.sin(clock.elapsedTime * .8) * .18 })
  return <Bounds fit clip observe margin={1.1}><Center><group ref={ref}><primitive object={model.scene} /></group></Center></Bounds>
}

function FishWindow({ onClose, language, t }: { onClose: () => void; language: Language; t: Translation }) {
  const [speech, setSpeech] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const speak = (encoded?: string | null) => {
    if (encoded) void new Audio(`data:audio/wav;base64,${encoded}`).play()
    else if ('speechSynthesis' in window) {
      speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(t.quit)
      utterance.lang = language === 'tr' ? 'tr-TR' : 'en-US'
      speechSynthesis.speak(utterance)
    }
  }
  useEffect(() => {
    let active = true
    setLoading(true)
    fetch(`${API_URL}/fih/quit?lang=${language}`).then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => { if (active) { setSpeech(data.speech); speak(data.speech) } })
      .catch(() => { if (active) speak() })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [language])
  return <section className="mini-window glass fish-window">
    <header className="app-window__bar"><span>{t.supportFish}</span><button type="button" onClick={onClose} aria-label={t.close}>×</button></header>
    <div className="fish-window__body">
      <div className="fish-canvas"><Canvas camera={{ position: [0, 0, 4], fov: 32 }} dpr={[1, 2]} gl={{ alpha: true, antialias: true }} onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}><ambientLight intensity={2} /><directionalLight position={[4, 5, 5]} intensity={2.2} /><directionalLight position={[-4, 2, -3]} intensity={1.1} /><Suspense fallback={null}><QuitFish /></Suspense><OrbitControls enableZoom={false} enablePan={false} /></Canvas></div>
      <div className="fish-quit"><span>{t.quit}</span><button type="button" onClick={() => speak(speech)} disabled={loading}>{loading ? t.callingGemini : t.sayAgain}</button></div>
    </div>
  </section>
}

function WeatherWindow({ onClose, t }: { onClose: () => void; t: Translation }) {
  const [location, setLocation] = useState('')
  const [forecast, setForecast] = useState(false)
  return <section className="mini-window glass weather-window">
    <header className="app-window__bar"><span>{t.weather}</span><button type="button" onClick={onClose} aria-label={t.close}>×</button></header>
    <form onSubmit={(event) => { event.preventDefault(); if (location.trim()) setForecast(true) }}>
      <label>{t.pickLocation}<input value={location} onChange={(event) => { setLocation(event.target.value); setForecast(false) }} placeholder={t.locationPlaceholder} /></label>
      <button type="submit">{t.checkWeather}</button>{forecast && <p>{t.forecast}</p>}
    </form>
  </section>
}

function MessageWindow({ title, message, t, onClose }: { title: string; message: string; t: Translation; onClose: () => void }) {
  return <section className="mini-window glass message-window"><header className="app-window__bar"><span>{title}</span><button type="button" onClick={onClose} aria-label={t.close}>×</button></header><p>{message}</p></section>
}

export function DesktopReveal({ visible, onReset, language, t }: Props) {
  const [playerOpen, setPlayerOpen] = useState(false)
  const [fishOpen, setFishOpen] = useState(false)
  const [weatherOpen, setWeatherOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [welcomeOpen, setWelcomeOpen] = useState(true)
  const icons = [
    { id: 'player', label: t.player, icon: Headphones, note: t.playerNote }, { id: 'fish', label: t.supportFish, icon: Fish, note: t.supportNote },
    { id: 'weather', label: t.weather, icon: CloudSun, note: t.weatherNote }, { id: 'settings', label: t.settings, icon: MonitorCog, note: t.settingsNote }, { id: 'help', label: t.help, icon: HelpCircle, note: t.helpNote },
  ]
  const resetDesktop = () => { setPlayerOpen(false); setFishOpen(false); setWeatherOpen(false); setSettingsOpen(false); setHelpOpen(false); setWelcomeOpen(true); onReset() }
  return <section className={`desktop-reveal ${visible ? 'is-visible' : ''}`} aria-hidden={!visible}>
    <div className="desktop-reveal__reflection" /><div className="desktop-shell">
      {welcomeOpen && <div className="desktop-welcome glass"><div className="desktop-welcome__bar"><span className="brand-title"><BrandMark className="brand-mark--window" /><span>{t.welcomeTitle}</span></span><button type="button" onClick={() => setWelcomeOpen(false)} aria-label={t.close}>×</button></div><div className="desktop-welcome__body"><span className="welcome-orb"><Sparkles size={28} /></span><div><h2>{t.welcomeHeading}</h2><p>{t.welcomeBody}</p></div></div></div>}
      <nav className="desktop-icons" aria-label={t.desktopApps}>{icons.map(({ id, label, icon: Icon, note }, index) => <button key={id} type="button" className="desktop-icon" onClick={() => {
        if (id === 'player') setPlayerOpen(true); if (id === 'fish') setFishOpen(true); if (id === 'weather') setWeatherOpen(true); if (id === 'settings') setSettingsOpen(true); if (id === 'help') setHelpOpen(true)
      }} style={{ '--delay': `${.62 + index * .09}s` } as React.CSSProperties}><span className="desktop-icon__gem"><Icon size={28} /></span><strong>{label}</strong><small>{note}</small></button>)}</nav>
      {playerOpen && <AquaPlayer onClose={() => setPlayerOpen(false)} t={t} />}{fishOpen && <FishWindow onClose={() => setFishOpen(false)} language={language} t={t} />}{weatherOpen && <WeatherWindow onClose={() => setWeatherOpen(false)} t={t} />}
      {settingsOpen && <MessageWindow title={t.settings} message={t.settingsError} t={t} onClose={() => setSettingsOpen(false)} />}{helpOpen && <MessageWindow title={t.help} message={t.helpMessage} t={t} onClose={() => setHelpOpen(false)} />}
      <div className="desktop-bubble desktop-bubble--one" /><div className="desktop-bubble desktop-bubble--two" />
      <footer className="taskbar glass"><button className="start-pearl" type="button" aria-label={t.openMenu}>♡</button><span className="taskbar__app taskbar__brand"><BrandMark className="brand-mark--taskbar" /></span><span className="taskbar__spacer" />{playerOpen && <button type="button" className="taskbar__app taskbar__app--active" onClick={() => setPlayerOpen(true)}>♫ {t.player}</button>}<button type="button" className="demo-reset" onClick={resetDesktop}>{t.resetDemo}</button><time>{new Date().toLocaleTimeString(language === 'tr' ? 'tr-TR' : 'en-US', { hour: '2-digit', minute: '2-digit' })}</time></footer>
    </div>
  </section>
}

useGLTF.preload('/models/sneaker_fih.glb')
