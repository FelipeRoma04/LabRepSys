import { supabase } from '../lib/supabase'
import type { ValidationIssue, ValidationRun } from '../types/validations'

function db() {
  if (!supabase) throw new Error('La conexión con Supabase no está configurada.')
  return supabase
}

export async function getValidationHistory(): Promise<{
  runs: ValidationRun[]
  issues: ValidationIssue[]
}> {
  const { data: runData, error: runError } = await db()
    .from('validation_runs')
    .select('*')
    .order('executed_at', { ascending: false })
    .limit(200)
  if (runError) throw runError
  const runs = (runData ?? []) as ValidationRun[]
  if (!runs.length) return { runs, issues: [] }

  const { data: issueData, error: issueError } = await db()
    .from('validation_issues')
    .select('*, rule:validation_rules(code, description, severity, blocking)')
    .in('validation_run_id', runs.map((run) => run.id))
    .order('created_at', { ascending: false })
  if (issueError) throw issueError
  const runById = new Map(runs.map((run) => [run.id, run]))
  const issues = (issueData ?? []).flatMap((raw) => {
    const issue = raw as Omit<ValidationIssue, 'run'> & { rule: ValidationIssue['rule'] }
    const run = runById.get(issue.validation_run_id)
    return run ? [{ ...issue, run }] : []
  })
  return { runs, issues }
}

export async function runValidations(
  entityType: ValidationRun['entity_type'],
  entityId: string,
): Promise<string> {
  const { data, error } = await db().rpc('run_validations', {
    p_entity_type: entityType,
    p_entity_id: entityId,
  })
  if (error) throw error
  if (typeof data !== 'string') throw new Error('El servidor no devolvió el identificador de ejecución.')
  return data
}

export async function resolveValidationWarning(issueId: string, resolution: string): Promise<void> {
  const { data, error } = await db().rpc('resolve_validation_warning', {
    p_issue_id: issueId,
    p_resolution: resolution,
  })
  if (error) throw error
  if (!data || typeof data !== 'object' || !('ok' in data) || data.ok !== true) {
    const message = data && typeof data === 'object' && 'message' in data && typeof data.message === 'string'
      ? data.message
      : 'El servidor no confirmó la resolución de la advertencia.'
    throw new Error(message)
  }
}
