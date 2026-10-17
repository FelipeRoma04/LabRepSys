import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Modal } from './Modal'

function ModalHarness() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button onClick={() => setOpen(true)} type="button">Abrir modal</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Editar registro">
        <label>
          Nombre
          <input />
        </label>
        <button type="button">Guardar</button>
      </Modal>
    </>
  )
}

describe('Modal', () => {
  it('moves focus into the dialog, traps Tab, closes with Escape, and restores focus', async () => {
    const user = userEvent.setup()
    render(<ModalHarness />)

    const opener = screen.getByRole('button', { name: 'Abrir modal' })
    await user.click(opener)

    const close = screen.getByRole('button', { name: 'Cerrar ventana' })
    const input = screen.getByRole('textbox', { name: 'Nombre' })
    const save = screen.getByRole('button', { name: 'Guardar' })

    expect(close).toHaveFocus()
    await user.tab()
    expect(input).toHaveFocus()
    await user.tab()
    expect(save).toHaveFocus()
    await user.tab()
    expect(close).toHaveFocus()
    await user.tab({ shift: true })
    expect(save).toHaveFocus()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })
})
