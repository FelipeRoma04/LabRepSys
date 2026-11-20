import { useEffect, useState } from 'react'
import { formatDateTime } from '../lib/format'
import { listMyNotifications, markNotificationRead, type UserNotification } from '../services/administration'
import { listPendingExternalReports } from '../services/externalShipments'
import type { PendingExternalReport } from '../types/externalShipments'
import { useAuth } from '../hooks/useAuth'

export function NotificationCenter() {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<UserNotification[]>([])
  const [overdue, setOverdue] = useState<PendingExternalReport[]>([])
  const [error, setError] = useState<string | null>(null)
  const { roles } = useAuth()

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const canSeeShipments = roles.some((role) => ['ADMIN', 'RECEPCION', 'ANALISTA', 'JEFE_TECNICA_CALIDAD', 'AUDITOR'].includes(role.code))
    void Promise.all([
      listMyNotifications(),
      canSeeShipments ? listPendingExternalReports() : Promise.resolve([]),
    ]).then(([notifications, pending]) => {
      if (!cancelled) {
        setRows(notifications)
        setOverdue(pending.filter((row) => (row.days_overdue ?? 0) > 0))
      }
    }).catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : 'No se pudieron cargar las notificaciones.')
    })
    return () => { cancelled = true }
  }, [open, roles])

  const unread = rows.filter((row) => !row.read_at).length
  const markRead = async (row: UserNotification) => {
    try {
      await markNotificationRead(row.id)
      setRows((current) => current.map((item) => item.id === row.id ? { ...item, read_at: new Date().toISOString() } : item))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo marcar como leída.')
    }
  }

  return <div className="notification-center">
    <button aria-expanded={open} aria-label={`Notificaciones, ${unread} sin leer`} className="help-button" onClick={() => setOpen((value) => !value)} type="button">
      Notificaciones{unread ? ` (${unread})` : ''}
    </button>
    {open && <section aria-label="Notificaciones" className="notification-panel">
      <h2>Notificaciones</h2>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {!rows.length && !error ? <p>No tienes notificaciones.</p> : <ul>
        {rows.map((row) => <li className={row.read_at ? '' : 'notification-unread'} key={row.id}>
          <p>{row.message}</p><small>{formatDateTime(row.created_at)}</small>
          {!row.read_at && <button className="btn btn-secondary" onClick={() => void markRead(row)} type="button">Marcar leída</button>}
        </li>)}
      </ul>}
      <h3>Reportes externos vencidos</h3>
      {overdue.length ? <ul>{overdue.map((row) => <li key={row.shipment_id}>
        <p>{row.laboratory_name}: reporte de {row.sample_code} con {row.days_overdue} días de retraso.</p>
        <small>Fecha esperada: {row.expected_at ?? 'Sin fecha'}</small>
      </li>)}</ul> : <p>No hay reportes externos vencidos.</p>}
    </section>}
  </div>
}
