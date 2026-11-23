export interface HelpEntry {
  term: string
  definition: string
  source: string
}

export interface RoleHelp {
  code: string
  responsibility: string
  source: string
}

export const glossary: HelpEntry[] = [
  { term: 'LCM', definition: 'Límite de cuantificación indicado por el catálogo del ensayo.', source: 'src/types/catalogs.ts' },
  { term: 'RSA', definition: 'Reporte de resultados de laboratorio gestionado por el flujo de reportes.', source: 'src/pages/ReportBuilderPage.tsx' },
  { term: 'COT', definition: 'Consecutivo y código de una cotización comercial.', source: 'src/types/auth.ts; p03-clientes-cotizaciones.prompt.md' },
  { term: 'INF', definition: 'Informe técnico complementario, fuera del MVP.', source: 'Especificación del MVP (alcance)' },
  { term: 'ARD', definition: 'Tipo de descarga registrado en una cotización o actividad normativa.', source: 'src/types/commercial.ts; p09-normativa.prompt.md' },
  { term: 'ARnD', definition: 'Tipo de descarga registrado en una cotización o actividad normativa.', source: 'src/types/commercial.ts; p09-normativa.prompt.md' },
  { term: 'N.A.', definition: 'Estado especial de valor: no aplica; se conserva separado de cero.', source: 'src/lib/format/valueState.ts' },
  { term: 'N.E.', definition: 'Estado especial de valor: no especificado; se conserva separado de cero.', source: 'src/lib/format/valueState.ts' },
  { term: 'N.R.', definition: 'Estado especial de valor: no reportado; se conserva separado de cero.', source: 'src/lib/format/valueState.ts' },
  { term: 'Snapshot', definition: 'Copia inmutable de los datos usados para emitir un reporte.', source: 'src/services/reports.ts' },
  { term: 'Rectificación', definition: 'Proceso que crea una nueva versión vinculada y conserva el reporte original.', source: 'src/services/reports.ts' },
  { term: 'Subcontratación', definition: 'Ejecución de un ensayo por un laboratorio externo asignado.', source: 'src/services/externalShipments.ts' },
  { term: 'Cadena de custodia', definition: 'Registro de verificación y condiciones de llegada de la muestra.', source: 'src/pages/ReceptionPage.tsx' },
  { term: 'Regla de decisión', definition: 'Texto acordado con el cliente que se conserva sin interpretación automática.', source: 'src/types/commercial.ts' },
]

export const reportStates: HelpEntry[] = [
  { term: 'Borrador', definition: 'Reporte en preparación.', source: 'src/pages/ReportBuilderPage.tsx' },
  { term: 'Validando', definition: 'Reporte en ejecución de validaciones.', source: 'src/pages/ReportBuilderPage.tsx' },
  { term: 'Listo para revisión', definition: 'Reporte enviado al flujo de revisión.', source: 'src/pages/ReportBuilderPage.tsx' },
  { term: 'En revisión', definition: 'Reporte en revisión por la Jefatura de Técnica y Calidad.', source: 'src/pages/ReportBuilderPage.tsx' },
  { term: 'Devuelto', definition: 'Reporte que requiere correcciones y conserva el historial.', source: 'src/pages/ReportBuilderPage.tsx' },
  { term: 'Aprobado', definition: 'Reporte aprobado por la Jefatura o un suplente vigente.', source: 'src/pages/ReportBuilderPage.tsx' },
  { term: 'Emitido', definition: 'Reporte emitido con snapshot inmutable.', source: 'src/services/reports.ts' },
  { term: 'Rectificado', definition: 'Reporte sustituido por una nueva versión rectificada.', source: 'src/services/reports.ts' },
  { term: 'Anulado', definition: 'Reporte anulado por la Jefatura con motivo.', source: 'src/services/reports.ts' },
]

export const quoteStates: HelpEntry[] = [
  { term: 'Borrador', definition: 'Cotización en preparación.', source: 'src/types/commercial.ts' },
  { term: 'Vigente', definition: 'Cotización disponible mientras no esté vencida.', source: 'src/types/commercial.ts' },
  { term: 'Vencida', definition: 'Cotización fuera de su vigencia.', source: 'src/types/commercial.ts' },
  { term: 'Cancelada', definition: 'Cotización que no puede seleccionarse en recepción.', source: 'src/types/commercial.ts' },
]

export const roleHelp: RoleHelp[] = [
  { code: 'ADMIN', responsibility: 'Administra usuarios, catálogos y configuración según los permisos del sistema.', source: 'src/types/auth.ts; p13-dashboard-admin.prompt.md' },
  { code: 'ADMIN_TECNICO', responsibility: 'Gestiona despliegue y soporte; no aprueba resultados.', source: 'src/types/auth.ts' },
  { code: 'COMERCIAL', responsibility: 'Gestiona clientes, contactos y cotizaciones.', source: 'src/types/commercial.ts' },
  { code: 'MUESTREO', responsibility: 'Registra datos de campo y consulta la información de muestras permitida.', source: 'src/pages/ReceptionPage.tsx; p05-campo-adjuntos.prompt.md' },
  { code: 'RECEPCION', responsibility: 'Registra la recepción y gestiona envíos externos y adjuntos autorizados.', source: 'src/pages/ReceptionPage.tsx; p06-subcontratados.prompt.md' },
  { code: 'ANALISTA', responsibility: 'Gestiona resultados, conciliación, normativa y borradores RSA.', source: 'src/pages/ResultsLoadPage.tsx; p08-conciliacion.prompt.md; p09-normativa.prompt.md; p11-rsa-flujo.prompt.md' },
  { code: 'JEFE_TECNICA_CALIDAD', responsibility: 'Revisa y aprueba reportes; puede devolverlos con comentario.', source: 'src/pages/ReportBuilderPage.tsx' },
  { code: 'AUDITOR', responsibility: 'Consulta información y auditoría sin modificar datos funcionales.', source: 'src/types/auth.ts; p13-dashboard-admin.prompt.md' },
]

export interface RouteHelp {
  title: string
  description: string
  source: string
  pendingDecision?: string
}

export const routeHelp: Record<string, RouteHelp> = {
  '/clientes': { title: 'Clientes', description: 'Busca clientes por NIT, razón social, alias o contacto; filtra por estado y administra sus contactos según tu rol.', source: 'src/types/commercial.ts' },
  '/cotizaciones': { title: 'Cotizaciones', description: 'Consulta y gestiona cotizaciones, ensayos y normativa acordada como sugerencia para etapas posteriores.', source: 'src/types/commercial.ts' },
  '/muestras/recepcion': { title: 'Recepción', description: 'Registra la identificación, recepción, ensayos y revisión de la solicitud. Las sugerencias de cotización requieren confirmación.', source: 'src/pages/ReceptionPage.tsx' },
  '/resultados/carga': { title: 'Carga de resultados', description: 'Importa, pega o digita resultados conservando el valor original para revisión humana.', source: 'src/pages/ResultsLoadPage.tsx' },
  '/normativa': { title: 'Normativa', description: 'Administra versiones normativas y confirma las actividades elegidas para una muestra.', source: 'src/pages/RegulationsPage.tsx', pendingDecision: 'DP-007, DP-008, DP-009 y DP-010: conformidad, incertidumbre, sumatorias y redondeo.' },
  '/reportes/borradores': { title: 'Borradores RSA', description: 'Prepara reportes y corrige los devueltos.', source: 'src/pages/ReportBuilderPage.tsx', pendingDecision: 'DP-003: reglas para agrupar muestras en un reporte.' },
  '/reportes/revision': { title: 'Revisión RSA', description: 'Consulta los reportes enviados a revisión y su historial.', source: 'src/pages/ReportBuilderPage.tsx' },
  '/reportes/aprobados': { title: 'Reportes aprobados', description: 'Consulta reportes aprobados pendientes de emisión.', source: 'src/pages/ReportBuilderPage.tsx', pendingDecision: 'DP-031: emisión parcial con reportes subcontratados pendientes.' },
}
