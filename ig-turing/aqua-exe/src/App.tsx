import { useCallback, useEffect, useRef, useState } from 'react'
import { useProgress } from '@react-three/drei'
import { Mic, Phone as PhoneIcon, RotateCcw } from 'lucide-react'
import { AquaBackground } from './components/effects/AquaBackground'
import { DesktopReveal } from './components/desktop/DesktopReveal'
import { PhoneStage } from './components/phone/PhoneStage'
import type { PhoneHandle, PhoneReadyInfo, PhoneState } from './components/phone/Phone'
import { GlossyButton } from './components/ui/GlossyButton'
import { BrandMark } from './components/ui/BrandMark'
import { useWowRecognition } from './hooks/useWowRecognition'
import { translations, type Language } from './i18n'

const DEBUG = new URLSearchParams(location.search).has('debug')

export function App() {
  const phone = useRef<PhoneHandle>(null)
  const audioContext = useRef<AudioContext | null>(null)
  const customCursor = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<PhoneState>('closed')
  const [info, setInfo] = useState<PhoneReadyInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [voiceMessageKey, setVoiceMessageKey] = useState<'sayWow' | 'opening' | 'wowOpening' | 'miss' | 'missThree'>('sayWow')
  const [revealed, setRevealed] = useState(false)
  const [shimmer, setShimmer] = useState(false)
  const [language, setLanguage] = useState<Language>(() => localStorage.getItem('callmemaybe-language') === 'tr' ? 'tr' : 'en')
  const t = translations[language]
  const { progress, active } = useProgress()
  const ready = info !== null

  useEffect(() => () => {
    if (audioContext.current?.state !== 'closed') void audioContext.current?.close()
  }, [])

  useEffect(() => {
    localStorage.setItem('callmemaybe-language', language)
    document.documentElement.lang = language
  }, [language])

  useEffect(() => {
    const cursor = customCursor.current
    if (!cursor || !window.matchMedia('(pointer: fine)').matches) return
    let frame = 0
    let x = window.innerWidth / 2
    let y = window.innerHeight / 2
    const render = () => {
      // cursor.png points near its upper-left edge; align that tip to the click coordinate.
      cursor.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-18%, -8%)`
      frame = 0
    }
    const move = (event: PointerEvent) => {
      x = event.clientX
      y = event.clientY
      const target = event.target as Element | null
      cursor.classList.toggle('is-visible', !target?.closest('input, textarea, [contenteditable="true"]'))
      if (!frame) frame = requestAnimationFrame(render)
    }
    const leave = () => cursor.classList.remove('is-visible')
    window.addEventListener('pointermove', move)
    document.documentElement.addEventListener('mouseleave', leave)
    return () => {
      window.removeEventListener('pointermove', move)
      document.documentElement.removeEventListener('mouseleave', leave)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  const busy = state === 'opening' || state === 'closing'
  const isOpen = state === 'open' || state === 'opening'

  const unlockAudio = useCallback(async () => {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return null
    const ctx = audioContext.current ?? new AudioContextClass()
    audioContext.current = ctx
    if (ctx.state === 'suspended') await ctx.resume()
    return ctx
  }, [])

  const playOpenChime = useCallback(async () => {
    const ctx = await unlockAudio()
    if (!ctx) return
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(.08, ctx.currentTime + .02)
    gain.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + .55)
    gain.connect(ctx.destination)
    ;[523.25, 659.25, 783.99].forEach((frequency, index) => {
      const oscillator = ctx.createOscillator()
      oscillator.type = 'sine'
      oscillator.frequency.value = frequency
      oscillator.connect(gain)
      oscillator.start(ctx.currentTime + index * .07)
      oscillator.stop(ctx.currentTime + .6)
    })
  }, [unlockAudio])

  const enterAqua = useCallback(async (viaVoice = false) => {
    if (!phone.current || busy || revealed) return
    setVoiceMessageKey(viaVoice ? 'wowOpening' : 'opening')
    setShimmer(true)
    window.dispatchEvent(new Event('aqua-wow'))
    void playOpenChime()
    await phone.current.open()
    window.setTimeout(() => setRevealed(true), 260)
    window.setTimeout(() => setShimmer(false), 900)
  }, [busy, playOpenChime, revealed])

  const { listen, status, supported, failure } = useWowRecognition({
    disabled: busy || revealed,
    language,
    t,
    onWow: () => void enterAqua(true),
    onMiss: (attempts) => setVoiceMessageKey(attempts >= 3 ? 'missThree' : 'miss'),
  })

  const beginListening = useCallback(() => {
    // Resume audio while this click still counts as a user gesture. The later
    // recognition callback can then play the chime without autoplay blocking it.
    void unlockAudio()
    listen()
  }, [listen, unlockAudio])

  const resetExperience = useCallback(async () => {
    setRevealed(false)
    setVoiceMessageKey('sayWow')
    window.setTimeout(() => void phone.current?.close(), 500)
  }, [])

  return (
    <>
      <AquaBackground />
      <div className={`phone-transition ${revealed ? 'is-entered' : ''}`}>
      <PhoneStage
        phoneRef={phone}
        onStateChange={setState}
        onReady={setInfo}
        onError={(e) => setError(e.message)}
      />
      </div>
      <DesktopReveal visible={revealed} onReset={resetExperience} language={language} t={t} />
      <div className={`portal-shimmer ${shimmer ? 'is-active' : ''}`} aria-hidden="true" />

      <div className="ui-layer">
        {/* Vista-style title bar */}
        <header className="titlebar titlebar--brand" style={{ position: 'absolute', top: 22, left: 22 }} aria-label="CallMeMaybe">
          <BrandMark className="brand-mark--header" />
        </header>

        <div className="holo-sticker" style={{ position: 'absolute', top: 30, right: 28 }}>★ HackNC 2026</div>

        {/* test controls for this milestone */}
        <div className={`entry-controls ${revealed ? 'is-hidden' : ''}`}>
          <div className="language-picker" role="group" aria-label={t.language}>
            <button type="button" title="Switch to English" aria-pressed={language === 'en'} className={language === 'en' ? 'is-active' : ''} onClick={() => setLanguage('en')}>{t.english}</button>
            <button type="button" title="Türkçeye geç" aria-pressed={language === 'tr'} className={language === 'tr' ? 'is-active' : ''} onClick={() => setLanguage('tr')}>{t.turkish}</button>
          </div>
          <p className="entry-prompt" aria-live="polite">{t[voiceMessageKey]}</p>
          <div className="entry-actions" style={{ pointerEvents: 'auto' }}>
            <GlossyButton className={`listen-btn ${status === 'listening' ? 'is-listening' : ''}`} icon={<Mic size={18} />} onClick={beginListening} disabled={!ready || busy || status === 'listening' || status === 'requesting'}>
              {status === 'requesting' ? t.requesting : status === 'listening' ? t.listening : t.mic}
            </GlossyButton>
            {isOpen ? (
              <GlossyButton variant="pink" icon={<RotateCcw size={18} />} onClick={resetExperience} disabled={!ready}>
                {t.closePhone}
              </GlossyButton>
            ) : (
              <GlossyButton variant="pink" icon={<PhoneIcon size={18} />} onClick={() => void enterAqua()} disabled={!ready || busy}>
                {t.openPhone}
              </GlossyButton>
            )}
          </div>
          {!supported && <p className="voice-note">{t.unsupported}</p>}
          {failure && <p role="status" className="voice-note">{failure}</p>}
          {error && <p role="alert" className="tagline" style={{ color: '#b0225f' }}>⚠ {error}</p>}
        </div>

        <footer className={`tagline attribution ${revealed ? 'is-hidden' : ''}`}>
          “NaviPhone” by Ahmad Qasem · CC BY 4.0 · sketchfab.com/ahmadqasem
        </footer>

        {DEBUG && (
          <pre className="glass" style={{ position: 'absolute', right: 22, bottom: 14, margin: 0, padding: '10px 14px', fontSize: 12, borderRadius: 14 }}>
            {`state: ${state}\n` + (info ? `hinge: ${info.nodeName}\nsegment: ${info.start.toFixed(3)}s → ${info.end.toFixed(3)}s\nsweep: ${info.sweepDeg.toFixed(1)}°\nclip: ${info.clipDuration.toFixed(2)}s\nplays in: ${info.openDuration}s` : 'discovering…')}
          </pre>
        )}
      </div>

      <div className={`loader ${ready || error ? 'is-done' : ''}`} aria-live="polite">
        <div style={{ textAlign: 'center' }}>
          <div className="loader__bubble" />
          <p className="tagline" style={{ marginTop: 18, fontSize: 18 }}>
            {active ? `${t.loading} ${Math.round(progress)}%` : t.warming}
          </p>
        </div>
      </div>
      <div ref={customCursor} className="custom-cursor" aria-hidden="true" />
    </>
  )
}
