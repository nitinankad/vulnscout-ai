import { createContext, useContext, useState, type ReactNode } from 'react'
import type { AuthUser } from '@/lib/api'

interface AuthCtx {
  isAuthed: boolean
  token: string | null
  user: AuthUser | null
  login: (token: string, user: AuthUser) => void
  logout: () => void
}

const AuthContext = createContext<AuthCtx | null>(null)

function loadUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem('vs_user')
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthed, setIsAuthed] = useState(() => localStorage.getItem('vs_authed') === '1')
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('vs_token'))
  const [user, setUser] = useState<AuthUser | null>(loadUser)

  const login = (jwt: string, authUser: AuthUser) => {
    localStorage.setItem('vs_authed', '1')
    localStorage.setItem('vs_token', jwt)
    localStorage.setItem('vs_user', JSON.stringify(authUser))
    setToken(jwt)
    setUser(authUser)
    setIsAuthed(true)
  }

  const logout = () => {
    localStorage.removeItem('vs_authed')
    localStorage.removeItem('vs_token')
    localStorage.removeItem('vs_user')
    setIsAuthed(false)
    setToken(null)
    setUser(null)
  }

  return <AuthContext value={{ isAuthed, token, user, login, logout }}>{children}</AuthContext>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
