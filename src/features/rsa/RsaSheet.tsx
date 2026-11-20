/**
 * Hoja del "REPORTE DE RESULTADOS" (SA-OP-LAA-TEC-FOR.6.1) a partir de ReportModel.
 * Solo presenta: no calcula, no convierte ni redondea (eso es buildReportModel).
 */
import type { ReportModel } from '../../lib/report'
import type { TemplateConfig } from '../../types/templateConfig'
import './rsaSheet.css'

interface RsaSheetProps {
  model: ReportModel
  templateConfig: Partial<TemplateConfig> | null
  signerName: string | null
}

const dash = (value: string | null | undefined) => (value && value.trim() ? value : '—')

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return <tr><th scope="row">{label}</th><td>{dash(value)}</td></tr>
}

export function RsaSheet({ model, templateConfig, signerName }: RsaSheetProps) {
  const header = templateConfig?.header
  const texts = templateConfig?.texts
  const signature = templateConfig?.signature
  const { sampleInfo, client } = model
  const period = sampleInfo.analysisPeriod.start
    ? sampleInfo.analysisPeriod.start === sampleInfo.analysisPeriod.end || !sampleInfo.analysisPeriod.end
      ? sampleInfo.analysisPeriod.start
      : `${sampleInfo.analysisPeriod.start} a ${sampleInfo.analysisPeriod.end}`
    : null
  const coordinates = sampleInfo.latitude || sampleInfo.longitude
    ? `N ${dash(sampleInfo.latitude)} · W ${dash(sampleInfo.longitude)}`
    : null
  const reportLabel = model.header.reportNumber ?? 'BORRADOR (sin número)'
  const fixedColumns = 7

  return (
    <article className="rsa-sheet rsa-format" aria-label={`Reporte ${reportLabel}`}>
      {model.header.isDraft && <div className="watermark" aria-hidden="true">BORRADOR</div>}

      <header className="rsa-format-header">
        <div className="rsa-format-org">
          <strong>{dash(header?.organizationName)}</strong>
          {header?.laboratoryName && <span>{header.laboratoryName}</span>}
        </div>
        <p className="rsa-format-title">{model.header.title}</p>
        <table className="rsa-format-control">
          <caption className="visually-hidden">Control del documento</caption>
          <tbody>
            <InfoRow label="Código" value={model.header.templateCode} />
            <InfoRow label="Versión" value={model.header.templateVersion} />
            <InfoRow label="Fecha aprobación" value={model.header.approvalDate} />
          </tbody>
        </table>
      </header>
      <h1 className="rsa-format-number">Reporte N° {reportLabel}</h1>

      <section className="rsa-format-info">
        <table>
          <caption>Información del cliente</caption>
          <tbody>
            <InfoRow label="Cliente" value={client.businessName} />
            <InfoRow label="Contacto" value={client.contact} />
            <InfoRow label="Teléfono" value={client.phone} />
            <InfoRow label="Email" value={client.email} />
            <InfoRow label="Dirección" value={client.address} />
            <InfoRow label="Ciudad" value={client.city} />
            <InfoRow label="NIT" value={client.nit} />
          </tbody>
        </table>
        <table>
          <caption>Información de la muestra</caption>
          <tbody>
            <InfoRow label="Fecha de reporte" value={sampleInfo.reportDate} />
            <InfoRow label="Fecha de análisis" value={period} />
            <InfoRow label="Fecha de recepción" value={sampleInfo.receivedAt} />
            <InfoRow label="Fecha de muestreo" value={sampleInfo.sampledAt} />
            <InfoRow label="Plan de muestreo" value={sampleInfo.planCode} />
            <InfoRow label="Lugar de muestreo" value={sampleInfo.samplingPlace} />
            <InfoRow label="Tipo de muestreo" value={sampleInfo.samplingType} />
            <InfoRow label="Coordenadas geográficas" value={coordinates} />
            <InfoRow label="Tipo de muestra" value={sampleInfo.sampleType} />
            <InfoRow label="Número de muestras" value={String(sampleInfo.sampleCount)} />
          </tbody>
        </table>
      </section>

      <section aria-label="Resultados de análisis de laboratorio">
        <div aria-label="Resultados de análisis" className="report-table-scroll" role="region" tabIndex={0}>
          <table className="rsa-results-table rsa-format-results">
            <caption>Resultados análisis de laboratorio</caption>
            <thead>
              <tr>
                <th scope="col">Ítem</th>
                <th scope="col">Ensayo</th>
                <th scope="col"><span className="visually-hidden">Acreditación</span></th>
                <th scope="col">Método</th>
                <th scope="col">Técnica</th>
                <th scope="col">LCM</th>
                {model.sampleColumns.map((sample) => (
                  <th key={sample.sampleId} scope="col">Muestra código {sample.code}{sample.point ? <><br />{sample.point}</> : null}</th>
                ))}
                <th scope="col">Unidad</th>
                {model.regulationColumns.map((column) => (
                  <th key={column.columnOrder} scope="col">Valor máximo permisible<br /><small>{column.label}</small></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {model.sections.map((section, sectionIndex) => (
                <SectionRows
                  colSpan={fixedColumns + model.sampleColumns.length + model.regulationColumns.length}
                  key={`${section.label ?? 'sin-grupo'}-${sectionIndex}`}
                  model={model}
                  section={section}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rsa-format-legend" aria-label="Convenciones">
        <p>
          (LCM) Límite de cuantificación del método. (A) Acreditado. (*) Sin acreditación.
          {' '}(N.A) No aplica. (N.E) No especifica. (N.R) No reporta.
        </p>
      </section>

      <section className="rsa-format-observations" aria-label="Observaciones de laboratorio">
        <h2>Observaciones de laboratorio</h2>
        <ul>
          {model.legend.filter((entry) => entry.code !== '*').map((entry) => (
            <li key={entry.code}>
              <strong>({entry.code}) {entry.laboratory}</strong>{entry.resolution ? ` — ${entry.resolution}` : ' — resolución de acreditación no registrada'}
            </li>
          ))}
          {model.observations.map((observation, index) => (
            <li key={index}>
              <strong>{observation.laboratory}</strong> ({observation.parameters.join(', ')}): {observation.text}
            </li>
          ))}
          {texts?.accreditationDeclaration && <li>{texts.accreditationDeclaration}</li>}
          {texts?.subcontractedNote && <li>{texts.subcontractedNote}</li>}
          {texts?.nonAccreditedNote && <li>{texts.nonAccreditedNote}</li>}
          {texts?.additionalObservations && <li>{texts.additionalObservations}</li>}
        </ul>
        {texts?.samplesOnlyDeclaration && <p className="rsa-format-small">{texts.samplesOnlyDeclaration}</p>}
      </section>

      <footer className="rsa-format-footer">
        <div className="rsa-format-signature">
          <div className="signature-line" aria-hidden="true" />
          <p>{dash(signerName ?? signature?.signerNamePlaceholder)}</p>
          <p>{dash(signature?.signerTitle)}</p>
        </div>
        <p className="rsa-format-end">* Fin del Reporte N° {reportLabel} *</p>
        {texts?.footer && <p className="rsa-format-small">{texts.footer}</p>}
      </footer>
    </article>
  )
}

function SectionRows({ section, model, colSpan }: {
  section: ReportModel['sections'][number]
  model: ReportModel
  colSpan: number
}) {
  return (
    <>
      {section.label && (
        <tr className="rsa-format-group"><th colSpan={colSpan} scope="rowgroup">{section.label}</th></tr>
      )}
      {section.rows.map((row) => (
        <tr key={row.testId}>
          <td>{row.item}</td>
          <td>{row.parameter}</td>
          <td>{dash(row.accreditationCode)}</td>
          <td>{dash(row.method)}</td>
          <td>{dash(row.technique)}</td>
          <td>{dash(row.lcm)}</td>
          {model.sampleColumns.map((sample) => {
            const cell = row.results[sample.sampleId]
            return <td key={sample.sampleId}>{cell ? cell.text : '—'}</td>
          })}
          <td>{dash(row.unit)}</td>
          {row.limits.map((limit, index) => <td key={index}>{limit}</td>)}
        </tr>
      ))}
    </>
  )
}
