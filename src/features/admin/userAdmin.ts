/**
 * Administración de usuarios (Bloque D, tarea 14): lógica pura de filtros y
 * protecciones (no desactivarse a sí mismo, no dejar el sistema sin ADMIN).
 */
import type { AdminProfile, AssignedRole } from '../../services/administration'

export type UserFilter = 'ALL' | 'NO_ROLE' | 'INACTIVE'

export interface UserRow extends AdminProfile {
  roleCodes: string[]
}

export function buildUserRows(profiles: AdminProfile[], assigned: AssignedRole[]): UserRow[] {
  return profiles.map((profile) => ({
    ...profile,
    roleCodes: assigned.filter((item) => item.user_id === profile.id).map((item) => item.role_code).sort(),
  }))
}

export function filterUsers(rows: UserRow[], filter: UserFilter, search: string): UserRow[] {
  const term = search.trim().toLocaleLowerCase('es')
  return rows.filter((row) => {
    if (filter === 'NO_ROLE' && row.roleCodes.length > 0) return false
    if (filter === 'INACTIVE' && row.active) return false
    if (!term) return true
    return [row.full_name, row.email].some((value) => value?.toLocaleLowerCase('es').includes(term))
  })
}

/** Cuentas activas sin ningún rol: entran pero no pueden ver nada */
export function countActiveWithoutRole(rows: UserRow[]): number {
  return rows.filter((row) => row.active && row.roleCodes.length === 0).length
}

function activeAdmins(rows: UserRow[]): UserRow[] {
  return rows.filter((row) => row.active && row.roleCodes.includes('ADMIN'))
}

/** Motivo por el que no se puede activar/desactivar la cuenta, o null */
export function toggleActiveBlocker(rows: UserRow[], target: UserRow, currentUserId: string | undefined): string | null {
  if (target.id === currentUserId) return 'No puedes desactivar tu propia cuenta.'
  if (target.active && target.roleCodes.includes('ADMIN') && activeAdmins(rows).length <= 1) {
    return 'Es el único ADMIN activo: asigna otro ADMIN antes de desactivarlo.'
  }
  return null
}

/** Motivo por el que no se puede retirar el rol, o null */
export function removeRoleBlocker(
  rows: UserRow[],
  target: UserRow,
  roleCode: string,
  currentUserId: string | undefined,
): string | null {
  if (target.id === currentUserId) return 'No puedes retirarte tus propios roles.'
  if (roleCode === 'ADMIN' && target.active && activeAdmins(rows).length <= 1) {
    return 'Es el único ADMIN activo: asigna otro ADMIN antes de retirarle el rol.'
  }
  return null
}
