import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { PendingExternalReportsPage } from './PendingExternalReportsPage'
import { PendingResultsPage } from './PendingResultsPage'

export function ResultsPendingPage() {
  const { roles } = useAuth()
  const canReadResults = roles.some((role) =>
    ['ADMIN', 'ANALISTA', 'JEFE_TECNICA_CALIDAD', 'AUDITOR'].includes(role.code),
  )
  const [tab, setTab] = useState<'results' | 'external'>('results')
  const activeTab = canReadResults ? tab : 'external'

  return (
    <div>
      <div className="tabs" role="tablist" aria-label="Tipo de resultado pendiente">
        {canReadResults && (
          <button
            aria-selected={activeTab === 'results'}
            className={`tab${activeTab === 'results' ? ' tab-active' : ''}`}
            onClick={() => setTab('results')}
            role="tab"
            type="button"
          >Ensayos sin resultado</button>
        )}
        <button
          aria-selected={activeTab === 'external'}
          className={`tab${activeTab === 'external' ? ' tab-active' : ''}`}
          onClick={() => setTab('external')}
          role="tab"
          type="button"
        >Reportes externos</button>
      </div>
      {activeTab === 'results' ? <PendingResultsPage /> : <PendingExternalReportsPage />}
    </div>
  )
}
