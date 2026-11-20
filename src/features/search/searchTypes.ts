import type { RoleCode } from '../../types/auth'

export const searchEntityTypes = ['sample', 'quote', 'client', 'report'] as const

export type SearchEntityType = (typeof searchEntityTypes)[number]

export interface SearchFilters {
  term: string
  type: SearchEntityType | 'all'
  status: string
  dateFrom: string
  dateTo: string
  clientId: string
  laboratoryId: string
}

export interface SearchResult {
  id: string
  type: SearchEntityType
  title: string
  subtitle: string
  status: string
  date: string | null
  clientId: string | null
  clientName: string | null
}

export interface SearchPageResult {
  items: SearchResult[]
  total: number
}

export const exportRoles: readonly RoleCode[] = [
  'AUDITOR',
  'JEFE_TECNICA_CALIDAD',
  'ADMIN',
  'ANALISTA',
]

export function canExportSearch(roles: readonly RoleCode[]): boolean {
  return roles.some((role) => exportRoles.includes(role))
}

export function escapeCsvCell(value: unknown): string {
  const text = value == null ? '' : String(value)
  const safeText = /^\s*[=+\-@]/.test(text)
    ? `'${text}`
    : text

  return `"${safeText.replaceAll('"', '""')}"`
}

export function createSearchCsv(items: readonly SearchResult[]): string {
  const rows = [
    ['Tipo', 'Identificador', 'Cliente', 'Estado', 'Fecha'],
    ...items.map((item) => [
      item.type,
      item.title,
      item.clientName ?? '',
      item.status,
      item.date ?? '',
    ]),
  ]

  return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')
}
