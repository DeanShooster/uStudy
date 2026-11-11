import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import {
  loginSchema,
  readAuthError,
  registerSchema,
  signIn,
  signUp,
  type AuthResponse,
  type LoginBody,
  type RegisterBody,
} from '../../api/auth'
import { useUser } from '../../context/UserContext'
import { dictionary } from '../../dictionary/dictionary'
import './AuthDialog.scss'

type AuthMode = 'login' | 'register'

type FieldName = 'email' | 'name' | 'password' | 'rpassword'

type FieldErrors = Partial<Record<FieldName, string>>

const emptyLogin: LoginBody = { email: '', password: '' }
const emptyRegister: RegisterBody = { email: '', name: '', password: '', rpassword: '' }

function formMessage(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  return error.issues.find((issue) => issue.path.length === 0)?.message ?? ''
}

function fieldErrors(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  const errors: FieldErrors = {}
  for (const issue of error.issues) {
    const key = issue.path[0]
    if (typeof key === 'string' && !(key in errors)) {
      errors[key as keyof FieldErrors] = issue.message
    }
  }
  return errors
}

type Parsed<T> =
  | { success: true; data: T }
  | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } }

function Field({
  label,
  type,
  name,
  autoComplete,
  value,
  error,
  onBlur,
  onChange,
}: {
  label: string
  type: string
  name: string
  autoComplete: string
  value: string
  error?: string
  onBlur: () => void
  onChange: (value: string) => void
}) {
  return (
    <label className="auth-field">
      <span>{label}</span>
      <input
        type={type}
        name={name}
        autoComplete={autoComplete}
        value={value}
        aria-invalid={error ? true : undefined}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? <small>{error}</small> : null}
    </label>
  )
}

export default function AuthDialog({ onClose }: { onClose: () => void }) {
  const { setSession } = useUser()
  const titleId = useId()
  const [mode, setMode] = useState<AuthMode>('login')
  const [loginValues, setLoginValues] = useState(emptyLogin)
  const [registerValues, setRegisterValues] = useState(emptyRegister)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState('')
  const [pending, setPending] = useState(false)
  const [closing, setClosing] = useState(false)
  const closingRef = useRef(false)
  const copy = dictionary.auth
  const isLogin = mode === 'login'

  const requestClose = useCallback(() => {
    if (closingRef.current) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onClose()
      return
    }
    closingRef.current = true
    setClosing(true)
  }, [onClose])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestClose()
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [requestClose])

  function switchMode(next: AuthMode) {
    setMode(next)
    setErrors({})
    setFormError('')
  }

  function messageFor(field: FieldName) {
    const parsed = isLogin
      ? loginSchema.safeParse(loginValues)
      : registerSchema.safeParse(registerValues)
    if (parsed.success) return undefined
    return fieldErrors(parsed.error)[field]
  }

  function onBlur(field: FieldName) {
    setErrors((current) => {
      const next = { ...current }
      const apply = (key: FieldName) => {
        const message = messageFor(key)
        if (message) next[key] = message
        else delete next[key]
      }

      apply(field)
      if (!isLogin && field === 'password' && current.rpassword) apply('rpassword')
      return next
    })
  }

  async function finish<T>(parsed: Parsed<T>, send: (data: T) => Promise<AuthResponse>) {
    if (!parsed.success) {
      setFormError(formMessage(parsed.error))
      return
    }

    setPending(true)
    try {
      const result = await send(parsed.data)
      setSession(result)
      requestClose()
    } catch (error) {
      setFormError(readAuthError(error))
    } finally {
      setPending(false)
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')
    if (isLogin) {
      void finish(loginSchema.safeParse(loginValues), signIn)
      return
    }
    void finish(registerSchema.safeParse(registerValues), signUp)
  }

  return (
    <div
      className={closing ? 'auth-overlay is-closing' : 'auth-overlay'}
      onMouseDown={requestClose}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && event.animationName === 'auth-overlay-out') {
          onClose()
        }
      }}
    >
      <div
        className="auth-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="auth-dialog-head">
          <h2 id={titleId}>{isLogin ? copy.loginTitle : copy.registerTitle}</h2>
          <button type="button" className="auth-close" onClick={requestClose}>
            {copy.close}
          </button>
        </div>

        <form className="auth-form" onSubmit={onSubmit} noValidate>
          <Field
            label={copy.email}
            type="email"
            name="email"
            autoComplete="email"
            value={isLogin ? loginValues.email : registerValues.email}
            error={errors.email}
            onBlur={() => onBlur('email')}
            onChange={(email) => {
              if (isLogin) setLoginValues((current) => ({ ...current, email }))
              else setRegisterValues((current) => ({ ...current, email }))
            }}
          />

          {isLogin ? null : (
            <Field
              label={copy.name}
              type="text"
              name="name"
              autoComplete="name"
              value={registerValues.name}
              error={errors.name}
              onBlur={() => onBlur('name')}
              onChange={(name) => setRegisterValues((current) => ({ ...current, name }))}
            />
          )}

          <Field
            label={copy.password}
            type="password"
            name="password"
            autoComplete={isLogin ? 'current-password' : 'new-password'}
            value={isLogin ? loginValues.password : registerValues.password}
            error={errors.password}
            onBlur={() => onBlur('password')}
            onChange={(password) => {
              if (isLogin) setLoginValues((current) => ({ ...current, password }))
              else setRegisterValues((current) => ({ ...current, password }))
            }}
          />

          {isLogin ? null : (
            <Field
              label={copy.repeatPassword}
              type="password"
              name="rpassword"
              autoComplete="new-password"
              value={registerValues.rpassword}
              error={errors.rpassword}
              onBlur={() => onBlur('rpassword')}
              onChange={(rpassword) => setRegisterValues((current) => ({ ...current, rpassword }))}
            />
          )}

          {formError ? <p className="auth-form-error">{formError}</p> : null}

          <button type="submit" className="button button-solid auth-submit" disabled={pending}>
            {isLogin ? copy.submitLogin : copy.submitRegister}
          </button>
        </form>

        <p className="auth-switch">
          {isLogin ? copy.signupPrompt : copy.loginPrompt}{' '}
          <button
            type="button"
            onClick={() => switchMode(isLogin ? 'register' : 'login')}
          >
            {isLogin ? copy.signupAction : copy.loginAction}
          </button>
        </p>
      </div>
    </div>
  )
}
