import { createContext } from 'react'
import type { AuthStatus, UserProfile, UserRole } from '../types/auth'

export interface AuthContextValue {
  status: AuthStatus
  profile: UserProfile | null
  roles: UserRole[]
  loginError: string | null
  authError: string | null
  isSigningOut: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  clearLoginError: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
