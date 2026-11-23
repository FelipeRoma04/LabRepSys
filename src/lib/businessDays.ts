/**
 * Días hábiles y fechas de entrega, con la misma semántica que WORKDAY.INTL de Excel
 * (la fórmula que usa hoy el libro de recepción).
 *
 * - Las fechas son calendario ISO (YYYY-MM-DD), sin hora ni zona: no hay desfases.
 * - El fin de semana se configura con el MISMO código de WORKDAY.INTL de la macro
 *   (1 = sábado y domingo, 11 = solo domingo, "0000011", …).
 * - Los festivos vienen de la tabla `holidays`. Si está vacía, el cálculo funciona,
 *   pero avisa que no hay festivos cargados para los años involucrados.
 * - Si el fin de semana no está configurado, NO se asume uno: el resultado queda
 *   como pendiente (decisión de negocio por confirmar en la macro).
 */

/** Día de la semana JS: 0 = domingo … 6 = sábado */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

/** Códigos numéricos de WORKDAY.INTL → días no hábiles */
const WORKDAY_INTL_CODES: Record<number, Weekday[]> = {
  1: [6, 0], 2: [0, 1], 3: [1, 2], 4: [2, 3], 5: [3, 4], 6: [4, 5], 7: [5, 6],
  11: [0], 12: [1], 13: [2], 14: [3], 15: [4], 16: [5], 17: [6],
}

/**
 * Convierte el argumento "fin de semana" de WORKDAY.INTL en días no hábiles.
 * Acepta el número (1–7, 11–17) o la cadena de 7 dígitos lunes→domingo ("0000011").
 * Devuelve null si el código no es válido.
 */
export function weekendFromWorkdayIntl(code: number | string): Weekday[] | null {
  if (typeof code === 'number') return WORKDAY_INTL_CODES[code] ?? null
  const trimmed = code.trim()
  if (/^\d+$/.test(trimmed) && trimmed.length !== 7) return WORKDAY_INTL_CODES[Number(trimmed)] ?? null
  if (!/^[01]{7}$/.test(trimmed) || trimmed === '1111111') return null
  // posición 0 = lunes … 6 = domingo
  return [...trimmed].flatMap((flag, index) => (flag === '1' ? [((index + 1) % 7) as Weekday] : []))
}

function parseIsoDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) throw new RangeError(`Fecha no válida: "${value}" (se espera YYYY-MM-DD)`)
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  if (date.toISOString().slice(0, 10) !== value) throw new RangeError(`Fecha no válida: "${value}"`)
  return date
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export interface BusinessCalendar {
  /** Días no hábiles de la semana */
  weekend: Weekday[]
  /** Festivos YYYY-MM-DD */
  holidays: Iterable<string>
}

/**
 * Equivalente a WORKDAY.INTL(inicio; días; fin_de_semana; festivos).
 * El día de inicio no se cuenta; con 0 días devuelve el inicio tal cual.
 * Admite días negativos (hacia atrás).
 */
export function addBusinessDays(start: string, days: number, calendar: BusinessCalendar): string {
  if (!Number.isInteger(days)) throw new RangeError('El número de días hábiles debe ser entero.')
  const weekend = new Set(calendar.weekend)
  if (weekend.size >= 7) throw new RangeError('El calendario no tiene días hábiles.')
  const holidays = new Set(calendar.holidays)
  const date = parseIsoDate(start)
  const step = days < 0 ? -1 : 1
  let remaining = Math.abs(days)
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + step)
    const iso = toIso(date)
    if (!weekend.has(date.getUTCDay() as Weekday) && !holidays.has(iso)) remaining -= 1
  }
  return toIso(date)
}

/**
 * Días hábiles desde `from` (sin contarlo) hasta `to` (contándolo si es hábil).
 * Negativo si `to` ya pasó. Equivale a NETWORKDAYS.INTL menos el día inicial.
 */
export function businessDaysBetween(from: string, to: string, calendar: BusinessCalendar): number {
  const weekend = new Set(calendar.weekend)
  const holidays = new Set(calendar.holidays)
  const start = parseIsoDate(from)
  const end = parseIsoDate(to)
  if (start.getTime() === end.getTime()) return 0
  const step = end > start ? 1 : -1
  let count = 0
  const date = new Date(start)
  while (toIso(date) !== to) {
    date.setUTCDate(date.getUTCDate() + step)
    if (!weekend.has(date.getUTCDay() as Weekday) && !holidays.has(toIso(date))) count += step
  }
  return count
}

export interface DeliverySettings {
  /** Código WORKDAY.INTL del fin de semana; null = pendiente de confirmar */
  weekendCode: number | string | null
  /** Días hábiles que tiene el laboratorio subcontratado para entregar */
  laboratoryBusinessDays: number
  /** Días hábiles comprometidos con el cliente */
  clientBusinessDays: number
}

export type DeliveryIssueCode = 'WEEKEND_PENDING' | 'WEEKEND_INVALID' | 'HOLIDAYS_MISSING_FOR_YEAR'

export interface DeliveryIssue {
  code: DeliveryIssueCode
  message: string
}

export interface DeliveryDates {
  /** null mientras el fin de semana no esté configurado */
  laboratoryDueDate: string | null
  clientDueDate: string | null
  issues: DeliveryIssue[]
}

/**
 * Fechas de entrega a partir de la fecha de recepción de la muestra.
 * Nunca inventa el fin de semana: sin configuración, las fechas quedan en null
 * con el aviso WEEKEND_PENDING.
 */
export function deliveryDates(receivedOn: string, settings: DeliverySettings, holidays: string[]): DeliveryDates {
  parseIsoDate(receivedOn)
  const issues: DeliveryIssue[] = []
  if (settings.weekendCode === null || settings.weekendCode === '') {
    issues.push({
      code: 'WEEKEND_PENDING',
      message: 'Falta configurar los días no hábiles (código WORKDAY.INTL de la macro) en Administración → Parámetros: "delivery.weekend_workday_intl".',
    })
    return { laboratoryDueDate: null, clientDueDate: null, issues }
  }
  const weekend = weekendFromWorkdayIntl(settings.weekendCode)
  if (!weekend) {
    issues.push({
      code: 'WEEKEND_INVALID',
      message: `El código de días no hábiles "${settings.weekendCode}" no es válido para WORKDAY.INTL (use 1–7, 11–17 o 7 dígitos como "0000011").`,
    })
    return { laboratoryDueDate: null, clientDueDate: null, issues }
  }

  const calendar = { weekend, holidays }
  const laboratoryDueDate = addBusinessDays(receivedOn, settings.laboratoryBusinessDays, calendar)
  const clientDueDate = addBusinessDays(receivedOn, settings.clientBusinessDays, calendar)

  const loadedYears = new Set(holidays.map((holiday) => holiday.slice(0, 4)))
  const spannedYears = new Set<string>()
  for (let year = Number(receivedOn.slice(0, 4)); year <= Number(clientDueDate.slice(0, 4)); year += 1) spannedYears.add(String(year))
  const missing = [...spannedYears].filter((year) => !loadedYears.has(year))
  if (missing.length) {
    issues.push({
      code: 'HOLIDAYS_MISSING_FOR_YEAR',
      message: `No hay festivos cargados para ${missing.join(', ')}: la fecha no descuenta festivos de Colombia hasta que se carguen en Catálogos → Festivos.`,
    })
  }
  return { laboratoryDueDate, clientDueDate, issues }
}
