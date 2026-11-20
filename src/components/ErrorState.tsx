import { useId } from 'react'

interface ErrorStateProps {
  message: string
  title?: string
}

export function ErrorState({
  message,
  title = 'No se pudo completar la operación',
}: ErrorStateProps) {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className="state-panel error-state" role="alert">
      <h2 id={titleId}>{title}</h2>
      <p>{message}</p>
    </section>
  )
}
