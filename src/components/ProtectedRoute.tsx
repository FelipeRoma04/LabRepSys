import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { RoleCode } from '../types/auth'
import { useAuth } from '../hooks/useAuth'
import { AccessDeniedPage } from '../pages/AccessDeniedPage'
import { ErrorState } from './ErrorState'
import { LoadingState } from './LoadingState'

interface ProtectedRouteProps {
  children: ReactNode
  allowedRoles?: readonly RoleCode[]
}

export function ProtectedRoute({
  children,
  allowedRoles,
}: ProtectedRouteProps) {
  const { status, roles, authError } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return <LoadingState message="Verificando la sesión…" />
  }

  if (status === 'anonymous') {
    return (
      <Navigate
        replace
        to="/login"
        state={{ from: `${location.pathname}${location.search}` }}
      />
    )
  }

  if (status === 'inactive') return <AccessDeniedPage inactive />
  if (status === 'error') {
    return (
      <ErrorState
        message={authError ?? 'No fue posible verificar la sesión.'}
        title="No se pudo verificar el acceso"
      />
    )
  }

  if (
    allowedRoles &&
    !roles.some((role) => allowedRoles.includes(role.code))
  ) {
    return <AccessDeniedPage />
  }

  return children
}
