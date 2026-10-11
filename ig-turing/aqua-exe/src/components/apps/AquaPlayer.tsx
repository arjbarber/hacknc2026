import { useCallback, useEffect, useRef, useState } from 'react'
import { Pause, Play, RotateCcw, Upload, Volume2, VolumeX, X } from 'lucide-react'
import type { Translation } from '../../i18n'
import { BrandMark } from '../ui/BrandMark'

const SAFE_CAP = 0.65
const fishVolumes = [0.08, 0.17, 0.31, 0.48, SAFE_CAP]

interface Props {
  onClose: () => void
  t: Translation
}

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds)) return '0:00'
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

export function AquaPlayer({ onClose, t }: Props) {
  const audio = useRef<HTMLAudioElement>(null)
  const objectUrl = useRef<string | null>(null)
  const inflateTimer = useRef<number | null>(null)
  const chaosTimer = useRef<number | null>(null)
  const [trackName, setTrackName] = useState('manifest - TRALALA Official Music Video.mp3')
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
  const [message, setMessage] = useState(t.playerInitial)
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
    setVolume(0, t.muted)
    setChaos(false)
    award(t.silenceAchievement)
  }

  const chooseFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('audio/')) {
      setMessage(t.invalidAudio)
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
    setMessage(t.trackAccepted)
  }

  const togglePlayback = async () => {
    const player = audio.current
    if (!player?.src) {
      setMessage(t.selectAudio)
      return
    }
    if (playing) {
      setPauseDrama(true)
      return
    }
    try {
      await player.play()
      setPlaying(true)
      setMessage(t.nowPlaying)
    } catch {
      setMessage(t.playBlocked)
    }
  }

  const confirmPause = (apology: boolean) => {
    audio.current?.pause()
    setPlaying(false)
    setPauseDrama(false)
    setMessage(apology ? t.forgiven : t.paused)
    if (apology) award(t.emotionalAchievement)
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
    setMessage(t.playerReset)
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
          setVolume(.01, t.pop)
          award(t.bubbleAchievement)
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
        setMessage(t.sliderBoundaries)
        if (next === 6) award(t.sliderAchievement)
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
        setVolume(next, t.oceanVolume(Math.round(next * 100)))
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

  useEffect(() => setMessage(t.playerInitial), [t])

  return (
    <section className="aqua-player glass" aria-label={t.player}>
      <audio ref={audio} preload="metadata" src="/music/manifest-tralala.mp3" />
      <header className="app-window__bar">
        <span className="brand-title"><span aria-hidden="true">♫</span><BrandMark className="brand-mark--window" /><span>{t.playerEdition}</span></span>
        <button type="button" onClick={onClose} aria-label={t.closePlayer}><X size={16} /></button>
      </header>

      <div className="aqua-player__body">
        <div className={`player-cd ${playing ? 'is-playing' : ''}`} aria-hidden="true"><img src="/images/holographic-dolphin-ocean-disc.png" alt="" /></div>

        <div className="player-now">
          <small>{t.dolphinDrive}</small>
          <strong>TRALALA</strong>
          <span className="player-file">{trackName}</span>
          <div className="equalizer" aria-hidden="true">
            {Array.from({ length: 14 }, (_, index) => <i key={index} style={{ '--eq': `${(index % 5) + 2}` } as React.CSSProperties} />)}
          </div>
          <label className="file-picker">
            <Upload size={15} /> {t.chooseAudio}
            <input type="file" accept="audio/*" onChange={chooseFile} />
          </label>
        </div>

        <div className="player-progress">
          <span>{formatTime(currentTime)}</span>
          <input aria-label={t.trackProgress} type="range" min="0" max={duration || 1} step=".1" value={Math.min(currentTime, duration || 1)} onChange={(event) => {
            const next = Number(event.target.value)
            if (audio.current) audio.current.currentTime = next
            setCurrentTime(next)
          }} />
          <span>{formatTime(duration)}</span>
        </div>

        <div className="player-controls">
          <button type="button" className="player-main" onClick={togglePlayback}>{playing ? <Pause /> : <Play />}{playing ? t.pause : t.play}</button>
          <button type="button" onClick={() => {
            if (volume === 0) setVolume(lastAudibleVolume, t.soundAgain)
            else emergencyMute()
          }}>{volume === 0 ? <Volume2 /> : <VolumeX />}{volume === 0 ? t.unmute : t.emergencyMute}</button>
          <button type="button" onClick={reset}><RotateCcw /> {t.reset}</button>
          <label className="chaos-switch"><input type="checkbox" checked={chaos} onChange={(event) => {
            setChaos(event.target.checked)
            setSliderOffset(0)
            setMessage(event.target.checked ? t.chaosBack : t.chaosOff)
          }} /> {t.chaos} {chaos ? t.on : t.off}</label>
        </div>

        <div className="normal-volume">
          <div><Volume2 size={16} /> {t.safeVolume}: {Math.round(volume * 100)}% <small>{t.cap}</small></div>
          <input aria-label={t.safeVolume} className="runaway-slider" style={{ transform: `translateX(${sliderOffset}px)` }} type="range" min="0" max={SAFE_CAP} step=".01" value={volume} onPointerEnter={temptSlider} onChange={(event) => {
            let next = Number(event.target.value)
            if (chaos && sliderDodges > 0 && sliderDodges % 4 === 0) {
              next = SAFE_CAP - next
              setMessage(t.opposite)
            }
            setVolume(next)
          }} />
        </div>

        <div className="volume-games">
          <article>
            <h3>{t.fishCatcher}</h3>
            <p>{t.catchFish}</p>
            <div className="fish-tank">
              {fishVolumes.map((value, index) => (
                <button key={value} type="button" style={{ '--fish-delay': `${index * -.47}s`, '--fish-speed': `${3.1 + index * .37}s` } as React.CSSProperties} onClick={() => {
                  setVolume(value, t.caughtFish(Math.round(value * 100)))
                  if (index === fishVolumes.length - 1) award(t.fishAchievement)
                }} aria-label={t.setVolume(Math.round(value * 100))}>🐟<span>{Math.round(value * 100)}%</span></button>
              ))}
            </div>
          </article>

          <article>
            <h3>{t.bubbleInflation}</h3>
            <p>{t.inflateHint}</p>
            <div className={`inflation-zone ${popped ? 'is-popped' : ''}`}>
              <span className="volume-bubble" style={{ width: `${38 + inflate * .75}px`, height: `${38 + inflate * .75}px` }}>{popped ? 'POP' : `${Math.round(Math.min(SAFE_CAP, inflate / 100 * SAFE_CAP) * 100)}%`}</span>
              <button type="button" onPointerDown={startInflating} onPointerUp={stopInflating} onPointerCancel={stopInflating} onPointerLeave={stopInflating}>{t.holdInflate}</button>
            </div>
          </article>
        </div>

        <p className="player-message" role="status">{message}</p>
      </div>

      {pauseDrama && (
        <div className="player-dialog" role="dialog" aria-modal="true" aria-label={t.pauseDialog}>
          <div className="glass"><strong>{t.mad}</strong><p>{t.pauseNotice}</p><button onClick={() => confirmPause(true)}>{t.perfect}</button><button onClick={() => confirmPause(false)}>{t.ears}</button></div>
        </div>
      )}
      {achievement && <div className="achievement-toast"><span>{t.achievement}</span><strong>{achievement}</strong></div>}
    </section>
  )
}
