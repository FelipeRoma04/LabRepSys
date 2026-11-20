import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Modal } from '../../components/Modal'
import { useAuth } from '../../hooks/useAuth'
import { glossary, quoteStates, reportStates, roleHelp, routeHelp } from './content'

interface HelpDrawerProps {
  open: boolean
  onClose: () => void
}

export function HelpDrawer({ open, onClose }: HelpDrawerProps) {
  const location = useLocation()
  const { roles } = useAuth()
  const [search, setSearch] = useState('')
  const query = search.trim().toLocaleLowerCase()
  const route = routeHelp[location.pathname]
  const visibleRoles = roleHelp.filter((role) => roles.some((userRole) => userRole.code === role.code))
  const visibleGlossary = glossary.filter((entry) =>
    !query || `${entry.term} ${entry.definition}`.toLocaleLowerCase().includes(query),
  )

  return (
    <Modal open={open} onClose={onClose} title="Ayuda contextual">
      <div className="help-content">
        <label className="help-search">
          Buscar en el glosario
          <input
            autoFocus
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Ej.: LCM"
            type="search"
            value={search}
          />
        </label>

        {route && (
          <section aria-labelledby="help-route-title" className="help-section">
            <h3 id="help-route-title">{route.title}</h3>
            <p>{route.description}</p>
            {route.pendingDecision && (
              <p className="notice notice-warning">
                Pendiente de definición funcional: {route.pendingDecision}
              </p>
            )}
            <small>Fuente: {route.source}</small>
          </section>
        )}

        <section aria-labelledby="help-glossary-title" className="help-section">
          <h3 id="help-glossary-title">Glosario</h3>
          {visibleGlossary.length ? (
            <dl className="help-glossary">
              {visibleGlossary.map((entry) => (
                <div key={entry.term}>
                  <dt>{entry.term}</dt>
                  <dd>{entry.definition}</dd>
                  <small>Fuente: {entry.source}</small>
                </div>
              ))}
            </dl>
          ) : <p>No hay términos que coincidan con la búsqueda.</p>}
        </section>

        {!query && (
          <>
            <section aria-labelledby="help-report-states" className="help-section">
              <h3 id="help-report-states">Estados del RSA</h3>
              <HelpList entries={reportStates} />
            </section>
            <section aria-labelledby="help-quote-states" className="help-section">
              <h3 id="help-quote-states">Estados de la cotización</h3>
              <HelpList entries={quoteStates} />
            </section>
            <section aria-labelledby="help-roles-title" className="help-section">
              <h3 id="help-roles-title">Responsabilidades de tu rol</h3>
              {visibleRoles.length ? <ul>
                {visibleRoles.map((role) => (
                  <li key={role.code}>
                    <strong>{role.code}:</strong> {role.responsibility} <small>Fuente: {role.source}</small>
                  </li>
                ))}
              </ul> : <p>No hay roles asignados a esta cuenta.</p>}
            </section>
          </>
        )}
        <p className="help-source-note">
          Ayuda construida a partir de las instrucciones y especificaciones disponibles en el repositorio.
          La especificación funcional general citada por los prompts no está incluida en este proyecto.
        </p>
      </div>
    </Modal>
  )
}

function HelpList({ entries }: { entries: typeof reportStates }) {
  return (
    <dl className="help-glossary help-state-list">
      {entries.map((entry) => (
        <div key={entry.term}>
          <dt>{entry.term}</dt>
          <dd>{entry.definition}</dd>
          <small>Fuente: {entry.source}</small>
        </div>
      ))}
    </dl>
  )
}
