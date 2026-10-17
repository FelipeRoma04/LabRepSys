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
                      <ModulePage title={item.label} />
                    </ProtectedRoute>
                  }
                />
              )),
            )}
            <Route path="*" element={<NotFoundPage />} />
          </Route>
          <Route path="*" element={<Navigate replace to="/login" />} />
        </Routes>
      </HashRouter>
    </AuthProvider>
  )
}
