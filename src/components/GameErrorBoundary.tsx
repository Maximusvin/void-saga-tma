import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportClientError } from '../observability/clientErrorReporter';
import type { ClientErrorReportInput } from '../observability/clientErrorContract';

interface GameErrorBoundaryProps {
  children: ReactNode;
  reportError?: (report: ClientErrorReportInput) => unknown;
}

interface GameErrorBoundaryState {
  hasError: boolean;
}

export class GameErrorBoundary extends Component<GameErrorBoundaryProps, GameErrorBoundaryState> {
  state: GameErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): GameErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const reporter = this.props.reportError ?? reportClientError;
    reporter({
      kind: 'render',
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack ?? undefined,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="game-error-boundary" data-testid="game-crash-fallback" role="alert">
          <div className="game-error-card">
            <span className="game-error-eyebrow">Rift signal interrupted</span>
            <h1>The Void needs a restart</h1>
            <p>Your cloud save is safe. Reload the Mini App to restore the battlefield.</p>
            <button type="button" onClick={() => window.location.reload()}>
              Reload the Rift
            </button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
