import { describe, expect, it } from 'vitest'
import { addBusinessDays, deliveryDates, weekendFromWorkdayIntl, type DeliverySettings } from './businessDays'

// Festivos de Colombia junio–julio 2026 (en producción vienen de la tabla holidays)
const HOLIDAYS_2026 = ['2026-06-08', '2026-06-15', '2026-06-29', '2026-07-20']
const SAT_SUN = weekendFromWorkdayIntl(1)!
const SUNDAY_ONLY = weekendFromWorkdayIntl(11)!

describe('weekendFromWorkdayIntl (códigos de Excel)', () => {
  it('traduce los códigos numéricos', () => {
    expect(SAT_SUN.sort()).toEqual([0, 6])
    expect(SUNDAY_ONLY).toEqual([0])
    expect(weekendFromWorkdayIntl(17)).toEqual([6])
    expect(weekendFromWorkdayIntl('11')).toEqual([0])
  })

  it('traduce la cadena de 7 dígitos lunes→domingo', () => {
    expect(weekendFromWorkdayIntl('0000011')?.sort()).toEqual([0, 6])
    expect(weekendFromWorkdayIntl('0000001')).toEqual([0])
    expect(weekendFromWorkdayIntl('1000000')).toEqual([1])
  })

  it('rechaza códigos inválidos', () => {
    expect(weekendFromWorkdayIntl(8)).toBeNull()
    expect(weekendFromWorkdayIntl('1111111')).toBeNull()
    expect(weekendFromWorkdayIntl('00x0011')).toBeNull()
  })
})

describe('addBusinessDays = WORKDAY.INTL', () => {
  it('AG0346 recibida el 2026-06-01: 15 días hábiles (sáb y dom no hábiles)', () => {
    expect(addBusinessDays('2026-06-01', 15, { weekend: SAT_SUN, holidays: HOLIDAYS_2026 })).toBe('2026-06-24')
  })

  it('20 días hábiles salta el festivo del 29 de junio', () => {
    expect(addBusinessDays('2026-06-01', 20, { weekend: SAT_SUN, holidays: HOLIDAYS_2026 })).toBe('2026-07-02')
  })

  it('con solo el domingo no hábil, el sábado cuenta', () => {
    expect(addBusinessDays('2026-06-01', 15, { weekend: SUNDAY_ONLY, holidays: HOLIDAYS_2026 })).toBe('2026-06-20')
    expect(addBusinessDays('2026-06-01', 20, { weekend: SUNDAY_ONLY, holidays: HOLIDAYS_2026 })).toBe('2026-06-26')
  })

  it('con 0 días devuelve el inicio aunque sea no hábil (igual que Excel)', () => {
    expect(addBusinessDays('2026-06-06', 0, { weekend: SAT_SUN, holidays: [] })).toBe('2026-06-06')
  })

  it('desde un sábado, 1 día hábil cae el lunes (o el martes si el lunes es festivo)', () => {
    expect(addBusinessDays('2026-06-13', 1, { weekend: SAT_SUN, holidays: [] })).toBe('2026-06-15')
    expect(addBusinessDays('2026-06-13', 1, { weekend: SAT_SUN, holidays: HOLIDAYS_2026 })).toBe('2026-06-16')
  })

  it('admite días negativos', () => {
    expect(addBusinessDays('2026-06-09', -1, { weekend: SAT_SUN, holidays: HOLIDAYS_2026 })).toBe('2026-06-05')
  })

  it('funciona con la tabla de festivos vacía', () => {
    expect(addBusinessDays('2026-06-01', 15, { weekend: SAT_SUN, holidays: [] })).toBe('2026-06-22')
  })

  it('rechaza fechas o días inválidos', () => {
    expect(() => addBusinessDays('01/06/2026', 1, { weekend: SAT_SUN, holidays: [] })).toThrow(RangeError)
    expect(() => addBusinessDays('2026-02-30', 1, { weekend: SAT_SUN, holidays: [] })).toThrow(RangeError)
    expect(() => addBusinessDays('2026-06-01', 1.5, { weekend: SAT_SUN, holidays: [] })).toThrow(RangeError)
  })
})

describe('deliveryDates', () => {
  const base: DeliverySettings = { weekendCode: 1, laboratoryBusinessDays: 15, clientBusinessDays: 20 }

  it('calcula las dos fechas de entrega', () => {
    expect(deliveryDates('2026-06-01', base, HOLIDAYS_2026)).toEqual({
      laboratoryDueDate: '2026-06-24',
      clientDueDate: '2026-07-02',
      issues: [],
    })
  })

  it('no asume el fin de semana si no está configurado', () => {
    const result = deliveryDates('2026-06-01', { ...base, weekendCode: null }, HOLIDAYS_2026)
    expect(result.laboratoryDueDate).toBeNull()
    expect(result.clientDueDate).toBeNull()
    expect(result.issues.map((issue) => issue.code)).toEqual(['WEEKEND_PENDING'])
  })

  it('avisa si el código de fin de semana no es válido', () => {
    const result = deliveryDates('2026-06-01', { ...base, weekendCode: 9 }, HOLIDAYS_2026)
    expect(result.issues[0].code).toBe('WEEKEND_INVALID')
    expect(result.clientDueDate).toBeNull()
  })

  it('avisa los años sin festivos cargados (tabla vacía o cruce de año)', () => {
    expect(deliveryDates('2026-06-01', base, []).issues.map((issue) => issue.code)).toEqual(['HOLIDAYS_MISSING_FOR_YEAR'])
    const crossYear = deliveryDates('2026-12-15', base, ['2026-12-08', '2026-12-25'])
    expect(crossYear.clientDueDate?.startsWith('2027-')).toBe(true)
    expect(crossYear.issues[0].message).toMatch(/2027/)
  })
})
