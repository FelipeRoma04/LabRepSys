interface ErrorStateProps {
  message: string
  title?: string
}

export function ErrorState({
  message,
  title = 'No se pudo completar la operación',
}: ErrorStateProps) {
  return (
    <section aria-labelledby="error-state-title" className="state-panel error-state" role="alert">
      <h2 id="error-state-title">{title}</h2>
      <p>{message}</p>
    </section>
  )
}
