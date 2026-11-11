import axios from 'axios'
import { z } from 'zod'
import { api } from './api'
import { readAuthError } from './auth'
import { CLASSROOM_ROUTES, SERVER_URL, TOKEN_KEY } from '../constants/constants'
import { dictionary } from '../dictionary/dictionary'

const sessionResponseSchema = z.object({
  session: z.object({
    id: z.string(),
    topic: z.string(),
  }),
})

export type ClassroomSession = z.infer<typeof sessionResponseSchema>['session']

export type ClassroomSource = 'text' | 'voice' | 'start' | 'board' | 'continue'

export type LessonPhase = 'greet' | 'teach' | 'riddle' | 'done'

export type ClassroomEvent = {
  text?: string
  board?: string[]
  phase?: LessonPhase
  progress?: number
}

async function readFailure(response: Response) {
  try {
    const data: unknown = await response.json()
    if (typeof data === 'object' && data !== null && 'message' in data && typeof data.message === 'string' && data.message) {
      return data.message
    }
  } catch {
    return dictionary.classroom.tutorFailed
  }
  return dictionary.classroom.tutorFailed
}

export async function openClassroom(topic: string, signal?: AbortSignal) {
  try {
    const { data } = await api.post(CLASSROOM_ROUTES.sessions, { topic }, { signal })
    return sessionResponseSchema.parse(data).session
  } catch (error) {
    if (signal?.aborted || axios.isCancel(error)) throw error
    throw new Error(readAuthError(error))
  }
}

const transcriptSchema = z.object({
  text: z.string(),
})

export async function transcribeSpeech(audio: string, signal?: AbortSignal) {
  const token = sessionStorage.getItem(TOKEN_KEY)
  const response = await fetch(`${SERVER_URL}${CLASSROOM_ROUTES.transcribe}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ audio }),
    signal,
  })

  if (!response.ok) {
    throw new Error(await readFailure(response))
  }

  return transcriptSchema.parse(await response.json()).text
}

export async function tutorSpeech(text: string, signal?: AbortSignal) {
  const token = sessionStorage.getItem(TOKEN_KEY)
  const response = await fetch(`${SERVER_URL}${CLASSROOM_ROUTES.speech}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ text }),
    signal,
  })

  if (!response.ok) {
    throw new Error(await readFailure(response))
  }

  return response.blob()
}

export async function streamClassroomMessage(
  id: string,
  body: { text: string; image?: string; source: ClassroomSource },
  onEvent: (event: ClassroomEvent) => void,
  signal?: AbortSignal,
) {
  const token = sessionStorage.getItem(TOKEN_KEY)
  const response = await fetch(`${SERVER_URL}${CLASSROOM_ROUTES.message(id)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    throw new Error(await readFailure(response))
  }

  if (!response.body) {
    throw new Error(dictionary.classroom.tutorFailed)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''

    for (const part of parts) {
      const line = part.split('\n').find((entry) => entry.startsWith('data:'))
      if (!line) continue
      const data = line.slice(5).trim()
      if (!data || data === '[DONE]') continue
      let payload: { text?: string; error?: string; board?: unknown; phase?: unknown; progress?: unknown }
      try {
        payload = JSON.parse(data) as { text?: string; error?: string; board?: unknown; phase?: unknown; progress?: unknown }
      } catch {
        continue
      }
      if (payload.error) throw new Error(payload.error)
      const event: ClassroomEvent = {}
      if (payload.text) event.text = payload.text
      if (Array.isArray(payload.board)) event.board = payload.board.filter((line) => typeof line === 'string' && line.trim()).map((line) => line.trim())
      if (payload.phase === 'greet' || payload.phase === 'teach' || payload.phase === 'riddle' || payload.phase === 'done') {
        event.phase = payload.phase
      }
      if (typeof payload.progress === 'number' && Number.isFinite(payload.progress)) event.progress = payload.progress
      if (event.text || event.board || event.phase || event.progress !== undefined) onEvent(event)
    }
  }
}
