import { supabase } from '../lib/supabase'
import { listSamples } from './samples'
import type {
  CreateExternalShipmentInput,
  CreateExternalShipmentResult,
  ExternalLaboratory,
  ExternalShipment,
  ExternalShipmentOptions,
  PendingExternalReport,
} from '../types/externalShipments'

function db() {
  if (!supabase) throw new Error('La conexión con Supabase no está configurada.')
  return supabase
}

export async function getExternalShipmentOptions(): Promise<ExternalShipmentOptions> {
  const [samples, laboratories, shipments] = await Promise.all([
    listSamples(),
    db()
      .from('laboratories')
      .select('id, code, name')
      .eq('active', true)
      .eq('laboratory_type', 'EXTERNAL')
      .order('name'),
    db()
      .from('external_shipment_tests')
      .select('sample_test_id, shipment:external_shipments!inner(status)')
      .not('shipment.status', 'in', '(REPORT_RECEIVED,CANCELLED)'),
  ])
  if (laboratories.error) throw laboratories.error
  if (shipments.error) throw shipments.error

  return {
    samples,
    laboratories: (laboratories.data ?? []) as ExternalLaboratory[],
    attachedSampleTestIds: (shipments.data ?? []).map((row) => row.sample_test_id as string),
  }
}

export async function listExternalShipments(): Promise<ExternalShipment[]> {
  const { data, error } = await db()
    .from('external_shipments')
    .select(`
      id, sample_id, laboratory_id, external_code, sent_at, expected_at,
      report_received_at, received_by, status, observations, created_at,
      laboratory:laboratories(name),
      sample:samples(code, sampling_point, client:clients(business_name)),
      tests:external_shipment_tests(sample_test_id, sample_test:sample_tests(test:tests(code)))
    `)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as ExternalShipment[]
}

export async function listPendingExternalReports(): Promise<PendingExternalReport[]> {
  const { data, error } = await db()
    .from('v_pending_external_reports')
    .select('*')
    .order('expected_at', { ascending: true, nullsFirst: false })
  if (error) throw error
  return (data ?? []) as PendingExternalReport[]
}

export async function createExternalShipment(
  input: CreateExternalShipmentInput,
): Promise<CreateExternalShipmentResult> {
  const { data, error } = await db().rpc('create_external_shipment', {
    payload: input,
  })
  if (error) throw error
  return data as unknown as CreateExternalShipmentResult
}

export async function receiveExternalReport(
  shipmentId: string,
  receivedAt: string,
): Promise<void> {
  const { error } = await db().rpc('receive_external_report', {
    target_shipment_id: shipmentId,
    actual_received_at: receivedAt,
  })
  if (error) throw error
}

export async function cancelExternalShipment(
  shipmentId: string,
  reason: string,
): Promise<void> {
  const { error } = await db().rpc('cancel_external_shipment', {
    target_shipment_id: shipmentId,
    cancellation_reason: reason,
  })
  if (error) throw error
}
