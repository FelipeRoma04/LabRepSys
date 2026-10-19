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
import { PendingExternalReportsPage } from './pages/PendingExternalReportsPage'
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

function navigationPage(path: string, title: string) {
  if (path === '/clientes') return <ClientsPage />
  if (path === '/cotizaciones') return <QuotesPage />
  if (path === '/muestras/recepcion') return <ReceptionPage />
  if (path === '/muestras' || path === '/muestras/buscar') return <SamplesPage />
  if (path === '/muestras/datos-de-campo') return <FieldDataPage />
  if (path === '/laboratorios-externos') return <ExternalShipmentsPage />
  if (path === '/resultados/pendientes') return <PendingExternalReportsPage />
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
