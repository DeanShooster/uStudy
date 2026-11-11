import { useEffect, useRef, useState, type FormEvent } from 'react'
import { openClassroom, streamClassroomMessage, transcribeSpeech, tutorSpeech, type ClassroomSource, type LessonPhase } from '../../api/classroom'
import { raiseTopicProgress } from '../../api/auth'
import ProgressBar from '../../components/ProgressBar'
import { useUser } from '../../context/UserContext'
import { dictionary } from '../../dictionary/dictionary'
import { classes } from '../../utils/classes'
import { topicProgress } from '../../utils/progress'
import Board, { type BoardHandle } from './Board'
import './Classroom.scss'

type Turn = {
  id: string
  role: 'user' | 'tutor'
  text: string
  pending?: boolean
}

type Capture = {
  recorder: MediaRecorder
  stream: MediaStream
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('unreadable recording'))
    reader.readAsDataURL(blob)
  })
}

function recordingType() {
  if (typeof MediaRecorder === 'undefined') return null
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus'
  if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm'
  return ''
}

const WAVE_BARS = 21

export default function Classroom({ topic, onClose }: { topic: string; onClose: () => void }) {
  const boardRef = useRef<BoardHandle>(null)
  const captureRef = useRef<Capture | null>(null)
  const talkToken = useRef(0)
  const armingRef = useRef(false)
  const sendOnEndRef = useRef(false)
  const transcribeRef = useRef<AbortController | null>(null)
  const streamRef = useRef<AbortController | null>(null)
  const speechRef = useRef<AbortController | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [listening, setListening] = useState(false)
  const [busy, setBusy] = useState(false)
  const [voicing, setVoicing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const voiceToken = useRef(0)
  const speechQueue = useRef<string[]>([])
  const speechRest = useRef('')
  const speechOpen = useRef(false)
  const draining = useRef(false)
  const ahead = useRef<Promise<Blob> | null>(null)
  const clipDone = useRef<(() => void) | null>(null)
  const speechWait = useRef<(() => void) | null>(null)
  const closeRef = useRef(onClose)
  const phaseRef = useRef<LessonPhase>('greet')
  const busyRef = useRef(false)
  const runRef = useRef(0)
  const lastImageRef = useRef<string | null>(null)
  const watchTimer = useRef<number | null>(null)
  const sendRef = useRef<(text: string, source: ClassroomSource) => void>(() => {})
  const [phase, setPhase] = useState<LessonPhase>('greet')
  const { user } = useUser()
  const copy = dictionary.classroom
  const progress = topicProgress(user?.topics, topic) ?? 0
  const account = user?.email ?? null
  closeRef.current = onClose

  function wakeSpeech() {
    const wait = speechWait.current
    speechWait.current = null
    wait?.()
  }

  function dropAhead() {
    const pending = ahead.current
    ahead.current = null
    pending?.catch(() => {})
  }

  function stopPlayback() {
    const done = clipDone.current
    clipDone.current = null
    const audio = audioRef.current
    audioRef.current = null
    if (audio) {
      audio.onended = null
      audio.onerror = null
      audio.pause()
    }
    done?.()
  }

  function stopVoice() {
    voiceToken.current += 1
    speechQueue.current = []
    speechRest.current = ''
    speechOpen.current = false
    dropAhead()
    speechRef.current?.abort()
    speechRef.current = null
    stopPlayback()
    wakeSpeech()
    setVoicing(false)
  }

  function beginSpeech() {
    if (!speechRef.current) speechRef.current = new AbortController()
    return speechRef.current
  }

  function ensureAhead() {
    if (ahead.current || speechQueue.current.length === 0) return
    const sentence = speechQueue.current.shift() ?? ''
    const signal = beginSpeech().signal
    const pending = tutorSpeech(sentence, signal)
    ahead.current = pending
    pending.catch(() => {})
  }

  function waitForSpeech() {
    return new Promise<void>((resolve) => {
      const timer = window.setTimeout(() => {
        if (speechWait.current === finish) speechWait.current = null
        resolve()
      }, 250)
      const finish = () => {
        window.clearTimeout(timer)
        resolve()
      }
      speechWait.current = finish
    })
  }

  function playClip(blob: Blob, run: number) {
    return new Promise<void>((resolve, reject) => {
      if (voiceToken.current !== run) {
        resolve()
        return
      }
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio
      const release = () => {
        if (clipDone.current === finish) clipDone.current = null
        URL.revokeObjectURL(url)
        if (audioRef.current === audio) audioRef.current = null
      }
      const finish = () => {
        release()
        resolve()
      }
      clipDone.current = finish
      audio.onended = finish
      audio.onerror = () => {
        release()
        reject(new Error(copy.voiceFailed))
      }
      void audio.play().then(() => {
        if (voiceToken.current === run) setVoicing(true)
      }).catch((error: unknown) => {
        release()
        reject(error instanceof Error ? error : new Error(copy.voiceFailed))
      })
    })
  }

  async function drainSpeech(run: number) {
    if (draining.current) return
    draining.current = true
    beginSpeech()
    setVoicing(true)
    let spoke = false

    try {
      while (voiceToken.current === run) {
        ensureAhead()
        const pending = ahead.current
        if (!pending) {
          if (!speechOpen.current) break
          await waitForSpeech()
          continue
        }
        let blob: Blob
        try {
          blob = await pending
        } catch {
          if (ahead.current === pending) ahead.current = null
          if (speechRef.current?.signal.aborted || voiceToken.current !== run) return
          continue
        }
        if (ahead.current === pending) ahead.current = null
        if (voiceToken.current !== run) return
        ensureAhead()
        try {
          await playClip(blob, run)
          spoke = true
        } catch {
          if (speechRef.current?.signal.aborted || voiceToken.current !== run) return
        }
      }
    } catch {
      if (speechRef.current?.signal.aborted || voiceToken.current !== run) return
      if (!spoke) {
        setVoicing(false)
        setError(copy.voiceFailed)
      }
    } finally {
      draining.current = false
      const current = voiceToken.current
      const pendingWork = speechQueue.current.length > 0 || ahead.current !== null
      if (current !== run) {
        if (pendingWork) void drainSpeech(current)
        return
      }
      if (pendingWork) {
        void drainSpeech(run)
        return
      }
      if (!speechOpen.current) {
        setVoicing(false)
        if (!spoke) setError(copy.voiceFailed)
      }
    }
  }

  function feedSpeech(chunk: string, flush = false) {
    const run = voiceToken.current
    speechOpen.current = !flush
    speechRest.current += chunk
    if (!flush) return
    const text = speechRest.current.trim()
    speechRest.current = ''
    if (!text) {
      wakeSpeech()
      if (!draining.current && !ahead.current) setVoicing(false)
      return
    }
    speechQueue.current = [text]
    ahead.current?.catch(() => {})
    ahead.current = null
    ensureAhead()
    wakeSpeech()
    void drainSpeech(run)
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current()
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
      talkToken.current += 1
      sendOnEndRef.current = false
      const capture = captureRef.current
      captureRef.current = null
      capture?.stream.getTracks().forEach((track) => track.stop())
      if (capture && capture.recorder.state !== 'inactive') capture.recorder.stop()
      transcribeRef.current?.abort()
      if (watchTimer.current) window.clearTimeout(watchTimer.current)
      streamRef.current?.abort()
      voiceToken.current += 1
      speechQueue.current = []
      speechRest.current = ''
      speechOpen.current = false
      const pending = ahead.current
      ahead.current = null
      pending?.catch(() => {})
      speechRef.current?.abort()
      speechRef.current = null
      const done = clipDone.current
      clipDone.current = null
      const audio = audioRef.current
      audioRef.current = null
      audio?.pause()
      done?.()
      speechWait.current?.()
      speechWait.current = null
      setVoicing(false)
    }
  }, [])

  useEffect(() => {
    if (!account) {
      setSessionId(null)
      setSessionError(null)
      return
    }

    const controller = new AbortController()
    setSessionError(null)
    setTurns([])
    setPhase('greet')
    phaseRef.current = 'greet'
    setSessionId(null)
    openClassroom(topic, controller.signal)
      .then((session) => {
        if (!controller.signal.aborted) setSessionId(session.id)
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setSessionId(null)
        setSessionError(reason instanceof Error && reason.message ? reason.message : copy.tutorFailed)
      })
    return () => controller.abort()
  }, [topic, account, copy.tutorFailed])

  useEffect(() => {
    if (!sessionId) return
    const start = window.setTimeout(() => sendRef.current('', 'start'), 0)
    return () => {
      window.clearTimeout(start)
      streamRef.current?.abort()
    }
  }, [sessionId])

  useEffect(() => {
    const log = logRef.current
    if (!log) return
    log.scrollTop = log.scrollHeight
  }, [turns])

  function scheduleWatch() {
    if (phaseRef.current !== 'riddle') return
    if (watchTimer.current) window.clearTimeout(watchTimer.current)
    watchTimer.current = window.setTimeout(() => {
      watchTimer.current = null
      if (phaseRef.current !== 'riddle') return
      if (busyRef.current) {
        scheduleWatch()
        return
      }
      sendRef.current('', 'board')
    }, 1400)
  }

  async function send(text: string, source: ClassroomSource) {
    if (!sessionId || busyRef.current) return
    const trimmed = text.trim()
    const quiet = source === 'start' || source === 'board' || source === 'continue'
    const image = source === 'start' ? undefined : (boardRef.current?.exportImage() ?? undefined)
    if (source === 'board' && (!image || image === lastImageRef.current)) return
    if (!quiet && !trimmed && !image) {
      setError(null)
      return
    }

    const run = runRef.current + 1
    runRef.current = run
    busyRef.current = true
    if (source === 'board' && image) lastImageRef.current = image
    if (source !== 'board') stopVoice()
    setError(null)
    if (!quiet) setDraft('')
    setBusy(true)
    const tutorId = crypto.randomUUID()
    const showNow = source !== 'board'
    setTurns((current) => [
      ...current,
      ...(quiet
        ? []
        : [{ id: crypto.randomUUID(), role: 'user' as const, text: trimmed || copy.board }]),
      ...(showNow ? [{ id: tutorId, role: 'tutor' as const, text: '', pending: true }] : []),
    ])

    const controller = new AbortController()
    streamRef.current = controller
    let spoken = ''
    let shown = showNow
    let hearing = source !== 'board'

    try {
      await streamClassroomMessage(
        sessionId,
        { text: trimmed, image, source },
        (event) => {
          if (event.board?.length) {
            boardRef.current?.setLesson(event.board)
            lastImageRef.current = null
          }
          if (event.phase) {
            phaseRef.current = event.phase
            setPhase(event.phase)
          }
          if (typeof event.progress === 'number') void raiseTopicProgress(topic, event.progress)
          if (!event.text) return
          spoken += event.text
          if (!hearing) {
            stopVoice()
            hearing = true
          }
          feedSpeech(event.text)
          if (!shown) {
            shown = true
            setTurns((current) => [...current, { id: tutorId, role: 'tutor', text: spoken, pending: true }])
            return
          }
          setTurns((current) => current.map((turn) => (turn.id === tutorId ? { ...turn, text: spoken } : turn)))
        },
        controller.signal,
      )
      if (spoken) {
        setTurns((current) => current.map((turn) => (turn.id === tutorId ? { ...turn, pending: false } : turn)))
        feedSpeech('', true)
      } else {
        setTurns((current) => current.filter((turn) => turn.id !== tutorId))
      }
    } catch (reason) {
      if (source === 'board') lastImageRef.current = null
      setTurns((current) => current.filter((turn) => turn.id !== tutorId || turn.text.length > 0))
      if (controller.signal.aborted) return
      setError(reason instanceof Error && reason.message ? reason.message : copy.tutorFailed)
    } finally {
      if (runRef.current === run) {
        if (streamRef.current === controller) streamRef.current = null
        busyRef.current = false
        setBusy(false)
      }
    }
  }

  sendRef.current = (text, source) => {
    void send(text, source)
  }

  function stopTalking(shouldSend: boolean) {
    sendOnEndRef.current = shouldSend
    const recorder = captureRef.current?.recorder
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    else setListening(false)
  }

  async function finishTalking(blob: Blob) {
    if (blob.size < 800) {
      setError(copy.voiceEmpty)
      return
    }

    const controller = new AbortController()
    transcribeRef.current = controller
    busyRef.current = true
    setBusy(true)
    setError(null)
    let handedOff = false

    try {
      const audio = await blobToDataUrl(blob)
      const text = (await transcribeSpeech(audio, controller.signal)).trim()
      if (!text || text.toUpperCase() === 'NONE') {
        setError(copy.voiceEmpty)
        return
      }
      setDraft(text)
      handedOff = true
      busyRef.current = false
      void send(text, 'voice')
    } catch (reason) {
      if (controller.signal.aborted) return
      setError(reason instanceof Error && reason.message ? reason.message : copy.tutorFailed)
    } finally {
      if (transcribeRef.current === controller) transcribeRef.current = null
      if (!handedOff) {
        busyRef.current = false
        setBusy(false)
      }
    }
  }

  async function startTalking() {
    if (busy || !sessionId || listening || armingRef.current) return
    const mimeType = recordingType()
    if (mimeType === null || !navigator.mediaDevices?.getUserMedia) {
      setError(copy.voiceUnavailable)
      return
    }

    const token = talkToken.current + 1
    talkToken.current = token
    armingRef.current = true
    stopVoice()
    setError(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (token !== talkToken.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      const chunks: Blob[] = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data)
      }
      recorder.onstop = () => {
        const shouldSend = sendOnEndRef.current
        sendOnEndRef.current = false
        stream.getTracks().forEach((track) => track.stop())
        if (captureRef.current?.recorder === recorder) captureRef.current = null
        setListening(false)
        if (shouldSend) void finishTalking(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }))
      }

      captureRef.current = { recorder, stream }
      sendOnEndRef.current = true
      recorder.start()
      setListening(true)
    } catch {
      if (token === talkToken.current) {
        setListening(false)
        setError(copy.voiceUnavailable)
      }
    } finally {
      armingRef.current = false
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (listening) {
      stopTalking(true)
      return
    }
    void send(draft, 'text')
  }

  return (
    <div className="classroom" role="dialog" aria-modal="true" aria-label={copy.label}>
      <header className="classroom-bar">
        <h2>{topic}</h2>
        <div className="classroom-end">
          <div className="classroom-progress">
            <span>{progress}%</span>
            <ProgressBar className="progress-bar-inline" progress={progress} />
          </div>
          <button type="button" className="classroom-close" onClick={onClose}>
            {copy.close}
          </button>
        </div>
      </header>
      <div className="classroom-body">
        <Board handle={boardRef} prompt={phase === 'riddle' ? copy.answerHint : ''} onInk={scheduleWatch} />
        <section className="classroom-side">
          <div className="classroom-voice-wrap">
            <div className={classes('classroom-voice', (voicing || busy) && 'is-talking')} aria-hidden="true">
              {Array.from({ length: WAVE_BARS }, (_, index) => (
                <span key={index} style={{ animationDelay: `${(index % 7) * 0.08}s` }} />
              ))}
            </div>
            {error === copy.voiceFailed ? <p className="classroom-voice-note">{copy.voiceFailed}</p> : null}
          </div>
          <div className="classroom-reply" ref={logRef} aria-label={copy.tutorVoice}>
            {!user ? <p className="classroom-status">{copy.signIn}</p> : null}
            {user && sessionError ? <p className="classroom-status">{sessionError}</p> : null}
            {user && !sessionError && !sessionId ? <p className="classroom-status">{copy.opening}</p> : null}
            {turns.map((turn) => (
              <p key={turn.id} className={turn.role === 'user' ? 'classroom-turn is-user' : 'classroom-turn is-tutor'}>
                <span>{turn.role === 'user' ? dictionary.session.you : dictionary.session.tutor}</span>
                {turn.text || (turn.pending ? dictionary.session.thinking : '')}
              </p>
            ))}
            {listening ? <p className="classroom-status">{copy.hearing}</p> : null}
            {error && error !== copy.voiceFailed ? <p className="classroom-status">{error}</p> : null}
          </div>
          <form className="classroom-compose" onSubmit={onSubmit}>
            <button type="button" className="classroom-continue" disabled={!sessionId || busy || listening} onClick={() => sendRef.current('', 'continue')}>
              {copy.continue}
            </button>
            <div className="classroom-compose-row">
              <input
                value={draft}
                placeholder={copy.placeholder}
                disabled={!sessionId || busy || listening}
                onChange={(event) => setDraft(event.target.value)}
              />
              <button type="button" className={listening ? 'is-listening' : undefined} disabled={!sessionId || busy} onClick={() => (listening ? stopTalking(true) : void startTalking())}>
                {listening ? copy.stop : copy.talk}
              </button>
              <button type="submit" className="button button-solid" disabled={!sessionId || busy || listening}>
                {copy.send}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  )
}
