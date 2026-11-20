import { describe, expect, it } from 'vitest'
import {
  EMPTY_TEMPLATE_CONFIG,
  getUnsupportedPaginationWarnings,
  mergeTemplateConfig,
  validateTemplateConfigForSave,
  validateTemplateConfigSchema,
} from './templateConfig'

describe('TemplateConfig', () => {
  it('merges partial persisted sections with defaults', () => {
    const merged = mergeTemplateConfig({ header: { organizationName: 'Lab' } })

    expect(merged.header.organizationName).toBe('Lab')
    expect(merged.header.laboratoryName).toBe('')
    expect(merged.resultColumns).toEqual(EMPTY_TEMPLATE_CONFIG.resultColumns)
    expect(validateTemplateConfigSchema(merged)).toEqual({})
  })

  it('rejects malformed objects, inline image data, and duplicate column keys', () => {
    const invalid = {
      ...EMPTY_TEMPLATE_CONFIG,
      header: { ...EMPTY_TEMPLATE_CONFIG.header, logoPath: 'data:image/png;base64,abc' },
      resultColumns: [
        { key: 'result', label: 'Resultado', visible: true, order: 0 },
        { key: 'result', label: 'Otra', visible: false, order: 1 },
      ],
    }

    expect(validateTemplateConfigSchema(invalid)).toMatchObject({
      'header.logoPath': expect.any(String),
      'resultColumns.1.key': expect.any(String),
    })
    expect(validateTemplateConfigSchema({ header: [] }).header).toBeDefined()
  })

  it('requires business fields and at least one visible column before saving', () => {
    const errors = validateTemplateConfigForSave(EMPTY_TEMPLATE_CONFIG)

    expect(errors['header.organizationName']).toBeDefined()
    expect(errors['header.laboratoryName']).toBeDefined()
    expect(errors['header.templateCode']).toBeDefined()
  })

  it('warns when configured print features are unsupported', () => {
    const warnings = getUnsupportedPaginationWarnings(
      { repeatTableHeader: true, avoidRowBreak: true, breakBeforeSection: 'results' },
      () => false,
    )

    expect(warnings).toHaveLength(3)
  })
})
