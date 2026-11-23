import { describe, expect, it } from 'vitest'
import { businessDaysBetween } from './businessDays'
import { bogotaDateOf, deliveryStatus, todayInBogota } from './deliveryStatus'

const settings = { weekendCode: 1, laboratoryBusinessDays: 15, clientBusinessDays: 20 }
const holidays = ['2026-12-08']

describe('businessDaysBetween', () => {
  const calendar = { weekend: [6, 0] as (0 | 6)[], holidays }
  it('cuenta días hábiles sin el día inicial, saltando fines de semana y festivos', () => {
    expect(businessDaysBetween('2026-12-04', '2026-12-04', calendar)).toBe(0)
    // vie 4 → mié 9: lun 7, (mar 8 festivo), mié 9
    expect(businessDaysBetween('2026-12-04', '2026-12-09', calendar)).toBe(2)
    expect(businessDaysBetween('2026-12-09', '2026-12-04', calendar)).toBe(-2)
  })
})

describe('deliveryStatus', () => {
  const base = { settings, holidays, alertBusinessDays: 3 }

  it('marca vencida, próxima a vencer y a tiempo según los días hábiles que faltan', () => {
    expect(deliveryStatus({ ...base, today: '2026-12-10', dueDate: '2026-12-09' }))
      .toEqual({ state: 'OVERDUE', businessDaysLeft: -1 })
    expect(deliveryStatus({ ...base, today: '2026-12-04', dueDate: '2026-12-09' }))
      .toEqual({ state: 'DUE_SOON', businessDaysLeft: 2 })
    expect(deliveryStatus({ ...base, today: '2026-12-01', dueDate: '2026-12-09' }).state).toBe('ON_TIME')
  })

  it('no calcula sin días no hábiles configurados ni marca alertas en muestras entregadas', () => {
    expect(deliveryStatus({ ...base, settings: { ...settings, weekendCode: null }, today: '2026-12-01', dueDate: '2026-12-09' }).state)
      .toBe('UNKNOWN')
    expect(deliveryStatus({ ...base, today: '2026-12-10', dueDate: '2026-12-09', delivered: true }).state).toBe('DELIVERED')
  })

  it('usa la fecha de Bogotá, no la UTC', () => {
    expect(todayInBogota(new Date('2026-12-05T03:00:00Z'))).toBe('2026-12-04')
    expect(bogotaDateOf('2026-12-05T03:00:00Z')).toBe('2026-12-04')
  })
})
