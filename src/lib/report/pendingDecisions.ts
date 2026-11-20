/**
 * Decisiones de negocio pendientes que afectan el RSA. La vista imprimible las muestra
 * como avisos (no se imprimen) en lugar de resolverlas en silencio.
 */
export interface ReportPendingDecision {
  code: string
  title: string
  /** Qué hace hoy el sistema mientras no se decida */
  currentBehavior: string
}

export const REPORT_PENDING_DECISIONS: ReportPendingDecision[] = [
  {
    code: 'PERIODO',
    title: 'Periodo de análisis',
    currentBehavior: 'Se calcula como el inicio más temprano y el fin más tardío entre todos los laboratorios (en AG0346 da 2026-06-01, mientras el RSA 0106-2026 impreso dice 2026-06-02). Confirme si algún laboratorio debe excluirse.',
  },
  {
    code: 'DP-010',
    title: 'Redondeo y decimales según el LCM',
    currentBehavior: 'El resultado se muestra tal como lo reportó el laboratorio ("< 4,000" no se convierte en "< 4,00"). Si se ajusta, debe registrarse como corrección con motivo.',
  },
  {
    code: 'UNIDAD',
    title: 'Unidad del AOX y unidades distintas al límite',
    currentBehavior: 'Se usa la unidad del laboratorio (Chemilab: mg/L). Si el límite está en otra unidad, el reporte queda bloqueado: no se convierte automáticamente.',
  },
  {
    code: 'DP-007',
    title: 'Declaración de conformidad y regla de decisión',
    currentBehavior: 'No se evalúa cumplimiento ni se marcan excedencias; solo se muestran los valores máximos permisibles.',
  },
  {
    code: 'DP-008',
    title: 'Normalización de la incertidumbre',
    currentBehavior: 'La incertidumbre se muestra como la reporta cada laboratorio (absoluta en Chemilab, porcentual en AGQ e IHA).',
  },
  {
    code: 'DP-009',
    title: 'Sumatorias BTEX y HAP',
    currentBehavior: 'No se calculan; solo aparecen si el laboratorio las reporta como fila propia.',
  },
]
