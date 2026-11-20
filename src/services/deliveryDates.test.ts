import { describe, expect, it } from 'vitest'
import { DELIVERY_SETTING_KEYS, parseDeliverySettings } from './deliveryDates'

describe('parseDeliverySettings', () => {
  it('lee los tres parámetros de app_settings', () => {
    expect(parseDeliverySettings([
      { key: DELIVERY_SETTING_KEYS.weekend, value: 11 },
      { key: DELIVERY_SETTING_KEYS.laboratory, value: 15 },
      { key: DELIVERY_SETTING_KEYS.client, value: 20 },
    ])).toEqual({ weekendCode: 11, laboratoryBusinessDays: 15, clientBusinessDays: 20 })
  })

  it('deja el fin de semana pendiente cuando el valor JSON es null', () => {
    expect(parseDeliverySettings([
      { key: DELIVERY_SETTING_KEYS.weekend, value: null },
      { key: DELIVERY_SETTING_KEYS.laboratory, value: 15 },
      { key: DELIVERY_SETTING_KEYS.client, value: 20 },
    ]).weekendCode).toBeNull()
  })

  it('falla con un mensaje claro si faltan parámetros o son inválidos', () => {
    expect(() => parseDeliverySettings([])).toThrow(/migración delivery_settings/)
    expect(() => parseDeliverySettings([
      { key: DELIVERY_SETTING_KEYS.laboratory, value: 0 },
      { key: DELIVERY_SETTING_KEYS.client, value: 20 },
    ])).toThrow(/entero positivo/)
  })
})
