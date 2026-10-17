import { HashRouter, Route, Routes } from 'react-router-dom'
import { AppLayout } from './layouts/AppLayout'
import { NotFoundPage } from './pages/NotFoundPage'
import { ModulePage } from './pages/ModulePage'
import { navigationGroups } from './navigation'

export default function App() {
  return (
    <HashRouter>
      <AppLayout>
        <Routes>
          {navigationGroups.flatMap((group) =>
            group.items.map((item) => (
              <Route
                key={item.path}
                path={item.path}
                element={<ModulePage title={item.label} />}
              />
            )),
          )}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AppLayout>
    </HashRouter>
  )
}
