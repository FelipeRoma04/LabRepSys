import { useCallback, useEffect, useState } from 'react'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import { PageHeader } from '../components/PageHeader'
import { useAuth } from '../hooks/useAuth'
import {
  assignRole, decidePendingDecision, listAdminProfiles, listAdminRoles,
  listAppSettings, listAssignedRoles, listPendingDecisions, removeRole,
  saveAppSetting, setProfileActive,
  type AdminProfile, type AdminRole, type AppSetting, type AssignedRole, type PendingDecision,
} from '../services/administration'

export function AdministrationPage() {
  const { profile, roles: currentRoles } = useAuth()
  const isAdmin = currentRoles.some((role) => role.code === 'ADMIN')
  const canDecide = isAdmin || currentRoles.some((role) => role.code === 'JEFE_TECNICA_CALIDAD')
  const [profiles, setProfiles] = useState<AdminProfile[]>([])
  const [roles, setRoles] = useState<AdminRole[]>([])
  const [assigned, setAssigned] = useState<AssignedRole[]>([])
  const [settings, setSettings] = useState<AppSetting[]>([])
  const [decisions, setDecisions] = useState<PendingDecision[]>([])
  const [decisionDrafts, setDecisionDrafts] = useState<Record<string, { status: PendingDecision['status']; decision_text: string; evidence: string }>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [profileRows, roleRows, assignedRows, settingRows, decisionRows] = await Promise.all([
        isAdmin ? listAdminProfiles() : Promise.resolve([]),
        isAdmin ? listAdminRoles() : Promise.resolve([]),
        isAdmin ? listAssignedRoles() : Promise.resolve([]),
        isAdmin ? listAppSettings() : Promise.resolve([]),
        canDecide ? listPendingDecisions() : Promise.resolve([]),
      ])
      setProfiles(profileRows)
      setRoles(roleRows)
      setAssigned(assignedRows)
      setSettings(settingRows)
      setDecisions(decisionRows)
      setDecisionDrafts(Object.fromEntries(decisionRows.map((row) => [row.id, {
        status: row.status, decision_text: row.decision_text ?? '', evidence: row.evidence ?? '',
      }])))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar la administración.')
    } finally { setLoading(false) }
  }, [isAdmin, canDecide])

  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), 0)
    return () => window.clearTimeout(timer)
  }, [reload])

  const mutate = async (action: () => Promise<void>, success: string) => {
    setSaving(true)
    setError(null)
    setNotice(null)
    try { await action(); setNotice(success); await reload() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar el cambio.') }
    finally { setSaving(false) }
  }

  const changeSetting = (setting: AppSetting) => {
    const input = window.prompt(`Nuevo valor JSON para ${setting.key}`, JSON.stringify(setting.value))
    if (input === null) return
    try {
      const value: unknown = JSON.parse(input)
      void mutate(() => saveAppSetting(setting.key, value), `Configuración ${setting.key} guardada.`)
    } catch { setError('El valor debe ser JSON válido.') }
  }

  return <div>
    <PageHeader title="Administración" description="Usuarios, roles, parámetros y decisiones pendientes." />
    {error && <ErrorState message={error} />}
    {notice && <p className="notice notice-success" role="status">{notice}</p>}
    {loading ? <LoadingState message="Cargando administración…" /> : <>
      {isAdmin && <section className="admin-section">
        <h2>Usuarios y roles</h2>
        <p>La invitación de usuarios se realiza desde Supabase Authentication. Aquí puedes activar cuentas y administrar roles.</p>
        {profiles.map((user) => {
          const userRoles = assigned.filter((item) => item.user_id === user.id)
          return <details className="admin-user" key={user.id}>
            <summary>{user.full_name || user.email || user.id} · {user.active ? 'Activo' : 'Inactivo'}</summary>
            <p>{user.email || user.id}</p>
            <button className="btn btn-secondary" disabled={saving || user.id === profile?.id} onClick={() => void mutate(
              () => setProfileActive(user.id, !user.active), user.active ? 'Cuenta inactivada.' : 'Cuenta activada.',
            )} type="button">{user.active ? 'Inactivar' : 'Activar'}</button>
            <ul>{userRoles.map((item) => <li key={item.role_code}>{item.role_code}{user.id !== profile?.id && <button className="btn btn-secondary" disabled={saving} onClick={() => void mutate(() => removeRole(user.id, item.role_code), 'Rol retirado y auditado.')} type="button">Retirar</button>}</li>)}</ul>
            {user.id !== profile?.id && <label>Asignar rol
              <select defaultValue="" disabled={saving} onChange={(event) => {
                const roleCode = event.target.value
                if (roleCode && profile?.id) void mutate(() => assignRole(user.id, roleCode, profile.id), 'Rol asignado y auditado.')
                event.target.value = ''
              }}>
                <option value="">Selecciona un rol</option>
                {roles.filter((role) => !userRoles.some((item) => item.role_code === role.code)).map((role) => <option key={role.code} value={role.code}>{role.name}</option>)}
              </select>
            </label>}
          </details>
        })}
      </section>}

      {isAdmin && <section className="admin-section">
        <h2>Parámetros del sistema</h2>
        {settings.map((setting) => <div className="admin-setting" key={setting.key}>
          <div><strong>{setting.key}</strong><p>{setting.description}</p><code>{JSON.stringify(setting.value)}</code></div>
          <button className="btn btn-secondary" disabled={saving} onClick={() => changeSetting(setting)} type="button">Editar JSON</button>
        </div>)}
      </section>}

      {canDecide && <section className="admin-section">
        <h2>Decisiones pendientes</h2>
        <p>Para definir o descartar una decisión, registra el texto y la evidencia de respaldo.</p>
        {decisions.map((decision) => {
          const draft = decisionDrafts[decision.id] ?? { status: decision.status, decision_text: '', evidence: '' }
          return <details className="admin-decision" key={decision.id}>
            <summary>{decision.code} · {decision.topic} · {decision.status}</summary>
            <p>{decision.decision_required}</p>
            <label>Estado<select disabled={saving} onChange={(event) => setDecisionDrafts((current) => ({ ...current, [decision.id]: { ...draft, status: event.target.value as PendingDecision['status'] } }))} value={draft.status}>
              <option value="PENDIENTE">Pendiente</option><option value="DEFINIDA">Definida</option><option value="DESCARTADA">Descartada</option><option value="FUERA_DE_MVP">Fuera del MVP</option>
            </select></label>
            <label>Decisión<textarea disabled={saving} onChange={(event) => setDecisionDrafts((current) => ({ ...current, [decision.id]: { ...draft, decision_text: event.target.value } }))} value={draft.decision_text} /></label>
            <label>Evidencia<textarea disabled={saving} onChange={(event) => setDecisionDrafts((current) => ({ ...current, [decision.id]: { ...draft, evidence: event.target.value } }))} value={draft.evidence} /></label>
            <button className="btn btn-primary" disabled={saving || (draft.status !== 'PENDIENTE' && (!draft.decision_text.trim() || !draft.evidence.trim())) || !profile?.id} onClick={() => profile?.id && void mutate(() => decidePendingDecision(decision.id, draft, profile.id), 'Decisión guardada.')} type="button">Guardar decisión</button>
          </details>
        })}
      </section>}
    </>}
  </div>
}
