import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'

export function NotFoundPage() {
  return (
    <>
      <PageHeader title="Página no encontrada" />
      <EmptyState
        description="La dirección solicitada no corresponde a una página disponible."
        title="No encontramos esta página"
      />
    </>
  )
}
