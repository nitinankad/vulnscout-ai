import { createContext, useContext, useState, type ReactNode } from 'react'

interface AuthCtx {
  isAuthed: boolean
  login: () => void
  logout: () => void
}

const AuthContext = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthed, setIsAuthed] = useState(() => sessionStorage.getItem('vs_authed') === '1')

  const login = () => {
    sessionStorage.setItem('vs_authed', '1')
    setIsAuthed(true)
  }

  const logout = () => {
    sessionStorage.removeItem('vs_authed')
    setIsAuthed(false)
  }

  return <AuthContext value={{ isAuthed, login, logout }}>{children}</AuthContext>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
