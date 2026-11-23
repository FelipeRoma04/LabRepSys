import { useCallback, useEffect, useState } from 'react'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import { PageHeader } from '../components/PageHeader'
import { UserAdministration } from '../features/admin/UserAdministration'
import { useAuth } from '../hooks/useAuth'
import {
  assignRole, decidePendingDecision, listAdminProfiles, listAdminRoles,
  listAppSettings, listAssignedRoles, listPendingDecisions, removeRole,
  saveAppSetting, setCounterFloor, setProfileActive,
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
  const [counterYear, setCounterYear] = useState(() => String(new Date().getFullYear()))
  const [counterLast, setCounterLast] = useState('')

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

  const mutate = async (action: () => Promise<void>, success: string | (() => string)) => {
    setSaving(true)
    setError(null)
    setNotice(null)
    try { await action(); setNotice(typeof success === 'function' ? success() : success); await reload() }
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
      {isAdmin && <UserAdministration
        assigned={assigned}
        currentUserId={profile?.id}
        onAssignRole={(user, roleCode) => {
          if (profile?.id) void mutate(() => assignRole(user.id, roleCode, profile.id), 'Rol asignado y auditado.')
        }}
        onRemoveRole={(user, roleCode) => void mutate(() => removeRole(user.id, roleCode), 'Rol retirado y auditado.')}
        onToggleActive={(user) => void mutate(
          () => setProfileActive(user.id, !user.active), user.active ? 'Cuenta desactivada.' : 'Cuenta activada.',
        )}
        profiles={profiles}
        roles={roles}
        saving={saving}
      />}

      {isAdmin && <section className="admin-section">
        <h2>Parámetros del sistema</h2>
        {settings.map((setting) => <div className="admin-setting" key={setting.key}>
          <div><strong>{setting.key}</strong><p>{setting.description}</p><code>{JSON.stringify(setting.value)}</code></div>
          <button className="btn btn-secondary" disabled={saving} onClick={() => changeSetting(setting)} type="button">Editar JSON</button>
        </div>)}
      </section>}

      {isAdmin && <section className="admin-section">
        <h2>Consecutivos de RSA</h2>
        <p>Si ya se emitieron reportes a mano este año, indique el último número usado para que el sistema continúe sin repetir. Solo se puede aumentar.</p>
        <form className="admin-setting" onSubmit={(event) => {
          event.preventDefault()
          const year = Number(counterYear)
          const last = Number(counterLast)
          let next = 0
          void mutate(async () => { next = await setCounterFloor('RSA', year, last) },
            () => `Consecutivo RSA ${year} ajustado: el próximo reporte será el número ${next}.`)
        }}>
          <label>Año<input inputMode="numeric" onChange={(event) => setCounterYear(event.target.value)} required value={counterYear} /></label>
          <label>Último número de RSA ya usado<input inputMode="numeric" onChange={(event) => setCounterLast(event.target.value)} required value={counterLast} /></label>
          <button className="btn btn-secondary" disabled={saving || !counterLast.trim()} type="submit">Ajustar consecutivo</button>
        </form>
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
