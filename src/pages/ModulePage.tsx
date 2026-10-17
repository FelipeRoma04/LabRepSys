import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'

interface ModulePageProps {
  title: string
}

export function ModulePage({ title }: ModulePageProps) {
  return (
    <>
      <PageHeader title={title} />
      <EmptyState title="Módulo pendiente de implementación" />
    </>
  )
}
