import { useCallback, useEffect, useRef, useState } from 'react'

type SpeechRecognitionEventLike = Event & {
  results: ArrayLike<{ 0: { transcript: string } }>
}

type SpeechRecognitionErrorEventLike = Event & { error: string }

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onstart: (() => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
}

export type ListeningStatus = 'idle' | 'requesting' | 'listening' | 'unsupported' | 'denied'

interface Options {
  disabled?: boolean
  onWow: () => void
  onMiss: (attempts: number) => void
}

export function useWowRecognition({ disabled, onWow, onMiss }: Options) {
  const recognition = useRef<SpeechRecognitionLike | null>(null)
  const attempts = useRef(0)
  const [status, setStatus] = useState<ListeningStatus>('idle')
  const [failure, setFailure] = useState<string | null>(null)
  const supported = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)

  const stop = useCallback(() => {
    recognition.current?.abort()
    recognition.current = null
    setStatus('idle')
  }, [])

  const listen = useCallback(() => {
    if (disabled) return
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Recognition) {
      setStatus('unsupported')
      setFailure('This browser does not provide speech recognition. Open the demo in Chrome or use manual entry.')
      return
    }

    recognition.current?.abort()
    const next = new Recognition()
    recognition.current = next
    next.continuous = false
    next.interimResults = false
    next.lang = 'en-US'
    setFailure(null)
    next.onstart = () => setStatus('listening')
    next.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0]?.transcript ?? '').join(' ').toLowerCase()
      const normalized = transcript.replace(/[^a-z]/g, '')
      if (/wo+w+/.test(normalized) || normalized.includes('wow')) {
        attempts.current = 0
        onWow()
      } else {
        attempts.current += 1
        onMiss(attempts.current)
      }
    }
    next.onerror = (event) => {
      const denied = event.error === 'not-allowed' || event.error === 'service-not-allowed'
      setStatus(denied ? 'denied' : 'idle')
      const messages: Record<string, string> = {
        'not-allowed': 'Microphone permission was declined. Allow it in site settings or use manual entry.',
        'service-not-allowed': 'Speech recognition is blocked by this browser. Use Chrome or manual entry.',
        'audio-capture': 'No working microphone was found. Check your input device and try again.',
        'no-speech': 'I heard only mysterious ocean silence. Try saying “wow” again.',
        network: 'Speech recognition could not reach its service. Manual entry still works offline.',
      }
      setFailure(messages[event.error] ?? `Speech recognition stopped (${event.error}). Manual entry still works.`)
    }
    next.onend = () => {
      recognition.current = null
      setStatus((current) => current === 'denied' ? current : 'idle')
    }
    setStatus('requesting')
    try {
      next.start()
    } catch {
      setStatus('idle')
      setFailure('The microphone is already busy. Wait a moment and try again.')
    }
  }, [disabled, onMiss, onWow])

  useEffect(() => stop, [stop])

  return { listen, stop, status, supported, failure }
}
