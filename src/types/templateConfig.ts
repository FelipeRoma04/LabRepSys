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
  /** Ruta a imagen de firma en bucket signatures (mecanismo provisional, DP-012) */
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
