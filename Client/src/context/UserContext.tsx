import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { clearSessionCache, isUnauthorized, setSessionCache, useSession, type AuthResponse, type User } from '../api/auth'
import { TOKEN_KEY } from '../constants/constants'

type UserContextValue = {
  user: User | null
  isLoggedIn: boolean
  ready: boolean
  setSession: (session: AuthResponse) => void
  signOut: () => void
}

const UserContext = createContext<UserContextValue | null>(null)

export function UserProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY))
  const { data, error, isLoading } = useSession(token)
  const user = data?.user ?? null
  const ready = token === null || !isLoading

  useEffect(() => {
    if (!token || !error || !isUnauthorized(error)) return
    sessionStorage.removeItem(TOKEN_KEY)
    void clearSessionCache()
    setToken(null)
  }, [token, error])

  const setSession = useCallback((session: AuthResponse) => {
    sessionStorage.setItem(TOKEN_KEY, session.token)
    void setSessionCache(session.user)
    setToken(session.token)
  }, [])

  const signOut = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY)
    void clearSessionCache()
    setToken(null)
  }, [])

  const value = useMemo<UserContextValue>(
    () => ({
      user,
      isLoggedIn: user !== null,
      ready,
      setSession,
      signOut,
    }),
    [user, ready, setSession, signOut],
  )

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}

export function useUser() {
  const context = useContext(UserContext)
  if (!context) {
    throw new Error('useUser must be used within UserProvider')
  }
  return context
}
