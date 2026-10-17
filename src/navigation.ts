export interface NavigationItem {
  label: string
  path: string
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
      { label: 'Datos de campo', path: '/muestras/datos-de-campo' },
      { label: 'Buscar muestras', path: '/muestras/buscar' },
    ],
  },
  {
    label: 'Resultados',
    items: [
      { label: 'Carga de resultados', path: '/resultados/carga' },
      { label: 'Pendientes', path: '/resultados/pendientes' },
      { label: 'Conciliación', path: '/resultados/conciliacion' },
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
    ],
  },
  { label: 'Indicadores', items: [{ label: 'Indicadores', path: '/indicadores' }] },
  { label: 'Auditoría', items: [{ label: 'Auditoría', path: '/auditoria' }] },
  {
    label: 'Administración',
    items: [{ label: 'Administración', path: '/administracion' }],
  },
]
