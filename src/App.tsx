import { HashRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AccessDeniedPage } from './pages/AccessDeniedPage'
import { ConfigMissingPage } from './pages/ConfigMissingPage'
import { LoginPage } from './pages/LoginPage'
import { AppLayout } from './layouts/AppLayout'
import { NotFoundPage } from './pages/NotFoundPage'
import { ModulePage } from './pages/ModulePage'
import { navigationGroups } from './navigation'
import { AuthProvider } from './lib/AuthProvider'
import { isSupabaseConfigured, requiredSupabaseVariables } from './lib/supabase'
import { ProtectedRoute } from './components/ProtectedRoute'
import { CatalogPage } from './pages/CatalogPage'
import { DiagnosticsPage } from './pages/DiagnosticsPage'
import { TemplateEditorPage } from './pages/TemplateEditorPage'
import { ClientsPage } from './pages/ClientsPage'
import { QuotesPage } from './pages/QuotesPage'
import { ReceptionPage } from './pages/ReceptionPage'
import { SamplesPage } from './pages/SamplesPage'
import { FieldDataPage } from './pages/FieldDataPage'
import { ExternalShipmentsPage } from './pages/ExternalShipmentsPage'
import { ResultsLoadPage } from './pages/ResultsLoadPage'
import { ResultsPendingPage } from './pages/ResultsPendingPage'
import { ReconciliationPage } from './pages/ReconciliationPage'
import { RegulationsPage } from './pages/RegulationsPage'
import { ValidationsPage } from './pages/ValidationsPage'
import { ReportListPage } from './pages/ReportListPage'
import { ReportBuilderPage } from './pages/ReportBuilderPage'
import { ReportDetailPage } from './pages/ReportDetailPage'
import { ReportPrintPage } from './pages/ReportPrintPage'
import type { ReportStatus } from './types/reports'
import type { CatalogTable } from './types/catalogs'

const catalogRoutes: Record<string, CatalogTable> = {
  '/catalogos/ensayos': 'tests',
  '/catalogos/laboratorios': 'laboratories',
  '/catalogos/metodos': 'methods',
  '/catalogos/matrices': 'matrices',
  '/catalogos/plantillas': 'report_templates',
  '/catalogos/festivos': 'holidays',
}

const diagnosticsRoute = '/administracion/diagnostico'
const reportListRoutes: Record<string, { status: ReportStatus[]; description: string }> = {
  '/reportes/borradores': {
    status: ['DRAFT', 'VALIDATING', 'RETURNED'],
    description: 'Borradores RSA en preparación, validación o devueltos para corrección.',
  },
  '/reportes/revision': {
    status: ['READY_FOR_REVIEW', 'IN_REVIEW'],
    description: 'Reportes RSA pendientes de revisión o en revisión.',
  },
  '/reportes/aprobados': {
    status: ['APPROVED'],
    description: 'Reportes RSA aprobados pendientes del flujo de emisión.',
  },
  '/reportes/emitidos': {
    status: ['ISSUED', 'RECTIFIED', 'VOIDED'],
    description: 'Reportes RSA emitidos, rectificados o anulados.',
  },
}

function navigationPage(path: string, title: string) {
  if (path === '/clientes') return <ClientsPage />
  if (path === '/cotizaciones') return <QuotesPage />
  if (path === '/muestras/recepcion') return <ReceptionPage />
  if (path === '/muestras' || path === '/muestras/buscar') return <SamplesPage />
  if (path === '/muestras/datos-de-campo') return <FieldDataPage />
  if (path === '/laboratorios-externos') return <ExternalShipmentsPage />
  if (path === '/resultados/carga') return <ResultsLoadPage />
  if (path === '/resultados/pendientes') return <ResultsPendingPage />
  if (path === '/resultados/conciliacion') return <ReconciliationPage />
  if (path === '/normativa') return <RegulationsPage />
  if (path === '/validaciones') return <ValidationsPage />
  const reportList = reportListRoutes[path]
  if (reportList) return (
    <ReportListPage
      statusFilter={reportList.status}
      title={title}
      description={reportList.description}
    />
  )
  const catalogTable = catalogRoutes[path]
  if (catalogTable) return <CatalogPage table={catalogTable} />
  if (path === diagnosticsRoute) return <DiagnosticsPage />
  return <ModulePage title={title} />
}

export default function App() {
  if (!isSupabaseConfigured()) {
    return <ConfigMissingPage missingVariables={requiredSupabaseVariables} />
  }

  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/access-denied" element={<AccessDeniedPage />} />
          <Route
            element={
              <ProtectedRoute>
                <AppLayout>
                  <Outlet />
                </AppLayout>
              </ProtectedRoute>
            }
          >
            {navigationGroups.flatMap((group) =>
              group.items.map((item) => (
                <Route
                  key={item.path}
                  path={item.path}
                  element={
                    <ProtectedRoute
                      allowedRoles={item.roles}
                    >
                      {navigationPage(item.path, item.label)}
                    </ProtectedRoute>
                  }
                />
              )),
            )}
            <Route path="/reportes/nuevo" element={<ReportBuilderPage />} />
            <Route path="/reportes/:id/editar" element={<ReportBuilderPage />} />
            <Route path="/reportes/:id/imprimir" element={<ReportPrintPage />} />
            <Route path="/reportes/:id" element={<ReportDetailPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
          {/* Ruta de editor de plantillas — fuera del nav, protegida */}
          <Route
            path="/catalogos/plantillas/:id/editar"
            element={
              <ProtectedRoute allowedRoles={['ADMIN', 'JEFE_TECNICA_CALIDAD', 'AUDITOR']}>
                <AppLayout>
                  <TemplateEditorPage />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate replace to="/login" />} />
        </Routes>
      </HashRouter>
    </AuthProvider>
  )
}
