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
import { MigrationAssistantPage } from './pages/MigrationAssistantPage'
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
                      {item.path === '/clientes'
                        ? <ClientsPage />
                        : item.path === '/cotizaciones'
                          ? <QuotesPage />
                          : item.path === '/muestras/recepcion'
                            ? <ReceptionPage />
                            : item.path === '/muestras' || item.path === '/muestras/buscar'
                              ? <SamplesPage />
                              : item.path === '/muestras/datos-de-campo'
                                ? <FieldDataPage />
                          : catalogRoutes[item.path]
                        ? <CatalogPage table={catalogRoutes[item.path]} />
                        : item.path === diagnosticsRoute
                          ? <DiagnosticsPage />
                          : <ModulePage title={item.label} />}
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
