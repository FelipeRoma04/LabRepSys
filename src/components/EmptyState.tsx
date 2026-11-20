import { useId } from 'react'

interface EmptyStateProps {
  title: string
  description?: string
}

export function EmptyState({ title, description }: EmptyStateProps) {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className="state-panel">
      <h2 id={titleId}>{title}</h2>
      {description && <p>{description}</p>}
    </section>
  )
}
