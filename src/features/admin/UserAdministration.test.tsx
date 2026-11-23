import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { UserAdministration } from './UserAdministration'

const roles = [{ code: 'ADMIN', name: 'Administrador' }, { code: 'ANALISTA', name: 'Analista' }]
const profiles = [
  { id: 'admin-1', full_name: 'Ana Admin', email: 'ana@lab.test', active: true },
  { id: 'nuevo', full_name: 'Nuevo Usuario', email: 'nuevo@lab.test', active: true },
]

function setup() {
  const handlers = { onToggleActive: vi.fn(), onAssignRole: vi.fn(), onRemoveRole: vi.fn() }
  render(
    <UserAdministration
      assigned={[{ user_id: 'admin-1', role_code: 'ADMIN' }]}
      currentUserId="admin-1"
      profiles={profiles}
      roles={roles}
      saving={false}
      {...handlers}
    />,
  )
  return handlers
}

describe('UserAdministration', () => {
  it('avisa de las cuentas sin rol y permite filtrarlas', async () => {
    const user = userEvent.setup()
    setup()
    expect(screen.getByText(/1 cuenta\(s\) activa\(s\) sin rol/)).toBeInTheDocument()
    await user.click(screen.getByLabelText(/Sin rol/))
    expect(screen.getByText('Nuevo Usuario')).toBeInTheDocument()
    expect(screen.queryByText('Ana Admin')).not.toBeInTheDocument()
  })

  it('asigna un rol y pide confirmación antes de desactivar', async () => {
    const user = userEvent.setup()
    const handlers = setup()
    await user.selectOptions(screen.getByLabelText('Asignar rol a Nuevo Usuario'), 'ANALISTA')
    expect(handlers.onAssignRole).toHaveBeenCalledWith(expect.objectContaining({ id: 'nuevo' }), 'ANALISTA')

    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    const [, deactivateNew] = screen.getAllByRole('button', { name: 'Desactivar' })
    await user.click(deactivateNew)
    expect(handlers.onToggleActive).not.toHaveBeenCalled()
    await user.click(deactivateNew)
    expect(handlers.onToggleActive).toHaveBeenCalledWith(expect.objectContaining({ id: 'nuevo' }))
    confirm.mockRestore()
  })

  it('no permite desactivar la propia cuenta ni retirar el único ADMIN', () => {
    setup()
    const [deactivateSelf] = screen.getAllByRole('button', { name: 'Desactivar' })
    expect(deactivateSelf).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Retirar' })).toBeDisabled()
  })
})
