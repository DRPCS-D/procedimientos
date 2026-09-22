import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Red de seguridad para excepciones de render. Sin esto, cualquier error no
 * controlado deja la pantalla en blanco — y en una PWA instalada eso es un
 * callejón sin salida, porque no hay barra de direcciones para volver.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Error no controlado en la interfaz', error, info)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md rounded-lg border border-border bg-card p-6 text-center shadow-xs">
          <h1 className="text-sm font-semibold text-foreground">Algo se rompió</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Hubo un error inesperado en la aplicación. Podés recargar para volver a empezar.
          </p>
          <p className="mt-3 break-words text-xs text-muted-foreground/70">{error.message}</p>
          <button
            className="mt-5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            onClick={() => window.location.assign('/')}
          >
            Recargar
          </button>
        </div>
      </div>
    )
  }
}
