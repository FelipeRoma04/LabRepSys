import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  roleCodes,
  type AuthStatus,
  type RoleCode,
  type UserProfile,
  type UserRole,
} from '../types/auth'
import { supabase } from './supabase'
import { AuthContext, type AuthContextValue } from './auth-context'

interface AuthProviderProps {
  children: ReactNode
}

interface ProfileRow {
  id: string
  full_name: string | null
  email: string | null
  job_title: string | null
  active: boolean
}

interface RoleRow {
  role_code: string
  roles: { name: string } | { name: string }[] | null
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Ocurrió un error inesperado.'
}

function mapRoles(rows: RoleRow[]): UserRole[] {
  return rows.flatMap((row) => {
    if (!roleCodes.some((code) => code === row.role_code)) return []
    const role = Array.isArray(row.roles) ? row.roles[0] : row.roles
    return role ? [{ code: row.role_code as RoleCode, name: role.name }] : []
  })
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [status, setStatus] = useState<AuthStatus>(() =>
    supabase ? 'loading' : 'error',
  )
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [roles, setRoles] = useState<UserRole[]>([])
  const [loginError, setLoginError] = useState<string | null>(null)
  const [authError, setAuthError] = useState<string | null>(() =>
    supabase ? null : 'La conexión con Supabase no está configurada.',
  )
  const [isSigningOut, setIsSigningOut] = useState(false)

  useEffect(() => {
    const client = supabase
    if (!client) return

    let mounted = true
    let requestVersion = 0

    const loadSession = async (session: Session | null) => {
      const version = ++requestVersion
      setAuthError(null)

      if (!session) {
        setProfile(null)
        setRoles([])
        setStatus('anonymous')
        return
      }

      setStatus('loading')
      try {
        const [profileResult, rolesResult] = await Promise.all([
          client
            .from('profiles')
            .select('id, full_name, email, job_title, active')
            .eq('id', session.user.id)
            .maybeSingle(),
          client
            .from('user_roles')
            .select('role_code, roles(name)')
            .eq('user_id', session.user.id),
        ])

        if (profileResult.error) throw profileResult.error
        if (rolesResult.error) throw rolesResult.error
        if (!mounted || version !== requestVersion) return

        const row = profileResult.data as ProfileRow | null
        if (!row) {
          setProfile(null)
          setRoles([])
          setStatus('error')
          setAuthError('No se encontró el perfil asociado a esta cuenta.')
          return
        }

        setProfile({
          id: row.id,
          fullName: row.full_name,
          email: row.email,
          jobTitle: row.job_title,
          active: row.active,
        })
        setRoles(mapRoles((rolesResult.data ?? []) as RoleRow[]))
        setStatus(row.active ? 'authenticated' : 'inactive')
      } catch (error) {
        if (!mounted || version !== requestVersion) return
        setProfile(null)
        setRoles([])
        setStatus('error')
        setAuthError(errorMessage(error))
      }
    }

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => {
        if (mounted) void loadSession(session)
      }, 0)
    })

    void client.auth
      .getSession()
      .then(({ data, error }) => {
        if (!mounted) return
        if (error) {
          setStatus('error')
          setAuthError(error.message)
          return
        }
        void loadSession(data.session)
      })
      .catch((error: unknown) => {
        if (!mounted) return
        setStatus('error')
        setAuthError(errorMessage(error))
      })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('La conexión con Supabase no está configurada.')
    setLoginError(null)
    setAuthError(null)

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setLoginError(error.message)
      throw error
    }
  }, [])

  const logout = useCallback(async () => {
    if (!supabase) throw new Error('La conexión con Supabase no está configurada.')
    setIsSigningOut(true)
    setAuthError(null)
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      setProfile(null)
      setRoles([])
      setStatus('anonymous')
    } catch (error) {
      setAuthError(errorMessage(error))
      throw error
    } finally {
      setIsSigningOut(false)
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      profile,
      roles,
      loginError,
      authError,
      isSigningOut,
      login,
      logout,
      clearLoginError: () => setLoginError(null),
    }),
    [authError, isSigningOut, login, loginError, logout, profile, roles, status],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
