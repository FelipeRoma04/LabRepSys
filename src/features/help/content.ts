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
  { term: 'LCM', definition: 'Límite de cuantificación indicado por el catálogo del ensayo.', source: 'PROMPTS CODEX/p02-catalogos.prompt.md' },
  { term: 'RSA', definition: 'Reporte de resultados de laboratorio gestionado por el flujo de reportes.', source: 'PROMPTS CODEX/p11-rsa-flujo.prompt.md' },
  { term: 'COT', definition: 'Consecutivo y código de una cotización comercial.', source: 'PROMPTS CODEX/p01-fundacion.prompt.md; p03-clientes-cotizaciones.prompt.md' },
  { term: 'INF', definition: 'Informe técnico complementario, fuera del MVP.', source: 'PROMPTS CODEX/p13-dashboard-admin.prompt.md' },
  { term: 'ARD', definition: 'Tipo de descarga registrado en una cotización o actividad normativa.', source: 'PROMPTS CODEX/p03-clientes-cotizaciones.prompt.md; p09-normativa.prompt.md' },
  { term: 'ARnD', definition: 'Tipo de descarga registrado en una cotización o actividad normativa.', source: 'PROMPTS CODEX/p03-clientes-cotizaciones.prompt.md; p09-normativa.prompt.md' },
  { term: 'N.A.', definition: 'Estado especial de valor: no aplica; se conserva separado de cero.', source: 'PROMPTS CODEX/specs/k01-formato-localizacion/requirements.md' },
  { term: 'N.E.', definition: 'Estado especial de valor: no especificado; se conserva separado de cero.', source: 'PROMPTS CODEX/specs/k01-formato-localizacion/requirements.md' },
  { term: 'N.R.', definition: 'Estado especial de valor: no reportado; se conserva separado de cero.', source: 'PROMPTS CODEX/specs/k01-formato-localizacion/requirements.md' },
  { term: 'Snapshot', definition: 'Copia inmutable de los datos usados para emitir un reporte.', source: 'PROMPTS CODEX/p12-emision-pdf.prompt.md' },
  { term: 'Rectificación', definition: 'Proceso que crea una nueva versión vinculada y conserva el reporte original.', source: 'PROMPTS CODEX/p12-emision-pdf.prompt.md' },
  { term: 'Subcontratación', definition: 'Ejecución de un ensayo por un laboratorio externo asignado.', source: 'PROMPTS CODEX/p06-subcontratados.prompt.md' },
  { term: 'Cadena de custodia', definition: 'Registro de verificación y condiciones de llegada de la muestra.', source: 'PROMPTS CODEX/p04-muestras-recepcion.prompt.md' },
  { term: 'Regla de decisión', definition: 'Texto acordado con el cliente que se conserva sin interpretación automática.', source: 'PROMPTS CODEX/p03-clientes-cotizaciones.prompt.md' },
]

export const reportStates: HelpEntry[] = [
  { term: 'Borrador', definition: 'Reporte en preparación.', source: 'PROMPTS CODEX/p11-rsa-flujo.prompt.md' },
  { term: 'Validando', definition: 'Reporte en ejecución de validaciones.', source: 'PROMPTS CODEX/p11-rsa-flujo.prompt.md' },
  { term: 'Listo para revisión', definition: 'Reporte enviado al flujo de revisión.', source: 'PROMPTS CODEX/p11-rsa-flujo.prompt.md' },
  { term: 'En revisión', definition: 'Reporte en revisión por la Jefatura de Técnica y Calidad.', source: 'PROMPTS CODEX/p11-rsa-flujo.prompt.md' },
  { term: 'Devuelto', definition: 'Reporte que requiere correcciones y conserva el historial.', source: 'PROMPTS CODEX/p11-rsa-flujo.prompt.md' },
  { term: 'Aprobado', definition: 'Reporte aprobado por la Jefatura o un suplente vigente.', source: 'PROMPTS CODEX/p11-rsa-flujo.prompt.md' },
  { term: 'Emitido', definition: 'Reporte emitido con snapshot inmutable.', source: 'PROMPTS CODEX/p12-emision-pdf.prompt.md' },
  { term: 'Rectificado', definition: 'Reporte sustituido por una nueva versión rectificada.', source: 'PROMPTS CODEX/p12-emision-pdf.prompt.md' },
  { term: 'Anulado', definition: 'Reporte anulado por la Jefatura con motivo.', source: 'PROMPTS CODEX/p12-emision-pdf.prompt.md' },
]

export const quoteStates: HelpEntry[] = [
  { term: 'Borrador', definition: 'Cotización en preparación.', source: 'PROMPTS CODEX/p03-clientes-cotizaciones.prompt.md' },
  { term: 'Vigente', definition: 'Cotización disponible mientras no esté vencida.', source: 'PROMPTS CODEX/p03-clientes-cotizaciones.prompt.md' },
  { term: 'Vencida', definition: 'Cotización fuera de su vigencia.', source: 'PROMPTS CODEX/p03-clientes-cotizaciones.prompt.md' },
  { term: 'Cancelada', definition: 'Cotización que no puede seleccionarse en recepción.', source: 'PROMPTS CODEX/p03-clientes-cotizaciones.prompt.md' },
]

export const roleHelp: RoleHelp[] = [
  { code: 'ADMIN', responsibility: 'Administra usuarios, catálogos y configuración según los permisos del sistema.', source: 'PROMPTS CODEX/p01-fundacion.prompt.md; p13-dashboard-admin.prompt.md' },
  { code: 'ADMIN_TECNICO', responsibility: 'Gestiona despliegue y soporte; no aprueba resultados.', source: 'PROMPTS CODEX/p01-fundacion.prompt.md; PROMPTS CODEX/specs/k04-observabilidad-errores/requirements.md' },
  { code: 'COMERCIAL', responsibility: 'Gestiona clientes, contactos y cotizaciones.', source: 'PROMPTS CODEX/p03-clientes-cotizaciones.prompt.md' },
  { code: 'MUESTREO', responsibility: 'Registra datos de campo y consulta la información de muestras permitida.', source: 'PROMPTS CODEX/p04-muestras-recepcion.prompt.md; p05-campo-adjuntos.prompt.md' },
  { code: 'RECEPCION', responsibility: 'Registra la recepción y gestiona envíos externos y adjuntos autorizados.', source: 'PROMPTS CODEX/p04-muestras-recepcion.prompt.md; p06-subcontratados.prompt.md' },
  { code: 'ANALISTA', responsibility: 'Gestiona resultados, conciliación, normativa y borradores RSA.', source: 'PROMPTS CODEX/p07-resultados.prompt.md; p08-conciliacion.prompt.md; p09-normativa.prompt.md; p11-rsa-flujo.prompt.md' },
  { code: 'JEFE_TECNICA_CALIDAD', responsibility: 'Revisa y aprueba reportes; puede devolverlos con comentario.', source: 'PROMPTS CODEX/p11-rsa-flujo.prompt.md' },
  { code: 'AUDITOR', responsibility: 'Consulta información y auditoría sin modificar datos funcionales.', source: 'PROMPTS CODEX/p01-fundacion.prompt.md; p13-dashboard-admin.prompt.md' },
]

export interface RouteHelp {
  title: string
  description: string
  source: string
  pendingDecision?: string
}

export const routeHelp: Record<string, RouteHelp> = {
  '/clientes': { title: 'Clientes', description: 'Busca clientes por NIT, razón social, alias o contacto; filtra por estado y administra sus contactos según tu rol.', source: 'PROMPTS CODEX/p03-clientes-cotizaciones.prompt.md' },
  '/cotizaciones': { title: 'Cotizaciones', description: 'Consulta y gestiona cotizaciones, ensayos y normativa acordada como sugerencia para etapas posteriores.', source: 'PROMPTS CODEX/p03-clientes-cotizaciones.prompt.md' },
  '/muestras/recepcion': { title: 'Recepción', description: 'Registra la identificación, recepción, ensayos y revisión de la solicitud. Las sugerencias de cotización requieren confirmación.', source: 'PROMPTS CODEX/p04-muestras-recepcion.prompt.md' },
  '/resultados/carga': { title: 'Carga de resultados', description: 'Importa, pega o digita resultados conservando el valor original para revisión humana.', source: 'PROMPTS CODEX/p07-resultados.prompt.md' },
  '/normativa': { title: 'Normativa', description: 'Administra versiones normativas y confirma las actividades elegidas para una muestra.', source: 'PROMPTS CODEX/p09-normativa.prompt.md', pendingDecision: 'DP-007, DP-008, DP-009 y DP-010: conformidad, incertidumbre, sumatorias y redondeo.' },
  '/reportes/borradores': { title: 'Borradores RSA', description: 'Prepara reportes y corrige los devueltos.', source: 'PROMPTS CODEX/p11-rsa-flujo.prompt.md', pendingDecision: 'DP-003: reglas para agrupar muestras en un reporte.' },
  '/reportes/revision': { title: 'Revisión RSA', description: 'Consulta los reportes enviados a revisión y su historial.', source: 'PROMPTS CODEX/p11-rsa-flujo.prompt.md' },
  '/reportes/aprobados': { title: 'Reportes aprobados', description: 'Consulta reportes aprobados pendientes de emisión.', source: 'PROMPTS CODEX/p11-rsa-flujo.prompt.md', pendingDecision: 'DP-031: emisión parcial con reportes subcontratados pendientes.' },
}
