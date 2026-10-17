/**
 * ErrorBoundary global — captura errores no controlados y los registra.
 * K04 - Requisitos 1.1, 2.2
 *
 * Muestra un mensaje en español sin stack trace.
 * Muestra el correlation_id para que soporte localice el error.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { logClientError, newCorrelationId, sanitize } from '../lib/logging'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  correlationId: string | null
  route: string
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      correlationId: null,
      route: typeof window !== 'undefined' ? window.location.hash : '',
    }
  }

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    const correlationId = newCorrelationId()
    const route =
      typeof window !== 'undefined' ? sanitize(window.location.hash) : 'unknown'

    this.setState({ correlationId, route })

    void logClientError({
      route,
      error,
      correlationId,
    })

    // También registrar en consola para desarrollo (solo en dev)
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary]', error, info)
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false, correlationId: null })
  }

  private handleGoHome = () => {
    window.location.hash = '/'
    this.setState({ hasError: false, correlationId: null })
  }

  override render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <div className="error-boundary" role="alert" aria-live="assertive">
        <div className="error-boundary-content">
          <h1 className="error-boundary-title">Algo salió mal</h1>
          <p className="error-boundary-message">
            Ocurrió un error inesperado. Si el problema persiste, comuníquelo
            al equipo de soporte.
          </p>
          {this.state.correlationId && (
            <p className="error-boundary-cid">
              Referencia de error:{' '}
              <code>{this.state.correlationId}</code>
            </p>
          )}
          <div className="error-boundary-actions">
            <button
              className="btn btn-primary"
              onClick={this.handleRetry}
              type="button"
            >
              Reintentar
            </button>
            <button
              className="btn btn-secondary"
              onClick={this.handleGoHome}
              type="button"
            >
              Ir al inicio
            </button>
          </div>
        </div>
      </div>
    )
  }
}
