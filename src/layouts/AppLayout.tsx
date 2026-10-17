import { useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { navigationGroups } from '../navigation'
import { useAuth } from '../hooks/useAuth'
import { ErrorState } from '../components/ErrorState'
import { ErrorBoundary } from '../components/ErrorBoundary'

interface AppLayoutProps {
  children: ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const location = useLocation()
  const { profile, roles, logout, isSigningOut, authError } = useAuth()

  const visibleGroups = navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          !item.roles ||
          item.roles.some((role) => roles.some((userRole) => userRole.code === role)),
      ),
    }))
    .filter((group) => group.items.length > 0)

  const handleLogout = async () => {
    try {
      await logout()
    } catch {
      // The provider exposes the logout error without discarding the session.
    }
  }

  return (
    <div className="app-shell">
      <aside
        className={`sidebar${isMenuOpen ? ' sidebar-open' : ''}`}
        aria-label="Navegación principal"
      >
        <NavLink className="brand" to="/" onClick={() => setIsMenuOpen(false)}>
          ReportSysDev
          <small>Reportes de laboratorio</small>
        </NavLink>
        <nav>
          {visibleGroups.map((group) => (
            <section className="sidebar-group" key={group.label}>
              <h2>{group.label}</h2>
              {group.items.map((item) => (
                <NavLink
                  className={({ isActive }) =>
                    `sidebar-link${isActive ? ' active' : ''}`
                  }
                  end={item.path === '/'}
                  key={item.path}
                  onClick={() => setIsMenuOpen(false)}
                  to={item.path}
                >
                  {item.label}
                </NavLink>
              ))}
            </section>
          ))}
        </nav>
      </aside>

      {isMenuOpen && (
        <button
          aria-label="Cerrar menú"
          className="mobile-scrim"
          onClick={() => setIsMenuOpen(false)}
          type="button"
        />
      )}

      <div className="app-main">
        <header className="topbar">
          <button
            aria-expanded={isMenuOpen}
            aria-label={isMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
            className="menu-toggle"
            onClick={() => setIsMenuOpen((open) => !open)}
            type="button"
          >
            Menú
          </button>
          <p className="topbar-title">Laboratorio de Aguas y Alimentos</p>
          <div className="topbar-account">
            <span className="topbar-user">
              <strong>{profile?.fullName || 'Usuario'}</strong>
              <span>{profile?.email}</span>
              <span>
                {roles.length
                  ? roles.map((role) => role.name).join(', ')
                  : 'Sin roles asignados'}
              </span>
            </span>
            <button
              className="logout-button"
              disabled={isSigningOut}
              onClick={() => void handleLogout()}
              type="button"
            >
              {isSigningOut ? 'Cerrando…' : 'Cerrar sesión'}
            </button>
          </div>
        </header>
        {authError && (
          <div className="layout-error">
            <ErrorState message={authError} />
          </div>
        )}
        <main aria-live="polite" className="content-area" key={location.pathname}>
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}
