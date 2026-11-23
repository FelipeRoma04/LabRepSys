/**
 * Usuarios y roles: buscar, filtrar cuentas sin rol o inactivas, asignar y
 * retirar roles y activar o desactivar cuentas (con confirmación).
 * La invitación de usuarios sigue haciéndose desde Supabase Authentication.
 */
import { useMemo, useState } from 'react'
import { StatusBadge } from '../../components/StatusBadge'
import type { AdminProfile, AdminRole, AssignedRole } from '../../services/administration'
import {
  buildUserRows,
  countActiveWithoutRole,
  filterUsers,
  removeRoleBlocker,
  toggleActiveBlocker,
  type UserFilter,
  type UserRow,
} from './userAdmin'

interface Props {
  profiles: AdminProfile[]
  roles: AdminRole[]
  assigned: AssignedRole[]
  currentUserId: string | undefined
  saving: boolean
  onToggleActive: (user: UserRow) => void
  onAssignRole: (user: UserRow, roleCode: string) => void
  onRemoveRole: (user: UserRow, roleCode: string) => void
}

const FILTER_LABELS: Record<UserFilter, string> = {
  ALL: 'Todas',
  NO_ROLE: 'Sin rol',
  INACTIVE: 'Inactivas',
}

export function UserAdministration({
  profiles, roles, assigned, currentUserId, saving, onToggleActive, onAssignRole, onRemoveRole,
}: Props) {
  const [filter, setFilter] = useState<UserFilter>('ALL')
  const [search, setSearch] = useState('')
  const rows = useMemo(() => buildUserRows(profiles, assigned), [profiles, assigned])
  const visible = filterUsers(rows, filter, search)
  const withoutRole = countActiveWithoutRole(rows)
  const roleName = (code: string) => roles.find((role) => role.code === code)?.name ?? code

  const confirmToggle = (user: UserRow) => {
    const action = user.active ? 'desactivar' : 'activar'
    if (window.confirm(`¿Seguro que quieres ${action} la cuenta de ${user.full_name || user.email || 'este usuario'}?`)) {
      onToggleActive(user)
    }
  }

  return (
    <section className="admin-section" aria-labelledby="admin-users-title">
      <h2 id="admin-users-title">Usuarios y roles</h2>
      <p>La invitación de usuarios se hace desde Supabase Authentication. Aquí se asignan roles y se activan o desactivan cuentas; cada cambio queda auditado.</p>
      {withoutRole > 0 && (
        <p className="catalog-notice" role="status">
          {withoutRole} cuenta(s) activa(s) sin rol: entran al sistema pero ven «Tu cuenta aún no tiene rol» hasta que les asignes uno.
        </p>
      )}
      <div className="catalog-toolbar">
        <label>
          Buscar por nombre o correo
          <input value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        <fieldset className="admin-user-filter">
          <legend>Mostrar</legend>
          {(Object.keys(FILTER_LABELS) as UserFilter[]).map((key) => (
            <label key={key}>
              <input checked={filter === key} name="user-filter" onChange={() => setFilter(key)} type="radio" />
              {FILTER_LABELS[key]}
              {key === 'NO_ROLE' ? ` (${rows.filter((row) => row.roleCodes.length === 0).length})` : ''}
            </label>
          ))}
        </fieldset>
      </div>

      {visible.length === 0 ? <p>No hay cuentas que coincidan.</p> : (
        <ul className="admin-user-list">
          {visible.map((user) => {
            const toggleBlocker = toggleActiveBlocker(rows, user, currentUserId)
            const available = roles.filter((role) => !user.roleCodes.includes(role.code))
            return (
              <li className="admin-user" key={user.id}>
                <div>
                  <strong>{user.full_name || user.email || user.id}</strong>{' '}
                  <StatusBadge label={user.active ? 'Activa' : 'Inactiva'} tone={user.active ? 'success' : 'neutral'} />
                  {user.roleCodes.length === 0 && <> <StatusBadge label="Sin rol" tone="warning" /></>}
                  {user.id === currentUserId && <> <StatusBadge label="Tu cuenta" tone="info" /></>}
                  <div><small>{user.email ?? '—'}</small></div>
                </div>
                <ul aria-label={`Roles de ${user.full_name || user.email || 'la cuenta'}`}>
                  {user.roleCodes.map((code) => {
                    const blocker = removeRoleBlocker(rows, user, code, currentUserId)
                    return (
                      <li key={code}>
                        {roleName(code)}{' '}
                        <button
                          className="btn btn-secondary"
                          disabled={saving || Boolean(blocker)}
                          onClick={() => onRemoveRole(user, code)}
                          title={blocker ?? undefined}
                          type="button"
                        >
                          Retirar
                        </button>
                      </li>
                    )
                  })}
                </ul>
                {user.id !== currentUserId && available.length > 0 && (
                  <label>
                    Asignar rol a {user.full_name || user.email || 'la cuenta'}
                    <select
                      defaultValue=""
                      disabled={saving}
                      onChange={(event) => {
                        if (event.target.value) onAssignRole(user, event.target.value)
                        event.target.value = ''
                      }}
                    >
                      <option value="">Selecciona un rol</option>
                      {available.map((role) => <option key={role.code} value={role.code}>{role.name}</option>)}
                    </select>
                  </label>
                )}
                <button
                  className="btn btn-secondary"
                  disabled={saving || Boolean(toggleBlocker)}
                  onClick={() => confirmToggle(user)}
                  title={toggleBlocker ?? undefined}
                  type="button"
                >
                  {user.active ? 'Desactivar' : 'Activar'}
                </button>
                {toggleBlocker && user.id !== currentUserId && <small> {toggleBlocker}</small>}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
