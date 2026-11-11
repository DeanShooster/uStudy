import axios from 'axios'
import useSWR, { mutate } from 'swr'
import { z } from 'zod'
import { api, get } from './api'
import {
  NAME_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USER_ROUTES,
} from '../constants/constants'
import { EMAIL, NAME } from '../constants/regex'
import { dictionary } from '../dictionary/dictionary'

const copy = dictionary.auth

const emailSchema = z.string().regex(EMAIL, { error: copy.emailInvalid })

const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, { error: copy.passwordLength })
  .max(PASSWORD_MAX_LENGTH, { error: copy.passwordLength })

function filled(value: string) {
  return value.trim().length > 0
}

export const loginSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
  })
  .refine((value) => filled(value.email) && filled(value.password), {
    error: copy.invalidCredentials,
  })

export const registerSchema = z
  .object({
    email: emailSchema,
    name: z
      .string()
      .trim()
      .min(NAME_MIN_LENGTH, { error: copy.nameLength })
      .regex(NAME, { error: copy.nameLetters }),
    password: passwordSchema,
    rpassword: passwordSchema,
  })
  .refine((value) => value.password === value.rpassword, {
    path: ['rpassword'],
    error: copy.passwordMismatch,
  })
  .refine(
    (value) =>
      filled(value.email) &&
      filled(value.name) &&
      filled(value.password) &&
      filled(value.rpassword),
    { error: copy.invalidCredentials },
  )

const userTopicSchema = z.object({
  topic: z.object({
    name: z.string(),
  }),
  progress: z.number(),
})

export const userTopicsSchema = z.array(userTopicSchema)

const userSchema = z.object({
  name: z.string(),
  email: z.string(),
  topics: userTopicsSchema.default([]),
})

const authResponseSchema = z.object({
  token: z.string(),
  user: userSchema,
})

const sessionSchema = z.object({
  user: userSchema,
})

export type User = z.infer<typeof userSchema>
export type LoginBody = z.infer<typeof loginSchema>
export type RegisterBody = z.infer<typeof registerSchema>
export type AuthResponse = z.infer<typeof authResponseSchema>

export async function signIn(body: LoginBody) {
  const { data } = await api.post(USER_ROUTES.signIn, body)
  return authResponseSchema.parse(data)
}

export async function signUp(body: RegisterBody) {
  const { data } = await api.post(USER_ROUTES.signUp, body)
  return authResponseSchema.parse(data)
}

function readSession(url: string) {
  return get(url).then((data) => sessionSchema.parse(data))
}

export function useSession(token: string | null) {
  return useSWR(token ? USER_ROUTES.auth : null, readSession)
}

export function setSessionCache(user: User) {
  return mutate(USER_ROUTES.auth, { user }, { revalidate: false })
}

export function raiseTopicProgress(name: string, progress: number) {
  return mutate(
    USER_ROUTES.auth,
    (current: { user: User } | undefined) => {
      if (!current) return current
      const topics = current.user.topics.some((entry) => entry.topic.name === name)
        ? current.user.topics.map((entry) =>
            entry.topic.name === name ? { ...entry, progress: Math.max(entry.progress, progress) } : entry,
          )
        : [...current.user.topics, { topic: { name }, progress }]
      return { user: { ...current.user, topics } }
    },
    { revalidate: false },
  )
}

export function setTopicProgress(topics: User['topics']) {
  return mutate(
    USER_ROUTES.auth,
    (current: { user: User } | undefined) =>
      current ? { user: { ...current.user, topics } } : current,
    { revalidate: false },
  )
}

export function clearSessionCache() {
  return mutate(USER_ROUTES.auth, undefined, { revalidate: false })
}

export function isUnauthorized(error: unknown) {
  return axios.isAxiosError(error) && error.response?.status === 401
}

export function readAuthError(error: unknown) {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message
    if (typeof message === 'string' && message.length > 0) return message
  }
  return copy.requestFailed
}
