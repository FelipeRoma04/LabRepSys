import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const allowedBuckets = new Set([
  'source-files',
  'report-drafts',
  'issued-reports',
  'signatures',
])

const sourceFileReadRoles = [
  'ADMIN',
  'RECEPCION',
  'ANALISTA',
  'JEFE_TECNICA_CALIDAD',
  'AUDITOR',
]

function respond(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return respond(405, { error: 'Método no permitido.' })
  }

  const authorization = request.headers.get('Authorization')
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!token) return respond(401, { error: 'Sesión requerida.' })
  if (!supabaseUrl || !anonKey || !serviceKey) {
    console.error('Configuración requerida para firmar descargas no disponible.')
    return respond(503, { error: 'El servicio de descargas no está configurado.' })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return respond(400, { error: 'La solicitud no contiene JSON válido.' })
  }

  if (
    !body ||
    typeof body !== 'object' ||
    !('bucket' in body) ||
    !('path' in body) ||
    typeof body.bucket !== 'string' ||
    typeof body.path !== 'string'
  ) {
    return respond(400, { error: 'Se requieren bucket y ruta.' })
  }

  const { bucket, path } = body
  if (
    !allowedBuckets.has(bucket) ||
    path.startsWith('/') ||
    path.includes('\\') ||
    path.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    return respond(400, { error: 'Bucket o ruta no válidos.' })
  }

  if (
    bucket === 'source-files' &&
    !/^samples\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}-[A-Za-z0-9_. -]+$/.test(path)
  ) {
    return respond(400, { error: 'La ruta del archivo no cumple el formato permitido.' })
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser(token)

  if (authError || !user) return respond(401, { error: 'La sesión no es válida.' })

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const [profileResult, rolesResult] = await Promise.all([
    adminClient
      .from('profiles')
      .select('active')
      .eq('id', user.id)
      .maybeSingle(),
    adminClient.from('user_roles').select('role_code').eq('user_id', user.id),
  ])

  if (profileResult.error || rolesResult.error) {
    console.error('No fue posible verificar el perfil antes de firmar una descarga.')
    return respond(503, { error: 'No fue posible verificar los permisos.' })
  }

  const roleCodes = (rolesResult.data ?? []).map((role) => role.role_code)
  const canRead =
    profileResult.data?.active === true &&
    (bucket === 'source-files'
      ? roleCodes.some((role) => sourceFileReadRoles.includes(role))
      : roleCodes.includes('ADMIN'))

  if (!canRead) return respond(403, { error: 'No tiene permiso para descargar este archivo.' })

  if (bucket === 'source-files') {
    const { data: attachment, error: attachmentError } = await adminClient
      .from('sample_attachments')
      .select('id')
      .eq('storage_path', path)
      .eq('withdrawn', false)
      .maybeSingle()

    if (attachmentError) {
      console.error('No fue posible verificar el estado del adjunto solicitado.')
      return respond(503, { error: 'No fue posible verificar el permiso de descarga.' })
    }
    if (!attachment) {
      const { data: resultImport, error: importError } = await adminClient
        .from('result_imports')
        .select('id')
        .eq('storage_path', path)
        .maybeSingle()

      if (importError) {
        console.error('No fue posible verificar la importación asociada al archivo.')
        return respond(503, { error: 'No fue posible verificar el permiso de descarga.' })
      }
      if (!resultImport) {
        return respond(404, { error: 'El archivo no está asociado a un adjunto ni a una importación.' })
      }
    }
  }

  const separatorIndex = path.lastIndexOf('/')
  const directory = separatorIndex < 0 ? '' : path.slice(0, separatorIndex)
  const fileName = separatorIndex < 0 ? path : path.slice(separatorIndex + 1)
  const { data: objects, error: objectError } = await adminClient.storage
    .from(bucket)
    .list(directory, { limit: 100, search: fileName })

  if (objectError) {
    console.error('No fue posible verificar el objeto solicitado.')
    return respond(503, { error: 'No fue posible verificar el archivo.' })
  }
  if (!objects?.some((object) => object.name === fileName)) {
    return respond(404, { error: 'El archivo solicitado no existe.' })
  }

  const { data: signed, error: signingError } = await adminClient.storage
    .from(bucket)
    .createSignedUrl(path, 60)

  if (signingError || !signed) {
    console.error('No fue posible crear una URL firmada para el objeto.')
    return respond(503, { error: 'No fue posible preparar la descarga.' })
  }

  const { error: auditError } = await adminClient.from('audit_logs').insert({
    user_id: user.id,
    action: 'DOWNLOAD',
    entity_type: 'STORAGE_OBJECT',
    new_data: { bucket, path },
    correlation_id: crypto.randomUUID(),
  })

  if (auditError) {
    console.error('No fue posible registrar la descarga en auditoría.')
    return respond(503, { error: 'No fue posible registrar la descarga.' })
  }

  return respond(200, { signedUrl: signed.signedUrl, expiresIn: 60 })
})
