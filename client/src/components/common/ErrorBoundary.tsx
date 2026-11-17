import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  private handleReload = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    } else {
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '60vh',
            padding: '32px 24px',
            background: 'rgba(15, 17, 26, 0.95)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: '12px',
            margin: '24px auto',
            maxWidth: '900px',
            color: '#f8fafc',
            textAlign: 'center',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
          }}
        >
          <div style={{ fontSize: '3rem', marginBottom: '12px' }}>⚠️</div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f87171', margin: '0 0 8px 0' }}>
            {this.props.fallbackTitle || 'Workspace Component Error'}
          </h2>
          <p style={{ fontSize: '0.92rem', color: '#cbd5e1', maxWidth: '600px', lineHeight: '1.6', margin: '0 0 20px 0' }}>
            An unexpected error occurred while rendering this workspace. Your project data is completely safe.
          </p>

          {this.state.error && (
            <div
              style={{
                width: '100%',
                background: 'rgba(0, 0, 0, 0.45)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '8px',
                padding: '12px 16px',
                marginBottom: '20px',
                textAlign: 'left',
                fontFamily: 'monospace',
                fontSize: '0.82rem',
                color: '#fca5a5',
                overflowX: 'auto',
                maxHeight: '180px',
              }}
            >
              <strong>Error:</strong> {this.state.error.message || String(this.state.error)}
              {this.state.errorInfo?.componentStack && (
                <pre style={{ margin: '8px 0 0 0', fontSize: '0.74rem', color: '#94a3b8' }}>
                  {this.state.errorInfo.componentStack}
                </pre>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={this.handleReload}
              style={{
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 22px',
                fontSize: '0.9rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'opacity 0.2s',
              }}
            >
              🔄 Reload & Recover View
            </button>
            <button
              onClick={() => {
                window.location.href = '/';
              }}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                color: '#e2e8f0',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '8px',
                padding: '10px 22px',
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              🏠 Return to Dashboard
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
