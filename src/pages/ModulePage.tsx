import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'

interface ModulePageProps {
  title: string
}

export function ModulePage({ title }: ModulePageProps) {
  return (
    <>
      <PageHeader title={title} />
      <EmptyState title="No implementado en el MVP" description="Este módulo no tiene una definición funcional disponible en las instrucciones actuales." />
    </>
  )
}
