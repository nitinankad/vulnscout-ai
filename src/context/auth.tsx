import { createContext, useContext, useState, type ReactNode } from 'react'

interface AuthCtx {
  isAuthed: boolean
  token: string | null
  login: (token?: string) => void
  logout: () => void
}

const AuthContext = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthed, setIsAuthed] = useState(() => localStorage.getItem('vs_authed') === '1')
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('vs_token'))

  const login = (jwt?: string) => {
    localStorage.setItem('vs_authed', '1')
    if (jwt) {
      localStorage.setItem('vs_token', jwt)
      setToken(jwt)
    }
    setIsAuthed(true)
  }

  const logout = () => {
    localStorage.removeItem('vs_authed')
    localStorage.removeItem('vs_token')
    setIsAuthed(false)
    setToken(null)
  }

  return <AuthContext value={{ isAuthed, token, login, logout }}>{children}</AuthContext>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
