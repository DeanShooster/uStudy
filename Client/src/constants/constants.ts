export const SERVER_URL = 'http://localhost:4000'

export const USER_ROUTES = {
  signUp: '/sign-up',
  signIn: '/sign-in',
  auth: '/auth',
} as const

export const COURSE_ROUTES = {
  categories: '/courses/categories',
  byCategory: (category: string) => `/courses/${encodeURIComponent(category)}`,
  complete: (name: string) => `/courses/complete/${encodeURIComponent(name)}`,
  remove: (name: string) => `/courses/remove/${encodeURIComponent(name)}`,
} as const

export const CLASSROOM_ROUTES = {
  sessions: '/classroom/sessions',
  message: (id: string) => `/classroom/sessions/${encodeURIComponent(id)}/messages`,
  speech: '/classroom/speech',
  transcribe: '/classroom/transcribe',
} as const

export const TOKEN_KEY = 'ustudy.token'

export const PASSWORD_MIN_LENGTH = 6

export const PASSWORD_MAX_LENGTH = 12

export const NAME_MIN_LENGTH = 3
