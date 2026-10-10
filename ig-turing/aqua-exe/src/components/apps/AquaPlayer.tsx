import { useCallback, useEffect, useRef, useState } from 'react'
import { Pause, Play, RotateCcw, Upload, Volume2, VolumeX, X } from 'lucide-react'

const SAFE_CAP = 0.65
const fishVolumes = [0.08, 0.17, 0.31, 0.48, SAFE_CAP]

interface Props {
  onClose: () => void
}

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds)) return '0:00'
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

export function AquaPlayer({ onClose }: Props) {
  const audio = useRef<HTMLAudioElement>(null)
  const objectUrl = useRef<string | null>(null)
  const inflateTimer = useRef<number | null>(null)
  const chaosTimer = useRef<number | null>(null)
  const [trackName, setTrackName] = useState('No authorized audio selected')
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [volume, setVolumeState] = useState(.32)
  const [lastAudibleVolume, setLastAudibleVolume] = useState(.32)
  const [chaos, setChaos] = useState(true)
  const [sliderDodges, setSliderDodges] = useState(0)
  const [sliderOffset, setSliderOffset] = useState(0)
  const [inflate, setInflate] = useState(14)
  const [popped, setPopped] = useState(false)
  const [pauseDrama, setPauseDrama] = useState(false)
  const [message, setMessage] = useState('Please insert one legally obtainable banger.')
  const [achievement, setAchievement] = useState<string | null>(null)

  const award = useCallback((title: string) => {
    setAchievement(title)
    window.setTimeout(() => setAchievement(null), 2800)
  }, [])

  const setVolume = useCallback((next: number, reason?: string) => {
    const safe = Math.max(0, Math.min(SAFE_CAP, next))
    setVolumeState(safe)
    if (safe > 0) setLastAudibleVolume(safe)
    if (audio.current) audio.current.volume = safe
    if (reason) setMessage(reason)
  }, [])

  const emergencyMute = () => {
    setVolume(0, 'Emergency mute respected. Chaos has been legally restrained.')
    setChaos(false)
    award('Silence Is Golden-ish')
  }

  const chooseFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('audio/')) {
      setMessage('That file is insufficiently musical.')
      return
    }
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    objectUrl.current = URL.createObjectURL(file)
    if (audio.current) {
      audio.current.src = objectUrl.current
      audio.current.load()
    }
    setTrackName(file.name)
    setCurrentTime(0)
    setMessage('Track accepted. Copyright lawyers remain calm.')
  }

  const togglePlayback = async () => {
    const player = audio.current
    if (!player?.src) {
      setMessage('Select your own audio file first. Piracy is not very aquatic.')
      return
    }
    if (playing) {
      setPauseDrama(true)
      return
    }
    try {
      await player.play()
      setPlaying(true)
      setMessage('Now playing at a responsibly chaotic volume.')
    } catch {
      setMessage('The browser declined our musical ambitions. Try Play again.')
    }
  }

  const confirmPause = (apology: boolean) => {
    audio.current?.pause()
    setPlaying(false)
    setPauseDrama(false)
    setMessage(apology ? 'I forgive you. Eventually.' : 'Paused. The CD is processing this rejection.')
    if (apology) award('Emotionally Available')
  }

  const reset = () => {
    if (audio.current) {
      audio.current.pause()
      audio.current.currentTime = 0
    }
    setPlaying(false)
    setCurrentTime(0)
    setVolume(.32)
    setChaos(true)
    setInflate(14)
    setPopped(false)
    setSliderOffset(0)
    setMessage('Player reset. It remembers everything.')
  }

  const startInflating = () => {
    if (inflateTimer.current) return
    setPopped(false)
    inflateTimer.current = window.setInterval(() => {
      setInflate((current) => {
        const next = current + 3
        if (next >= 118) {
          if (inflateTimer.current) window.clearInterval(inflateTimer.current)
          inflateTimer.current = null
          setPopped(true)
          setVolume(.01, 'POP! Volume reset to 1%. The bubble has filed a complaint.')
          award('Professional Bubble Liability')
          return 8
        }
        setVolume((next / 100) * SAFE_CAP)
        return next
      })
    }, 70)
  }

  const stopInflating = () => {
    if (inflateTimer.current) window.clearInterval(inflateTimer.current)
    inflateTimer.current = null
  }

  const temptSlider = () => {
    if (!chaos) return
    setSliderDodges((count) => {
      const next = count + 1
      if (next % 3 === 0) {
        setSliderOffset((current) => current === 0 ? 46 : -current)
        setMessage('The slider has boundaries. Please respect them.')
        if (next === 6) award('Slider Chaser')
      }
      return next
    })
  }

  useEffect(() => {
    const player = audio.current
    if (!player) return
    const update = () => setCurrentTime(player.currentTime)
    const metadata = () => setDuration(player.duration)
    const ended = () => setPlaying(false)
    player.addEventListener('timeupdate', update)
    player.addEventListener('loadedmetadata', metadata)
    player.addEventListener('ended', ended)
    return () => {
      player.removeEventListener('timeupdate', update)
      player.removeEventListener('loadedmetadata', metadata)
      player.removeEventListener('ended', ended)
    }
  }, [])

  useEffect(() => {
    if (!playing || !chaos || volume === 0) return
    const schedule = () => {
      chaosTimer.current = window.setTimeout(() => {
        const next = .1 + Math.random() * (SAFE_CAP - .1)
        setVolume(next, `The ocean has adjusted volume to ${Math.round(next * 100)}% on your behalf.`)
        schedule()
      }, 11000 + Math.random() * 7000)
    }
    schedule()
    return () => {
      if (chaosTimer.current) window.clearTimeout(chaosTimer.current)
      chaosTimer.current = null
    }
  }, [chaos, playing, setVolume, volume === 0])

  useEffect(() => () => {
    stopInflating()
    if (chaosTimer.current) window.clearTimeout(chaosTimer.current)
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
  }, [])

  return (
    <section className="aqua-player glass" aria-label="AQUA Player">
      <audio ref={audio} preload="metadata" />
      <header className="app-window__bar">
        <span>♫ AQUA Player — emotionally available edition</span>
        <button type="button" onClick={onClose} aria-label="Close AQUA Player"><X size={16} /></button>
      </header>

      <div className="aqua-player__body">
        <div className={`player-cd ${playing ? 'is-playing' : ''}`} aria-hidden="true">
          <span>AQUA</span><i />
        </div>

        <div className="player-now">
          <small>INTENDED FEATURED TRACK</small>
          <strong>“Barbie Girl” — bring an authorized copy</strong>
          <span className="player-file">{trackName}</span>
          <div className="equalizer" aria-hidden="true">
            {Array.from({ length: 14 }, (_, index) => <i key={index} style={{ '--eq': `${(index % 5) + 2}` } as React.CSSProperties} />)}
          </div>
          <label className="file-picker">
            <Upload size={15} /> Choose audio file
            <input type="file" accept="audio/*" onChange={chooseFile} />
          </label>
        </div>

        <div className="player-progress">
          <span>{formatTime(currentTime)}</span>
          <input aria-label="Track progress" type="range" min="0" max={duration || 1} step=".1" value={Math.min(currentTime, duration || 1)} onChange={(event) => {
            const next = Number(event.target.value)
            if (audio.current) audio.current.currentTime = next
            setCurrentTime(next)
          }} />
          <span>{formatTime(duration)}</span>
        </div>

        <div className="player-controls">
          <button type="button" className="player-main" onClick={togglePlayback}>{playing ? <Pause /> : <Play />}{playing ? 'Pause?' : 'Play'}</button>
          <button type="button" onClick={() => {
            if (volume === 0) setVolume(lastAudibleVolume, 'Fine. You may have sound again.')
            else emergencyMute()
          }}>{volume === 0 ? <Volume2 /> : <VolumeX />}{volume === 0 ? 'Unmute' : 'Emergency mute'}</button>
          <button type="button" onClick={reset}><RotateCcw /> Reset</button>
          <label className="chaos-switch"><input type="checkbox" checked={chaos} onChange={(event) => {
            setChaos(event.target.checked)
            setSliderOffset(0)
            setMessage(event.target.checked ? 'Chaos is back from lunch.' : 'Chaos Off. Your boundaries are valid.')
          }} /> Chaos {chaos ? 'On' : 'Off'}</label>
        </div>

        <div className="normal-volume">
          <div><Volume2 size={16} /> Safe volume: {Math.round(volume * 100)}% <small>(cap 65%)</small></div>
          <input aria-label="Safe volume" className="runaway-slider" style={{ transform: `translateX(${sliderOffset}px)` }} type="range" min="0" max={SAFE_CAP} step=".01" value={volume} onPointerEnter={temptSlider} onChange={(event) => {
            let next = Number(event.target.value)
            if (chaos && sliderDodges > 0 && sliderDodges % 4 === 0) {
              next = SAFE_CAP - next
              setMessage('Excellent choice. I have selected the opposite.')
            }
            setVolume(next)
          }} />
        </div>

        <div className="volume-games">
          <article>
            <h3>Fish Catcher™</h3>
            <p>Catch a licensed volume fish.</p>
            <div className="fish-tank">
              {fishVolumes.map((value, index) => (
                <button key={value} type="button" style={{ '--fish-delay': `${index * -.47}s`, '--fish-speed': `${3.1 + index * .37}s` } as React.CSSProperties} onClick={() => {
                  setVolume(value, `Caught a ${Math.round(value * 100)}% fish. It seems surprised.`)
                  if (index === fishVolumes.length - 1) award('Master Baiter of Volume')
                }} aria-label={`Set volume to ${Math.round(value * 100)} percent`}>🐟<span>{Math.round(value * 100)}%</span></button>
              ))}
            </div>
          </article>

          <article>
            <h3>Bubble Inflation™</h3>
            <p>Hold to inflate. Nothing bad will happen.</p>
            <div className={`inflation-zone ${popped ? 'is-popped' : ''}`}>
              <span className="volume-bubble" style={{ width: `${38 + inflate * .75}px`, height: `${38 + inflate * .75}px` }}>{popped ? 'POP' : `${Math.round(Math.min(SAFE_CAP, inflate / 100 * SAFE_CAP) * 100)}%`}</span>
              <button type="button" onPointerDown={startInflating} onPointerUp={stopInflating} onPointerCancel={stopInflating} onPointerLeave={stopInflating}>Hold to inflate</button>
            </div>
          </article>
        </div>

        <p className="player-message" role="status">{message}</p>
      </div>

      {pauseDrama && (
        <div className="player-dialog" role="dialog" aria-modal="true" aria-label="Emotional pause confirmation">
          <div className="glass"><strong>Are you mad at me?</strong><p>The CD noticed you tried to pause it.</p><button onClick={() => confirmPause(true)}>No, you're perfect.</button><button onClick={() => confirmPause(false)}>It's not you, it's my ears.</button></div>
        </div>
      )}
      {achievement && <div className="achievement-toast"><span>🏆 Pointless achievement</span><strong>{achievement}</strong></div>}
    </section>
  )
}
