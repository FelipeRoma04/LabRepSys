import { supabase } from '../lib/supabase'

export type PrivateStorageBucket =
  | 'source-files'
  | 'report-drafts'
  | 'issued-reports'
  | 'signatures'

export async function createStorageSignedUrl(
  bucket: PrivateStorageBucket,
  path: string,
): Promise<string> {
  if (!supabase) {
    throw new Error('La conexión con Supabase no está configurada.')
  }

  const { data, error } = await supabase.functions.invoke(
    'create-storage-signed-url',
    { body: { bucket, path } },
  )

  if (error) throw error
  if (
    !data ||
    typeof data !== 'object' ||
    !('signedUrl' in data) ||
    typeof data.signedUrl !== 'string'
  ) {
    throw new Error('La respuesta de descarga no contiene una URL firmada válida.')
  }

  return data.signedUrl
}
