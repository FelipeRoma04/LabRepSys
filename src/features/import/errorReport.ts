import type { ImportIssue } from './types'

/**
 * Escapa un valor para formato CSV previniendo inyección de fórmulas.
 * Si el contenido comienza con =, +, -, @, se antepone un apóstrofe (').
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  let text = String(value)

  // Mitigación de inyección de fórmulas de hoja de cálculo (CSV Injection)
  if (/^[=+\-@\t\r]/.test(text)) {
    text = "'" + text
  }

  // Si contiene comas, comillas o saltos de línea, envolver entre comillas dobles
  if (/[",\r\n]/.test(text)) {
    text = `"${text.replace(/"/g, '""')}"`
  }

  return text
}

/**
 * Genera el contenido de un archivo CSV con el informe de errores y advertencias de importación.
 */
export function generateErrorReportCsv(
  issues: ImportIssue[],
  fileName: string,
  target: string,
): string {
  const lines: string[] = []

  // Encabezado de metadatos
  lines.push(`# Informe de validación de importación Excel`)
  lines.push(`# Archivo: ${escapeCsvCell(fileName)}`)
  lines.push(`# Destino: ${escapeCsvCell(target)}`)
  lines.push(`# Generado: ${new Date().toISOString()}`)
  lines.push('')

  // Columnas
  lines.push('Fila,Campo,Severidad,Mensaje')

  for (const issue of issues) {
    const row = escapeCsvCell(issue.row)
    const field = escapeCsvCell(issue.field ?? 'General')
    const severity = escapeCsvCell(issue.severity === 'error' ? 'Error' : 'Advertencia')
    const message = escapeCsvCell(issue.message)
    lines.push(`${row},${field},${severity},${message}`)
  }

  return lines.join('\r\n')
}

/**
 * Dispara la descarga del informe de errores en el navegador como archivo CSV.
 */
export function downloadErrorReport(
  issues: ImportIssue[],
  fileName: string,
  target: string,
): void {
  const csvContent = generateErrorReportCsv(issues, fileName, target)
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  const baseName = fileName.replace(/\.[^/.]+$/, '')
  link.setAttribute('download', `errores_importacion_${baseName}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
