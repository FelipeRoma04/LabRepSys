import { useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { navigationGroups } from '../navigation'

interface AppLayoutProps {
  children: ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const location = useLocation()

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
          {navigationGroups.map((group) => (
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
        </header>
        <main aria-live="polite" className="content-area" key={location.pathname}>
          {children}
        </main>
      </div>
    </div>
  )
}
