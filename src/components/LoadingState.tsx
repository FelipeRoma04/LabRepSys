interface LoadingStateProps {
  message?: string
}

export function LoadingState({ message = 'Cargando…' }: LoadingStateProps) {
  return (
    <div aria-live="polite" className="state-panel loading-state" role="status">
      <span aria-hidden="true" className="loading-indicator" />
      <span>{message}</span>
    </div>
  )
}
