export type CatalogTable =
  | 'matrices'
  | 'methods'
  | 'laboratories'
  | 'laboratory_accreditations'
  | 'laboratory_accredited_tests'
  | 'tests'
  | 'test_aliases'
  | 'test_groups'
  | 'test_group_members'
  | 'report_templates'
  | 'holidays'

export type CatalogRecord = Record<string, unknown>
export type CatalogFieldType =
  | 'text'
  | 'email'
  | 'number'
  | 'date'
  | 'select'
  | 'textarea'
  | 'json'

export interface CatalogField {
  key: string
  label: string
  type?: CatalogFieldType
  required?: boolean
  options?: readonly { value: string; label: string }[]
  reference?: { table: CatalogTable; label: string }
}

export interface CatalogColumn {
  key: string
  label: string
}

export interface CatalogDefinition {
  table: CatalogTable
  title: string
  description: string
  searchFields: string[]
  fields: CatalogField[]
  columns: CatalogColumn[]
}

const laboratoryTypeOptions = [
  { value: 'INTERNAL', label: 'Interno' },
  { value: 'EXTERNAL', label: 'Externo' },
] as const

const accreditationOptions = [
  { value: 'ACCREDITED', label: 'Acreditado' },
  { value: 'NOT_ACCREDITED', label: 'No acreditado' },
  { value: 'NOT_APPLICABLE', label: 'No aplica' },
] as const

const accreditationTypeOptions = [
  { value: 'LEGACY_CODE', label: 'Código histórico' },
  { value: 'EXTERNAL_NAME', label: 'Nombre externo' },
] as const

export const catalogDefinitions: Record<CatalogTable, CatalogDefinition> = {
  matrices: {
    table: 'matrices',
    title: 'Matrices',
    description: 'Matrices disponibles para clasificar ensayos.',
    searchFields: ['code', 'name', 'description'],
    fields: [
      { key: 'code', label: 'Código', required: true },
      { key: 'name', label: 'Nombre', required: true },
      { key: 'description', label: 'Descripción', type: 'textarea' },
    ],
    columns: [
      { key: 'code', label: 'Código' },
      { key: 'name', label: 'Nombre' },
      { key: 'description', label: 'Descripción' },
    ],
  },
  methods: {
    table: 'methods',
    title: 'Métodos',
    description: 'Métodos analíticos de catálogo.',
    searchFields: ['code', 'name', 'technique', 'reference'],
    fields: [
      { key: 'code', label: 'Código', required: true },
      { key: 'name', label: 'Nombre', required: true },
      { key: 'technique', label: 'Técnica' },
      { key: 'reference', label: 'Referencia' },
    ],
    columns: [
      { key: 'code', label: 'Código' },
      { key: 'name', label: 'Método' },
      { key: 'technique', label: 'Técnica' },
      { key: 'reference', label: 'Referencia' },
    ],
  },
  laboratories: {
    table: 'laboratories',
    title: 'Laboratorios',
    description: 'Laboratorios internos y externos.',
    searchFields: ['code', 'name', 'nit', 'contact_email'],
    fields: [
      { key: 'code', label: 'Código', required: true },
      { key: 'name', label: 'Nombre', required: true },
      { key: 'laboratory_type', label: 'Tipo', type: 'select', required: true, options: laboratoryTypeOptions },
      { key: 'nit', label: 'NIT' },
      { key: 'contact_email', label: 'Correo de contacto', type: 'email' },
    ],
    columns: [
      { key: 'code', label: 'Código' },
      { key: 'name', label: 'Laboratorio' },
      { key: 'laboratory_type', label: 'Tipo' },
      { key: 'nit', label: 'NIT' },
      { key: 'contact_email', label: 'Correo' },
    ],
  },
  laboratory_accreditations: {
    table: 'laboratory_accreditations',
    title: 'Acreditaciones de laboratorios',
    description: 'Resoluciones y periodos de vigencia declarados.',
    searchFields: ['resolution', 'scope_notes'],
    fields: [
      { key: 'laboratory_id', label: 'Laboratorio', type: 'select', required: true, reference: { table: 'laboratories', label: 'name' } },
      { key: 'resolution', label: 'Resolución' },
      { key: 'valid_from', label: 'Válida desde', type: 'date' },
      { key: 'valid_until', label: 'Válida hasta', type: 'date' },
      { key: 'scope_notes', label: 'Notas de alcance', type: 'textarea' },
    ],
    columns: [
      { key: 'laboratory_id', label: 'Laboratorio' },
      { key: 'resolution', label: 'Resolución' },
      { key: 'valid_from', label: 'Válida desde' },
      { key: 'valid_until', label: 'Válida hasta' },
      { key: 'scope_notes', label: 'Notas de alcance' },
    ],
  },
  laboratory_accredited_tests: {
    table: 'laboratory_accredited_tests',
    title: 'Alcances acreditados',
    description: 'Ensayos incluidos en una acreditación de laboratorio.',
    searchFields: [],
    fields: [
      { key: 'accreditation_id', label: 'Acreditación', type: 'select', required: true, reference: { table: 'laboratory_accreditations', label: 'resolution' } },
      { key: 'test_id', label: 'Ensayo', type: 'select', required: true, reference: { table: 'tests', label: 'code' } },
    ],
    columns: [
      { key: 'accreditation_id', label: 'Acreditación' },
      { key: 'test_id', label: 'Ensayo' },
    ],
  },
  tests: {
    table: 'tests',
    title: 'Ensayos',
    description: 'Catálogo versionado de ensayos. Los cambios técnicos crean una versión nueva.',
    searchFields: ['code', 'parameter_name', 'technique', 'default_unit'],
    fields: [
      { key: 'code', label: 'Código SA', required: true },
      { key: 'parameter_name', label: 'Parámetro' },
      { key: 'matrix_id', label: 'Matriz', type: 'select', reference: { table: 'matrices', label: 'name' } },
      { key: 'method_id', label: 'Método', type: 'select', reference: { table: 'methods', label: 'name' } },
      { key: 'technique', label: 'Técnica' },
      { key: 'default_unit', label: 'Unidad' },
      { key: 'lcm', label: 'LCM', type: 'number' },
      { key: 'uncertainty_text', label: 'Incertidumbre' },
      { key: 'accreditation_type', label: 'Acreditación', type: 'select', options: accreditationOptions },
      { key: 'laboratory_id', label: 'Laboratorio', type: 'select', reference: { table: 'laboratories', label: 'name' } },
      { key: 'observations', label: 'Observaciones', type: 'textarea' },
      { key: 'valid_from', label: 'Vigente desde', type: 'date' },
    ],
    columns: [
      { key: 'code', label: 'Código' },
      { key: 'parameter_name', label: 'Parámetro' },
      { key: 'matrix_id', label: 'Matriz' },
      { key: 'method_id', label: 'Método' },
      { key: 'default_unit', label: 'Unidad' },
      { key: 'lcm', label: 'LCM' },
      { key: 'laboratory_id', label: 'Laboratorio' },
      { key: 'accreditation_type', label: 'Acreditación' },
      { key: 'execution_class', label: 'Clasificación' },
      { key: 'version', label: 'Versión' },
      { key: 'issuable', label: 'Emitible' },
    ],
  },
  test_aliases: {
    table: 'test_aliases',
    title: 'Alias de ensayos',
    description: 'Alias históricos y nombres externos asociados a ensayos.',
    searchFields: ['external_code', 'external_name'],
    fields: [
      { key: 'test_id', label: 'Ensayo', type: 'select', required: true, reference: { table: 'tests', label: 'code' } },
      { key: 'laboratory_id', label: 'Laboratorio', type: 'select', reference: { table: 'laboratories', label: 'name' } },
      { key: 'alias_type', label: 'Tipo de alias', type: 'select', required: true, options: accreditationTypeOptions },
      { key: 'external_code', label: 'Código histórico (AGQ, CHEM o SGI)' },
      { key: 'external_name', label: 'Nombre externo' },
    ],
    columns: [
      { key: 'test_id', label: 'Ensayo' },
      { key: 'laboratory_id', label: 'Laboratorio' },
      { key: 'alias_type', label: 'Tipo' },
      { key: 'external_code', label: 'Código' },
      { key: 'external_name', label: 'Nombre externo' },
    ],
  },
  test_groups: {
    table: 'test_groups',
    title: 'Grupos de ensayos',
    description: 'Grupos configurables de ensayos; sus nombres no están codificados en la aplicación.',
    searchFields: ['code', 'name', 'description'],
    fields: [
      { key: 'code', label: 'Código', required: true },
      { key: 'name', label: 'Nombre', required: true },
      { key: 'description', label: 'Descripción', type: 'textarea' },
    ],
    columns: [
      { key: 'code', label: 'Código' },
      { key: 'name', label: 'Nombre' },
      { key: 'description', label: 'Descripción' },
    ],
  },
  test_group_members: {
    table: 'test_group_members',
    title: 'Integrantes de grupos',
    description: 'Relaciones configurables entre grupos y ensayos.',
    searchFields: [],
    fields: [
      { key: 'test_group_id', label: 'Grupo', type: 'select', required: true, reference: { table: 'test_groups', label: 'name' } },
      { key: 'test_id', label: 'Ensayo', type: 'select', required: true, reference: { table: 'tests', label: 'code' } },
    ],
    columns: [
      { key: 'test_group_id', label: 'Grupo' },
      { key: 'test_id', label: 'Ensayo' },
    ],
  },
  report_templates: {
    table: 'report_templates',
    title: 'Plantillas de reporte',
    description: 'Versiones y configuraciones de plantillas. No se presupone una versión oficial.',
    searchFields: ['code', 'status'],
    fields: [
      { key: 'code', label: 'Código', required: true },
      { key: 'version', label: 'Versión', type: 'number', required: true },
      { key: 'configuration', label: 'Configuración JSON', type: 'json', required: true },
    ],
    columns: [
      { key: 'code', label: 'Código' },
      { key: 'version', label: 'Versión' },
      { key: 'approval_date', label: 'Aprobación' },
      { key: 'status', label: 'Estado' },
    ],
  },
  holidays: {
    table: 'holidays',
    title: 'Festivos',
    description: 'Catálogo de festivos. No se calculan plazos con este catálogo.',
    searchFields: ['name'],
    fields: [
      { key: 'date', label: 'Fecha', type: 'date', required: true },
      { key: 'name', label: 'Nombre', required: true },
    ],
    columns: [
      { key: 'date', label: 'Fecha' },
      { key: 'name', label: 'Nombre' },
    ],
  },
}
