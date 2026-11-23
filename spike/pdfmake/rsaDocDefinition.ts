/**
 * SPIKE (no se fusiona): ReportModel → definición de documento pdfmake con la
 * estructura del formato SA-OP-LAA-TEC-FOR.6.1 (misma que src/features/rsa/RsaSheet).
 */
import type { ReportModel } from '../../src/lib/report/types'

type Content = Record<string, unknown> | string | Content[]

/** Tamaño de página del RSA original (Excel → PDF): 583 x 854 pt */
export const ORIGINAL_PAGE_SIZE = { width: 583, height: 854 }

const dash = (value: string | null | undefined) => (value && value.trim() ? value : '—')

function infoTable(title: string, rows: Array<[string, string | null | undefined]>): Content {
  return {
    table: {
      widths: [90, '*'],
      body: [
        [{ text: title, style: 'sectionTitle', colSpan: 2 }, {}],
        ...rows.map(([label, value]) => [{ text: label, bold: true }, dash(value)]),
      ],
    },
    layout: 'lightHorizontalLines',
  }
}

export function rsaDocDefinition(model: ReportModel, options: { font: string; signerName?: string }) {
  const { sampleInfo, client } = model
  const reportLabel = model.header.reportNumber ?? 'BORRADOR (sin número)'
  const period = sampleInfo.analysisPeriod.start
    ? sampleInfo.analysisPeriod.start === sampleInfo.analysisPeriod.end || !sampleInfo.analysisPeriod.end
      ? sampleInfo.analysisPeriod.start
      : `${sampleInfo.analysisPeriod.start} a ${sampleInfo.analysisPeriod.end}`
    : null
  const coordinates = sampleInfo.latitude || sampleInfo.longitude
    ? `N ${dash(sampleInfo.latitude)} · W ${dash(sampleInfo.longitude)}`
    : null

  const headerRow = [
    { text: 'Ítem', style: 'th' },
    { text: 'Ensayo', style: 'th' },
    { text: '', style: 'th' },
    { text: 'Método', style: 'th' },
    { text: 'Técnica', style: 'th' },
    { text: 'LCM', style: 'th' },
    ...model.sampleColumns.map((sample) => ({
      text: `Muestra código ${sample.code}${sample.point ? `\n${sample.point}` : ''}`,
      style: 'th',
    })),
    { text: 'Unidad', style: 'th' },
    ...model.regulationColumns.map((column) => ({
      text: [{ text: 'Valor máximo permisible\n' }, { text: column.label, fontSize: 5.5 }],
      style: 'th',
    })),
  ]
  const columnCount = headerRow.length
  const body: Content[] = [headerRow]
  for (const section of model.sections) {
    if (section.label) {
      body.push([
        { text: section.label, colSpan: columnCount, style: 'group' },
        ...Array.from({ length: columnCount - 1 }, () => ({})),
      ])
    }
    for (const row of section.rows) {
      body.push([
        String(row.item),
        row.parameter,
        row.accreditationCode ?? '',
        dash(row.method),
        dash(row.technique),
        dash(row.lcm),
        ...model.sampleColumns.map((sample) => {
          const cell = row.results[sample.sampleId]
          return cell ? `${cell.text}${cell.uncertainty ? `\n${cell.uncertainty}` : ''}` : '—'
        }),
        dash(row.unit),
        ...row.limits.map((limit) => dash(limit)),
      ])
    }
  }

  return {
    pageSize: ORIGINAL_PAGE_SIZE,
    pageMargins: [28, 36, 28, 40] as [number, number, number, number],
    defaultStyle: { font: options.font, fontSize: 7 },
    info: { title: `Reporte ${reportLabel}`, subject: model.header.templateCode },
    background: model.header.isDraft
      ? () => ({ text: 'BORRADOR', fontSize: 90, color: '#dddddd', opacity: 0.5, angle: -40, absolutePosition: { x: 90, y: 360 } })
      : undefined,
    footer: (page: number, pages: number) => ({
      text: `${model.header.templateCode} · Página ${page} de ${pages}`,
      alignment: 'center',
      fontSize: 6,
      margin: [0, 12, 0, 0],
    }),
    content: [
      {
        table: {
          widths: [140, '*', 120],
          body: [[
            { text: 'Laboratorio', bold: true },
            { text: model.header.title, style: 'title', alignment: 'center' },
            {
              table: {
                widths: [55, '*'],
                body: [
                  [{ text: 'Código', bold: true }, model.header.templateCode],
                  [{ text: 'Versión', bold: true }, model.header.templateVersion],
                  [{ text: 'Fecha aprobación', bold: true }, dash(model.header.approvalDate)],
                ],
              },
              layout: 'noBorders',
            },
          ]],
        },
      },
      { text: `Reporte N° ${reportLabel}`, style: 'number' },
      {
        columns: [
          infoTable('Información del cliente', [
            ['Cliente', client.businessName], ['Contacto', client.contact], ['Teléfono', client.phone],
            ['Email', client.email], ['Dirección', client.address], ['Ciudad', client.city], ['NIT', client.nit],
          ]),
          infoTable('Información de la muestra', [
            ['Fecha de reporte', sampleInfo.reportDate], ['Fecha de análisis', period],
            ['Fecha de recepción', sampleInfo.receivedAt], ['Fecha de muestreo', sampleInfo.sampledAt],
            ['Plan de muestreo', sampleInfo.planCode], ['Lugar de muestreo', sampleInfo.samplingPlace],
            ['Tipo de muestreo', sampleInfo.samplingType], ['Coordenadas geográficas', coordinates],
            ['Tipo de muestra', sampleInfo.sampleType], ['Número de muestras', String(sampleInfo.sampleCount)],
          ]),
        ],
        columnGap: 10,
      },
      { text: 'Resultados análisis de laboratorio', style: 'sectionTitle', margin: [0, 10, 0, 4] },
      {
        table: {
          headerRows: 1,
          dontBreakRows: true,
          widths: [16, '*', 14, 62, 52, 30, ...model.sampleColumns.map(() => 48), 34, ...model.regulationColumns.map(() => 50)],
          body,
        },
        fontSize: 6.5,
      },
      {
        text: '(LCM) Límite de cuantificación del método. (A) Acreditado. (*) Sin acreditación. (N.A) No aplica. (N.E) No especifica. (N.R) No reporta.',
        fontSize: 6,
        margin: [0, 6, 0, 6],
      },
      { text: 'Observaciones de laboratorio', style: 'sectionTitle' },
      {
        ul: [
          ...model.legend.filter((entry) => entry.code !== '*').map((entry) => ({
            text: [{ text: `(${entry.code}) ${entry.laboratory}`, bold: true }, ` — ${entry.resolution ?? 'resolución de acreditación no registrada'}`],
          })),
          ...model.observations.map((observation) => ({
            text: [{ text: observation.laboratory, bold: true }, ` (${observation.parameters.join(', ')}): ${observation.text}`],
          })),
        ],
        fontSize: 6.5,
      },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 180, y2: 0, lineWidth: 0.5 }], margin: [0, 40, 0, 2] },
      { text: dash(options.signerName), fontSize: 7 },
      { text: `* Fin del Reporte N° ${reportLabel} *`, alignment: 'center', margin: [0, 12, 0, 0], bold: true },
    ],
    styles: {
      title: { fontSize: 11, bold: true },
      number: { fontSize: 10, bold: true, alignment: 'center', margin: [0, 8, 0, 8] },
      sectionTitle: { fontSize: 8, bold: true, fillColor: '#e8e8e8' },
      th: { bold: true, fontSize: 6.5, fillColor: '#d9d9d9', alignment: 'center' },
      group: { bold: true, fillColor: '#f2f2f2' },
    },
  }
}
