import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class GlobeErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('MarsGlobe caught error:', error, errorInfo)
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#090d16',
            color: '#f8fafc',
            padding: 32,
            textAlign: 'center',
            zIndex: 10,
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ fontSize: 18, margin: '0 0 8px 0', letterSpacing: 1.5 }}>
            3D VIEWPORT INITIALIZATION ERROR
          </h2>
          <p style={{ color: '#94a3b8', fontSize: 13, maxWidth: 500, margin: '0 0 20px 0' }}>
            {this.state.error?.message || 'An unexpected error occurred while rendering the Mars globe.'}
          </p>
          <button
            onClick={this.handleRetry}
            style={{
              background: '#0ea5e9',
              color: '#fff',
              border: 'none',
              padding: '10px 20px',
              borderRadius: 6,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ↻ Reload 3D Viewport
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
