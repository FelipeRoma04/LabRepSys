import type { ColumnMapping, ImportTarget, TargetFieldDef } from './types'

export const TEST_TARGET_FIELDS: TargetFieldDef[] = [
  {
    key: 'code',
    label: 'Código de ensayo',
    required: true,
    description: 'Código vigente con prefijo SA (ej. SA001)',
    aliases: ['codigo', 'codigo de ensayo', 'code', 'ensayo', 'id ensayo', 'codigo sa'],
  },
  {
    key: 'parameter_name',
    label: 'Nombre del parámetro',
    required: true,
    description: 'Parámetro o analito (ej. pH, Plomo, DBO5)',
    aliases: ['parametro', 'nombre del parametro', 'parametro / ensayo', 'analito', 'ensayo nombre', 'parameter'],
  },
  {
    key: 'default_unit',
    label: 'Unidad de medida',
    required: false,
    description: 'Unidad de reporte (ej. mg/L, µg/L, Unidades de pH)',
    aliases: ['unidad', 'unidad de medida', 'unidades', 'unit', 'default_unit'],
  },
  {
    key: 'lcm',
    label: 'Límite de cuantificación (LCM)',
    required: false,
    description: 'Valor numérico de LCM',
    aliases: ['lcm', 'limite de cuantificacion', 'limite', 'ldc', 'limite cuantificacion'],
  },
  {
    key: 'uncertainty_text',
    label: 'Incertidumbre',
    required: false,
    description: 'Texto de incertidumbre expandida tal como se reporta',
    aliases: ['incertidumbre', 'incertidumbre expandida', 'uncertainty', 'u'],
  },
  {
    key: 'accreditation_type',
    label: 'Tipo de acreditación',
    required: false,
    description: 'ACCREDITED, NOT_ACCREDITED, NOT_APPLICABLE',
    aliases: ['acreditacion', 'tipo de acreditacion', 'acreditado', 'accreditation'],
  },
  {
    key: 'technique',
    label: 'Técnica analítica',
    required: false,
    description: 'Técnica empleada (ej. Espectrofotometría, Potenciometría)',
    aliases: ['tecnica', 'tecnica analitica', 'technique'],
  },
  {
    key: 'observations',
    label: 'Observaciones',
    required: false,
    description: 'Notas técnicas del ensayo',
    aliases: ['observaciones', 'notas', 'comentarios', 'observations'],
  },
  {
    key: 'valid_from',
    label: 'Vigencia desde',
    required: false,
    description: 'Fecha desde la cual rige el ensayo',
    aliases: ['vigencia desde', 'fecha vigencia', 'vigencia', 'valid_from'],
  },
]

export const SAMPLE_TARGET_FIELDS: TargetFieldDef[] = [
  {
    key: 'code',
    label: 'Código de muestra',
    required: true,
    description: 'Código de muestra (ej. AG0346)',
    aliases: ['codigo', 'codigo de muestra', 'muestra', 'id muestra', 'identificacion', 'sample_code'],
  },
  {
    key: 'client_nit',
    label: 'NIT del cliente',
    required: false,
    description: 'NIT del cliente (con o sin dígito de verificación)',
    aliases: ['nit', 'nit cliente', 'identificacion cliente', 'documento'],
  },
  {
    key: 'client_name',
    label: 'Razón social del cliente',
    required: false,
    description: 'Razón social registrada del cliente',
    aliases: ['cliente', 'razon social', 'nombre cliente', 'empresa', 'client_name'],
  },
  {
    key: 'matrix_code',
    label: 'Código de matriz',
    required: false,
    description: 'Código de la matriz ambiental (ej. AR, AS, AP)',
    aliases: ['matriz codigo', 'codigo matriz', 'cod matriz'],
  },
  {
    key: 'matrix_name',
    label: 'Nombre de la matriz',
    required: false,
    description: 'Nombre de la matriz ambiental (ej. Agua Residual)',
    aliases: ['matriz', 'nombre matriz', 'tipo de matriz', 'matrix'],
  },
  {
    key: 'plan_code',
    label: 'Código de plan',
    required: false,
    description: 'Plan de muestreo o proyecto asociado',
    aliases: ['plan', 'codigo de plan', 'plan de muestreo', 'proyecto'],
  },
  {
    key: 'sampling_point',
    label: 'Punto de muestreo',
    required: false,
    description: 'Punto o estación de toma de muestra',
    aliases: ['punto', 'punto de muestreo', 'estacion', 'lugar de muestreo', 'ubicacion'],
  },
  {
    key: 'sampled_at',
    label: 'Fecha de muestreo',
    required: false,
    description: 'Fecha y hora en que se recolectó la muestra',
    aliases: ['fecha de muestreo', 'fecha muestreo', 'muestreado', 'fecha toma', 'sampled_at'],
  },
  {
    key: 'observations',
    label: 'Observaciones / Notas',
    required: false,
    description: 'Observaciones de campo o notas de recepción (Libro SA-OP-LAA-TEC-FOR.5.3)',
    aliases: ['observaciones', 'notas', 'laboratorio externo', 'subcontratado', 'comentarios'],
  },
]

export function getTargetFields(target: ImportTarget): TargetFieldDef[] {
  return target === 'tests' ? TEST_TARGET_FIELDS : SAMPLE_TARGET_FIELDS
}

/**
 * Normaliza un texto para comparación tolerante a acentos, espacios y mayúsculas.
 */
export function normalizeColumnName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

/**
 * Sugiere el mapeo automático de columnas comparando encabezados con los alias configurados.
 */
export function suggestColumnMapping(
  headers: string[],
  target: ImportTarget,
): ColumnMapping {
  const fields = getTargetFields(target)
  const mapping: ColumnMapping = {}
  const usedHeaders = new Set<string>()

  for (const field of fields) {
    const normalizedKey = normalizeColumnName(field.key)
    const normalizedAliases = [normalizedKey, ...field.aliases.map(normalizeColumnName)]

    // Buscar coincidencia exacta en encabezados no usados
    let matchedHeader = headers.find((h) => {
      if (usedHeaders.has(h)) return false
      const nh = normalizeColumnName(h)
      return normalizedAliases.includes(nh)
    })

    // Si no hay exacta, buscar coincidencia parcial
    if (!matchedHeader) {
      matchedHeader = headers.find((h) => {
        if (usedHeaders.has(h)) return false
        const nh = normalizeColumnName(h)
        return normalizedAliases.some((alias) => nh.includes(alias) || alias.includes(nh))
      })
    }

    if (matchedHeader) {
      mapping[field.key] = matchedHeader
      usedHeaders.add(matchedHeader)
    } else {
      mapping[field.key] = ''
    }
  }

  return mapping
}
