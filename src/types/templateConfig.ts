/**
 * Contrato público para la configuración de plantillas de reporte RSA.
 * K03 - Req 4.1
 *
 * Este tipo es el contrato compartido entre:
 * - El editor de plantillas (K03)
 * - La vista imprimible del RSA (p12)
 * - El generador de PDF en servidor (A02)
 *
 * NUNCA incluir textos legales inventados. Los campos arrancan vacíos.
 * Las imágenes (logos, firma) se referencian por ruta en bucket privado — nunca inline.
 */

/** Columna de la tabla de resultados */
export interface ResultTableColumn {
  key: string
  label: string
  visible: boolean
  order: number
}

/** Regla de paginación CSS */
export interface PaginationRule {
  /** break-before en la sección indicada */
  breakBeforeSection?: 'results' | 'declarations' | 'signatures'
  /** Repetir encabezado de tabla en cada página */
  repeatTableHeader: boolean
  /** Evitar cortar filas entre páginas */
  avoidRowBreak: boolean
}

/** Sección de encabezado del reporte */
export interface HeaderConfig {
  /** Ruta al logo principal en bucket template-assets (nunca base64) */
  logoPath?: string
  /** Ruta al logo secundario si aplica */
  secondaryLogoPath?: string
  organizationName: string
  laboratoryName: string
  /** Código y versión de la plantilla (DP-001: no asumir versión 8) */
  templateCode: string
  /** Texto descriptivo del tipo de documento */
  documentTypeLabel: string
}

/** Textos fijos y declaraciones del reporte */
export interface TextsConfig {
  /** Declaración de acreditación IDEAM */
  accreditationDeclaration: string
  /** Nota sobre ensayos subcontratados */
  subcontractedNote: string
  /** Nota sobre ensayos no acreditados */
  nonAccreditedNote: string
  /** Declaración de que los resultados se refieren solo a las muestras analizadas */
  samplesOnlyDeclaration: string
  /** Pie de página */
  footer: string
  /** Observaciones adicionales fijas */
  additionalObservations?: string
}

/** Sección de firma */
export interface SignatureConfig {
  /** Ruta a imagen de firma en bucket privado template-assets (mecanismo provisional, DP-012) */
  signatureImagePath?: string
  signerTitle: string
  signerNamePlaceholder: string
}

/** Número máximo de columnas de límites normativos visibles */
export type LimitColumnsCount = 1 | 2 | 3 | 4

/**
 * Configuración completa de una plantilla de reporte RSA.
 * Se almacena como JSONB en report_templates.configuration.
 */
export interface TemplateConfig {
  /** Versión del esquema de este JSON — incrementar al hacer cambios breaking */
  schemaVersion: 1
  header: HeaderConfig
  texts: TextsConfig
  signature: SignatureConfig
  /** Columnas visibles en la tabla de resultados y su orden */
  resultColumns: ResultTableColumn[]
  /** Máximo de columnas de límites normativos a mostrar */
  maxLimitColumns: LimitColumnsCount
  pagination: PaginationRule
}

/** Columnas estándar disponibles para la tabla de resultados */
export const DEFAULT_RESULT_COLUMNS: ResultTableColumn[] = [
  { key: 'item', label: 'Ítem', visible: true, order: 0 },
  { key: 'parameter', label: 'Ensayo / Parámetro', visible: true, order: 1 },
  { key: 'accreditation', label: 'Acreditación', visible: true, order: 2 },
  { key: 'method', label: 'Método', visible: true, order: 3 },
  { key: 'technique', label: 'Técnica', visible: false, order: 4 },
  { key: 'lcm', label: 'LCM', visible: true, order: 5 },
  { key: 'result', label: 'Resultado', visible: true, order: 6 },
  { key: 'unit', label: 'Unidad', visible: true, order: 7 },
  { key: 'uncertainty', label: 'Incertidumbre', visible: false, order: 8 },
  { key: 'laboratory', label: 'Laboratorio', visible: true, order: 9 },
]

/** Plantilla en blanco para un DRAFT nuevo — sin textos inventados */
export const EMPTY_TEMPLATE_CONFIG: TemplateConfig = {
  schemaVersion: 1,
  header: {
    logoPath: undefined,
    secondaryLogoPath: undefined,
    organizationName: '',
    laboratoryName: '',
    templateCode: '',
    documentTypeLabel: '',
  },
  texts: {
    accreditationDeclaration: '',
    subcontractedNote: '',
    nonAccreditedNote: '',
    samplesOnlyDeclaration: '',
    footer: '',
    additionalObservations: '',
  },
  signature: {
    signatureImagePath: undefined,
    signerTitle: '',
    signerNamePlaceholder: '',
  },
  resultColumns: DEFAULT_RESULT_COLUMNS,
  maxLimitColumns: 2,
  pagination: {
    repeatTableHeader: true,
    avoidRowBreak: true,
  },
}

export type TemplateConfigErrors = Record<string, string>

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isAssetPath(value: unknown): boolean {
  return value === undefined || (
    isString(value) &&
    value.trim().length > 0 &&
    !/^data:/i.test(value) &&
    !/base64/i.test(value)
  )
}

/** Merge partial persisted JSON with defaults while preserving malformed values for validation. */
export function mergeTemplateConfig(input: unknown): TemplateConfig {
  if (!isRecord(input)) return structuredClone(EMPTY_TEMPLATE_CONFIG)

  const mergeSection = <T extends object>(defaults: T, value: unknown): T => (
    value === undefined ? { ...defaults } : isRecord(value) ? { ...defaults, ...value } as T : value as T
  )

  return {
    ...EMPTY_TEMPLATE_CONFIG,
    ...input,
    header: mergeSection(EMPTY_TEMPLATE_CONFIG.header, input.header),
    texts: mergeSection(EMPTY_TEMPLATE_CONFIG.texts, input.texts),
    signature: mergeSection(EMPTY_TEMPLATE_CONFIG.signature, input.signature),
    pagination: mergeSection(EMPTY_TEMPLATE_CONFIG.pagination, input.pagination),
    resultColumns: input.resultColumns === undefined
      ? DEFAULT_RESULT_COLUMNS.map((column) => ({ ...column }))
      : input.resultColumns as ResultTableColumn[],
  } as TemplateConfig
}

/** Runtime schema validation for JSON read from or written to report_templates.configuration. */
export function validateTemplateConfigSchema(input: unknown): TemplateConfigErrors {
  const errors: TemplateConfigErrors = {}
  if (!isRecord(input)) return { configuration: 'La configuración debe ser un objeto.' }
  if (input.schemaVersion !== 1) errors.schemaVersion = 'La versión de esquema no es compatible.'

  const checkSection = (name: string, required: string[], optional: string[] = []) => {
    const section = input[name]
    if (!isRecord(section)) {
      errors[name] = 'La sección debe ser un objeto.'
      return
    }
    for (const key of required) {
      if (!isString(section[key])) errors[`${name}.${key}`] = 'Debe ser texto.'
    }
    for (const key of optional) {
      if (section[key] !== undefined && !isString(section[key])) errors[`${name}.${key}`] = 'Debe ser texto.'
    }
  }

  checkSection('header', [
    'organizationName', 'laboratoryName', 'templateCode', 'documentTypeLabel',
  ], ['logoPath', 'secondaryLogoPath'])
  checkSection('texts', [
    'accreditationDeclaration', 'subcontractedNote', 'nonAccreditedNote',
    'samplesOnlyDeclaration', 'footer',
  ], ['additionalObservations'])
  checkSection('signature', ['signerTitle', 'signerNamePlaceholder'], ['signatureImagePath'])

  const header = isRecord(input.header) ? input.header : {}
  const signature = isRecord(input.signature) ? input.signature : {}
  for (const [path, value] of [
    ['header.logoPath', header.logoPath],
    ['header.secondaryLogoPath', header.secondaryLogoPath],
    ['signature.signatureImagePath', signature.signatureImagePath],
  ] as const) {
    if (!isAssetPath(value)) errors[path] = 'Debe ser una ruta a un asset, no una imagen incrustada.'
  }

  if (!Array.isArray(input.resultColumns)) {
    errors.resultColumns = 'Debe ser una lista de columnas.'
  } else {
    const keys = new Set<string>()
    input.resultColumns.forEach((column, index) => {
      const path = `resultColumns.${index}`
      if (!isRecord(column)) {
        errors[path] = 'La columna debe ser un objeto.'
        return
      }
      if (!isString(column.key) || !column.key.trim()) errors[`${path}.key`] = 'La clave es obligatoria.'
      else if (keys.has(column.key)) errors[`${path}.key`] = 'La clave de columna debe ser única.'
      else keys.add(column.key)
      if (!isString(column.label)) errors[`${path}.label`] = 'La etiqueta debe ser texto.'
      if (typeof column.visible !== 'boolean') errors[`${path}.visible`] = 'Debe ser verdadero o falso.'
      if (!Number.isInteger(column.order) || (column.order as number) < 0) {
        errors[`${path}.order`] = 'El orden debe ser un entero no negativo.'
      }
    })
  }

  if (!Number.isInteger(input.maxLimitColumns) || ![1, 2, 3, 4].includes(input.maxLimitColumns as number)) {
    errors.maxLimitColumns = 'El máximo de columnas debe estar entre 1 y 4.'
  }

  if (!isRecord(input.pagination)) {
    errors.pagination = 'La paginación debe ser un objeto.'
  } else {
    if (typeof input.pagination.repeatTableHeader !== 'boolean') {
      errors['pagination.repeatTableHeader'] = 'Debe ser verdadero o falso.'
    }
    if (typeof input.pagination.avoidRowBreak !== 'boolean') {
      errors['pagination.avoidRowBreak'] = 'Debe ser verdadero o falso.'
    }
    const breakBeforeSection = input.pagination.breakBeforeSection
    if (breakBeforeSection !== undefined && !['results', 'declarations', 'signatures'].includes(String(breakBeforeSection))) {
      errors['pagination.breakBeforeSection'] = 'La sección de salto no es válida.'
    }
  }

  return errors
}

/** Required fields are business validation; the schema itself permits blank legal copy. */
export function validateTemplateConfigForSave(input: unknown): TemplateConfigErrors {
  const errors = validateTemplateConfigSchema(input)
  if (Object.keys(errors).length || !isRecord(input)) return errors
  const header = input.header as UnknownRecord
  for (const key of ['organizationName', 'laboratoryName', 'templateCode']) {
    if (isString(header[key]) && !header[key].trim()) {
      errors[`header.${key}`] = 'Este campo es obligatorio.'
    }
  }
  if (Array.isArray(input.resultColumns) && !input.resultColumns.some(
    (column) => isRecord(column) && column.visible === true,
  )) {
    errors.resultColumns = 'Al menos una columna debe estar visible.'
  }
  return errors
}

export function getUnsupportedPaginationWarnings(
  pagination: PaginationRule,
  supports: (property: string, value: string) => boolean,
): string[] {
  const warnings: string[] = []
  if (pagination.avoidRowBreak && !supports('break-inside', 'avoid')) {
    warnings.push('Este navegador puede no respetar la regla para evitar cortes entre filas.')
  }
  if (pagination.repeatTableHeader && !supports('display', 'table-header-group')) {
    warnings.push('Este navegador puede no repetir el encabezado de la tabla al imprimir.')
  }
  if (pagination.breakBeforeSection && !supports('break-before', 'page')) {
    warnings.push('Este navegador puede no iniciar la sección configurada en una página nueva.')
  }
  return warnings
}
