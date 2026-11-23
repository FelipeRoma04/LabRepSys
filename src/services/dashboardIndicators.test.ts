import { describe, expect, it, vi } from 'vitest'
import { loadDeadlineIndicators } from './dashboardIndicators'

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  loadDeliveryConfig: vi.fn(),
  listDeliveredSampleIds: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  supabase: { from: () => ({ select: mocks.select }) },
}))
vi.mock('./deliveryDates', () => ({
  loadDeliveryConfig: mocks.loadDeliveryConfig,
  listDeliveredSampleIds: mocks.listDeliveredSampleIds,
}))

describe('loadDeadlineIndicators', () => {
  it('cuenta entregas vencidas y próximas a vencer, sin las muestras ya entregadas', async () => {
    mocks.loadDeliveryConfig.mockResolvedValue({
      settings: { weekendCode: 1, laboratoryBusinessDays: 15, clientBusinessDays: 20 },
      holidays: ['2026-01-01', '2027-01-01'],
      alertBusinessDays: 3,
    })
    mocks.listDeliveredSampleIds.mockResolvedValue(new Set(['entregada']))
    mocks.select.mockResolvedValue({
      data: [
        // Recibida 2026-10-01 → entrega 2026-10-29: vencida el 2026-12-15
        { id: 'vencida', received_at: '2026-10-01T15:00:00Z' },
        { id: 'entregada', received_at: '2026-10-01T15:00:00Z' },
        // Recibida 2026-11-19 → entrega 2026-12-17: faltan 2 días hábiles (próxima a vencer)
        { id: 'proxima', received_at: '2026-11-19T15:00:00Z' },
        { id: 'a-tiempo', received_at: '2026-12-14T15:00:00Z' },
      ],
      error: null,
    })

    const result = await loadDeadlineIndicators(new Date('2026-12-15T15:00:00Z'))

    expect(result).toEqual({ overdue: 1, dueSoon: 1, issue: null, alertBusinessDays: 3 })
  })
})
