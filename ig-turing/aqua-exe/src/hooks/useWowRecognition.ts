import { useCallback, useEffect, useRef, useState } from 'react'
import type { Language, Translation } from '../i18n'

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
  language: Language
  t: Translation
  onWow: () => void
  onMiss: (attempts: number) => void
}

export function useWowRecognition({ disabled, language, t, onWow, onMiss }: Options) {
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
      setFailure(t.unsupported)
      return
    }

    recognition.current?.abort()
    const next = new Recognition()
    recognition.current = next
    next.continuous = false
    next.interimResults = false
    next.lang = language === 'tr' ? 'tr-TR' : 'en-US'
    setFailure(null)
    next.onstart = () => setStatus('listening')
    next.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0]?.transcript ?? '').join(' ').toLocaleLowerCase(language === 'tr' ? 'tr-TR' : 'en-US')
      const normalized = transcript.normalize('NFD').replace(/[^a-z]/g, '')
      if (/wo+w+/.test(normalized) || normalized.includes('wow') || (language === 'tr' && normalized.includes('vay'))) {
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
        'not-allowed': t.micDenied,
        'service-not-allowed': t.speechBlocked,
        'audio-capture': t.noMic,
        'no-speech': t.noSpeech,
        network: t.speechNetwork,
      }
      setFailure(messages[event.error] ?? t.speechStopped(event.error))
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
      setFailure(t.micBusy)
    }
  }, [disabled, language, onMiss, onWow, t])

  useEffect(() => stop, [stop])
  useEffect(() => {
    stop()
    attempts.current = 0
    setFailure(null)
  }, [language, stop])

  return { listen, stop, status, supported, failure }
}
