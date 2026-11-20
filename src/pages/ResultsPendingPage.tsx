import { useState, type KeyboardEvent } from 'react'
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
  const availableTabs: Array<'results' | 'external'> = canReadResults
    ? ['results', 'external']
    : ['external']

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return

    event.preventDefault()
    const currentTab = event.currentTarget.id === 'results-tab' ? 'results' : 'external'
    const currentIndex = availableTabs.indexOf(currentTab)
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? availableTabs.length - 1
        : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + availableTabs.length) % availableTabs.length
    const nextTab = availableTabs[nextIndex]
    setTab(nextTab)
    document.getElementById(`${nextTab}-tab`)?.focus()
  }

  return (
    <div>
      <div className="tabs" role="tablist" aria-label="Tipo de resultado pendiente">
        {canReadResults && (
          <button
            aria-controls="results-pending-panel"
            aria-selected={activeTab === 'results'}
            className={`tab${activeTab === 'results' ? ' tab-active' : ''}`}
            id="results-tab"
            onClick={() => setTab('results')}
            onKeyDown={handleTabKeyDown}
            role="tab"
            tabIndex={activeTab === 'results' ? 0 : -1}
            type="button"
          >Ensayos sin resultado</button>
        )}
        <button
          aria-controls="results-pending-panel"
          aria-selected={activeTab === 'external'}
          className={`tab${activeTab === 'external' ? ' tab-active' : ''}`}
          id="external-tab"
          onClick={() => setTab('external')}
          onKeyDown={handleTabKeyDown}
          role="tab"
          tabIndex={activeTab === 'external' ? 0 : -1}
          type="button"
        >Reportes externos</button>
      </div>
      <section
        aria-labelledby={`${activeTab}-tab`}
        className="pending-tab-panel"
        id="results-pending-panel"
        role="tabpanel"
        tabIndex={0}
      >
        {activeTab === 'results' ? <PendingResultsPage /> : <PendingExternalReportsPage />}
      </section>
    </div>
  )
}