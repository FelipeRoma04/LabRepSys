/**
 * Identificación de clientes al importar texto libre (p. ej. el libro de recepción).
 *
 * El VLOOKUP exacto de la macro dejaba campos vacíos sin avisar cuando el nombre no
 * coincidía letra por letra ("Instituto de Higiene Ambiental SAS" frente a
 * "INSTITUTO DE HIGIENE AMBIENTAL S.A.S"). Aquí la comparación ignora mayúsculas,
 * tildes, puntuación y la forma de escribir la sociedad, y nunca adivina: si hay
 * varias coincidencias, es un error explícito.
 */

export interface ClientCandidate {
  id: string
  nit: string | null
  business_name: string
  alias?: string | null
}

export type ClientMatch =
  | { status: 'MATCHED'; client: ClientCandidate; by: 'NIT' | 'NAME' }
  | { status: 'NOT_FOUND' }
  | { status: 'AMBIGUOUS'; candidates: ClientCandidate[] }

/** Solo para COMPARAR: nunca se guarda el nombre normalizado */
export function normalizeBusinessName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' y ')
    .replace(/[.,;:()"'´`-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // "s a s" → "sas", "s a" → "sa", "e s p" → "esp"
    .replace(/\b(?:[a-z] )+[a-z]\b/g, (letters) => letters.replace(/ /g, ''))
}

/** Dígitos del NIT, sin puntos, guiones ni espacios */
export function normalizeNit(value: string): string {
  return value.replace(/\D/g, '')
}

/** true si dos NIT son el mismo, con o sin dígito de verificación */
export function sameNit(a: string, b: string): boolean {
  const x = normalizeNit(a)
  const y = normalizeNit(b)
  if (!x || !y) return false
  if (x === y) return true
  // uno trae el dígito de verificación y el otro no
  return (x.length === y.length + 1 && x.startsWith(y)) || (y.length === x.length + 1 && y.startsWith(x))
}

function unique(candidates: ClientCandidate[]): ClientCandidate[] {
  return [...new Map(candidates.map((client) => [client.id, client])).values()]
}

export function matchClient(
  clients: ClientCandidate[],
  input: { nit?: string | null; name?: string | null },
): ClientMatch {
  const nit = input.nit?.trim() ?? ''
  const name = input.name?.trim() ?? ''

  if (nit) {
    const byNit = unique(clients.filter((client) => client.nit && sameNit(client.nit, nit)))
    if (byNit.length === 1) return { status: 'MATCHED', client: byNit[0], by: 'NIT' }
    if (byNit.length > 1) return { status: 'AMBIGUOUS', candidates: byNit }
  }

  if (name) {
    const target = normalizeBusinessName(name)
    const byName = unique(clients.filter((client) =>
      normalizeBusinessName(client.business_name) === target ||
      (client.alias ? normalizeBusinessName(client.alias) === target : false)))
    if (byName.length === 1) return { status: 'MATCHED', client: byName[0], by: 'NAME' }
    if (byName.length > 1) return { status: 'AMBIGUOUS', candidates: byName }
  }

  return { status: 'NOT_FOUND' }
}
