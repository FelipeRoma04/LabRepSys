import axe from 'axe-core'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EmptyState } from './EmptyState'
import { ErrorState } from './ErrorState'

describe('state components', () => {
  it('uses unique accessible title IDs when multiple states appear together', async () => {
    const { container } = render(
      <>
        <EmptyState title="Sin muestras" />
        <EmptyState title="Sin resultados" />
        <ErrorState message="Error de carga" />
        <ErrorState message="Error de guardado" />
      </>,
    )

    const ids = Array.from(container.querySelectorAll('h2')).map((heading) => heading.id)
    expect(new Set(ids).size).toBe(ids.length)

    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(results.violations).toEqual([])
  })
})
