export const roleCodes = [
  'ADMIN',
  'ADMIN_TECNICO',
  'COMERCIAL',
  'MUESTREO',
  'RECEPCION',
  'ANALISTA',
  'JEFE_TECNICA_CALIDAD',
  'AUDITOR',
] as const

export type RoleCode = (typeof roleCodes)[number]

export interface UserRole {
  code: RoleCode
  name: string
}

export interface UserProfile {
  id: string
  fullName: string | null
  email: string | null
  jobTitle: string | null
  active: boolean
}

export type AuthStatus =
  | 'loading'
  | 'authenticated'
  | 'anonymous'
  | 'inactive'
  | 'error'
