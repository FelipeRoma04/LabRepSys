import axe from 'axe-core'

export async function getAxeViolations(element: HTMLElement): Promise<string[]> {
  const { violations } = await axe.run(element, {
    rules: { 'color-contrast': { enabled: false } },
  })

  return violations.map(({ id, help }) => `${id}: ${help}`)
}