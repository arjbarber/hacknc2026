import { useCallback, useEffect, useRef, useState } from 'react'
import { useProgress } from '@react-three/drei'
import { Mic, Phone as PhoneIcon, RotateCcw } from 'lucide-react'
import { AquaBackground } from './components/effects/AquaBackground'
import { DesktopReveal } from './components/desktop/DesktopReveal'
import { PhoneStage } from './components/phone/PhoneStage'
import type { PhoneHandle, PhoneReadyInfo, PhoneState } from './components/phone/Phone'
import { GlossyButton } from './components/ui/GlossyButton'
import { useWowRecognition } from './hooks/useWowRecognition'

const DEBUG = new URLSearchParams(location.search).has('debug')

export function App() {
  const phone = useRef<PhoneHandle>(null)
  const audioContext = useRef<AudioContext | null>(null)
  const [state, setState] = useState<PhoneState>('closed')
  const [info, setInfo] = useState<PhoneReadyInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [voiceMessage, setVoiceMessage] = useState('say wow to enter ♡')
  const [revealed, setRevealed] = useState(false)
  const [shimmer, setShimmer] = useState(false)
  const { progress, active } = useProgress()
  const ready = info !== null

  useEffect(() => () => {
    if (audioContext.current?.state !== 'closed') void audioContext.current?.close()
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
    setVoiceMessage(viaVoice ? 'WOW certified ✦ opening portal…' : 'opening portal…')
    setShimmer(true)
    window.dispatchEvent(new Event('aqua-wow'))
    void playOpenChime()
    await phone.current.open()
    window.setTimeout(() => setRevealed(true), 260)
    window.setTimeout(() => setShimmer(false), 900)
  }, [busy, playOpenChime, revealed])

  const { listen, status, supported, failure } = useWowRecognition({
    disabled: busy || revealed,
    onWow: () => void enterAqua(true),
    onMiss: (attempts) => setVoiceMessage(attempts >= 3
      ? 'The phone is beginning to question your enthusiasm.'
      : 'That was insufficiently impressive. Try again.'),
  })

  const beginListening = useCallback(() => {
    // Resume audio while this click still counts as a user gesture. The later
    // recognition callback can then play the chime without autoplay blocking it.
    void unlockAudio()
    listen()
  }, [listen, unlockAudio])

  const resetExperience = useCallback(async () => {
    setRevealed(false)
    setVoiceMessage('say wow to enter ♡')
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
      <DesktopReveal visible={revealed} onReset={resetExperience} />
      <div className={`portal-shimmer ${shimmer ? 'is-active' : ''}`} aria-hidden="true" />

      <div className="ui-layer">
        {/* Vista-style title bar */}
        <header className="glass titlebar" style={{ position: 'absolute', top: 22, left: 22 }}>
          <span className="orbs" aria-hidden="true">
            <i className="orb" style={{ ['--c' as string]: '#8DECF1' }} />
            <i className="orb" style={{ ['--c' as string]: '#A5E8C3' }} />
            <i className="orb" style={{ ['--c' as string]: '#F4B8D4' }} />
          </span>
          <h1 className="titlebar__name" style={{ margin: 0 }}>AQUA<em>.exe</em></h1>
        </header>

        <div className="holo-sticker" style={{ position: 'absolute', top: 30, right: 28 }}>★ HackNC 2026</div>

        {/* test controls for this milestone */}
        <div className={`entry-controls ${revealed ? 'is-hidden' : ''}`}>
          <p className="entry-prompt" aria-live="polite">{voiceMessage}</p>
          <div className="entry-actions" style={{ pointerEvents: 'auto' }}>
            <GlossyButton className={`listen-btn ${status === 'listening' ? 'is-listening' : ''}`} icon={<Mic size={18} />} onClick={beginListening} disabled={!ready || busy || status === 'listening' || status === 'requesting'}>
              {status === 'requesting' ? 'Requesting…' : status === 'listening' ? 'Listening…' : 'Use microphone'}
            </GlossyButton>
            {isOpen ? (
              <GlossyButton variant="pink" icon={<RotateCcw size={18} />} onClick={resetExperience} disabled={!ready}>
                Close phone
              </GlossyButton>
            ) : (
              <GlossyButton variant="pink" icon={<PhoneIcon size={18} />} onClick={() => void enterAqua()} disabled={!ready || busy}>
                Open phone
              </GlossyButton>
            )}
          </div>
          {!supported && <p className="voice-note">Voice recognition is unavailable in this browser — open in Chrome or use manual entry.</p>}
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
            {active ? `loading dream world… ${Math.round(progress)}%` : 'warming up the phone…'}
          </p>
        </div>
      </div>
    </>
  )
}
