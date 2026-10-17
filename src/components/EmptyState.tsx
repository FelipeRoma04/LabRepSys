interface EmptyStateProps {
  title: string
  description?: string
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <section aria-labelledby="empty-state-title" className="state-panel">
      <h2 id="empty-state-title">{title}</h2>
      {description && <p>{description}</p>}
    </section>
  )
}
