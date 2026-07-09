import assert from 'node:assert/strict';
import type { ErrorInfo } from 'react';
import { describe, it } from 'node:test';
import type { ClientErrorReportInput } from '../observability/clientErrorContract';
import { GameErrorBoundary } from './GameErrorBoundary';

describe('GameErrorBoundary', () => {
  it('switches to its fallback after a render error', () => {
    assert.deepEqual(GameErrorBoundary.getDerivedStateFromError(), { hasError: true });
  });

  it('reports bounded render context through the injected reporter', () => {
    const reports: ClientErrorReportInput[] = [];
    const boundary = new GameErrorBoundary({
      children: null,
      reportError: report => reports.push(report),
    });
    const error = new Error('render failed');

    boundary.componentDidCatch(error, { componentStack: '\n at BrokenView' } as ErrorInfo);

    assert.equal(reports.length, 1);
    assert.equal(reports[0]?.kind, 'render');
    assert.equal(reports[0]?.message, 'render failed');
    assert.equal(reports[0]?.componentStack, '\n at BrokenView');
  });
});
