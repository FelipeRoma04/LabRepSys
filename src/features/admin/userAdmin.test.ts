import { describe, expect, it } from 'vitest'
import { buildUserRows, countActiveWithoutRole, filterUsers, removeRoleBlocker, toggleActiveBlocker } from './userAdmin'

const profiles = [
  { id: 'admin-1', full_name: 'Ana Admin', email: 'ana@lab.test', active: true },
  { id: 'nuevo', full_name: 'Nuevo Usuario', email: 'nuevo@lab.test', active: true },
  { id: 'inactivo', full_name: 'Inés Inactiva', email: 'ines@lab.test', active: false },
]
const assigned = [
  { user_id: 'admin-1', role_code: 'ADMIN' },
  { user_id: 'inactivo', role_code: 'ANALISTA' },
]
const rows = buildUserRows(profiles, assigned)

describe('administración de usuarios', () => {
  it('filtra cuentas sin rol, inactivas y por nombre o correo', () => {
    expect(filterUsers(rows, 'NO_ROLE', '').map((row) => row.id)).toEqual(['nuevo'])
    expect(filterUsers(rows, 'INACTIVE', '').map((row) => row.id)).toEqual(['inactivo'])
    expect(filterUsers(rows, 'ALL', 'INÉS').map((row) => row.id)).toEqual(['inactivo'])
    expect(countActiveWithoutRole(rows)).toBe(1)
  })

  it('no deja desactivarse a sí mismo ni dejar el sistema sin ADMIN activo', () => {
    const admin = rows[0]
    expect(toggleActiveBlocker(rows, admin, 'admin-1')).toMatch(/propia cuenta/)
    expect(toggleActiveBlocker(rows, admin, 'otro')).toMatch(/único ADMIN activo/)
    expect(removeRoleBlocker(rows, admin, 'ADMIN', 'otro')).toMatch(/único ADMIN activo/)
    expect(toggleActiveBlocker(rows, rows[1], 'admin-1')).toBeNull()
  })

  it('permite retirar ADMIN cuando hay otro ADMIN activo', () => {
    const twoAdmins = buildUserRows(profiles, [...assigned, { user_id: 'nuevo', role_code: 'ADMIN' }])
    expect(removeRoleBlocker(twoAdmins, twoAdmins[0], 'ADMIN', 'nuevo')).toBeNull()
    expect(toggleActiveBlocker(twoAdmins, twoAdmins[0], 'nuevo')).toBeNull()
  })
})
