import type { RoleCode } from './types/auth'

export interface NavigationItem {
  label: string
  path: string
  roles?: readonly RoleCode[]
}

export interface NavigationGroup {
  label: string
  items: NavigationItem[]
}

export const navigationGroups: NavigationGroup[] = [
  { label: 'Inicio', items: [{ label: 'Inicio', path: '/' }] },
  {
    label: 'Comercial',
    items: [
      { label: 'Clientes', path: '/clientes' },
      { label: 'Cotizaciones', path: '/cotizaciones' },
    ],
  },
  {
    label: 'Muestras',
    items: [
      { label: 'Muestras', path: '/muestras' },
      { label: 'Recepción', path: '/muestras/recepcion' },
      {
        label: 'Datos de campo',
        path: '/muestras/datos-de-campo',
        roles: ['ADMIN', 'MUESTREO', 'RECEPCION', 'ANALISTA', 'JEFE_TECNICA_CALIDAD', 'AUDITOR'],
      },
      { label: 'Buscar muestras', path: '/muestras/buscar' },
    ],
  },
  {
    label: 'Resultados',
    items: [
      {
        label: 'Carga de resultados',
        path: '/resultados/carga',
        roles: ['ADMIN', 'ANALISTA', 'JEFE_TECNICA_CALIDAD', 'AUDITOR'],
      },
      {
        label: 'Pendientes',
        path: '/resultados/pendientes',
        roles: ['ADMIN', 'RECEPCION', 'ANALISTA', 'JEFE_TECNICA_CALIDAD', 'AUDITOR'],
      },
      {
        label: 'Conciliación',
        path: '/resultados/conciliacion',
        roles: ['ADMIN', 'ANALISTA', 'JEFE_TECNICA_CALIDAD', 'AUDITOR'],
      },
      {
        label: 'Laboratorios externos',
        path: '/laboratorios-externos',
        roles: ['ADMIN', 'RECEPCION', 'ANALISTA', 'JEFE_TECNICA_CALIDAD', 'AUDITOR'],
      },
    ],
  },
  {
    label: 'Normativa y validación',
    items: [
      { label: 'Normativa', path: '/normativa' },
      { label: 'Validaciones', path: '/validaciones' },
    ],
  },
  {
    label: 'Reportes RSA',
    items: [
      { label: 'Borradores', path: '/reportes/borradores' },
      { label: 'En revisión', path: '/reportes/revision' },
      { label: 'Aprobados', path: '/reportes/aprobados' },
      { label: 'Emitidos', path: '/reportes/emitidos' },
    ],
  },
  {
    label: 'Catálogos',
    items: [
      { label: 'Ensayos', path: '/catalogos/ensayos' },
      { label: 'Laboratorios', path: '/catalogos/laboratorios' },
      { label: 'Métodos', path: '/catalogos/metodos' },
      { label: 'Matrices', path: '/catalogos/matrices' },
      { label: 'Plantillas', path: '/catalogos/plantillas' },
      { label: 'Festivos', path: '/catalogos/festivos' },
    ],
  },
  { label: 'Indicadores', items: [{ label: 'Indicadores', path: '/indicadores' }] },
  {
    label: 'Auditoría',
    items: [
      {
        label: 'Auditoría',
        path: '/auditoria',
        roles: ['ADMIN', 'JEFE_TECNICA_CALIDAD', 'AUDITOR'],
      },
    ],
  },
  {
    label: 'Administración',
    items: [
      { label: 'Administración', path: '/administracion', roles: ['ADMIN'] },
      {
        label: 'Diagnóstico',
        path: '/administracion/diagnostico',
        roles: ['ADMIN', 'ADMIN_TECNICO'],
      },
      {
        label: 'Asistente de migración',
        path: '/administracion/migracion',
        roles: ['ADMIN', 'JEFE_TECNICA_CALIDAD', 'AUDITOR'],
      },
    ],
  },
]
