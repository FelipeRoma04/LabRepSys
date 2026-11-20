import { useState } from 'react'
import axe from 'axe-core'
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
        <input aria-label="Campo oculto" type="hidden" />
        <div hidden><button type="button">Oculto</button></div>
        <button aria-hidden="true" type="button">Ignorado</button>
        <div contentEditable="true" role="textbox" aria-label="Notas" />
      </Modal>
    </>
  )
}

describe('Modal', () => {
  it('has no axe violations within the dialog', async () => {
    const user = userEvent.setup()
    render(<ModalHarness />)
    await user.click(screen.getByRole('button', { name: 'Abrir modal' }))

    const results = await axe.run(screen.getByRole('dialog'), {
      rules: { 'color-contrast': { enabled: false } },
    })

    expect(results.violations).toEqual([])
  })

  it('moves focus into the dialog, traps Tab, closes with Escape, and restores focus', async () => {
    const user = userEvent.setup()
    render(<ModalHarness />)

    const opener = screen.getByRole('button', { name: 'Abrir modal' })
    await user.click(opener)

    const close = screen.getByRole('button', { name: 'Cerrar ventana' })
    const input = screen.getByRole('textbox', { name: 'Nombre' })
    const save = screen.getByRole('button', { name: 'Guardar' })
    const notes = screen.getByRole('textbox', { name: 'Notas' })

    expect(close).toHaveFocus()
    await user.tab()
    expect(input).toHaveFocus()
    await user.tab()
    expect(save).toHaveFocus()
    await user.tab()
    expect(notes).toHaveFocus()
    await user.tab()
    expect(close).toHaveFocus()
    await user.tab({ shift: true })
    expect(notes).toHaveFocus()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })
})
