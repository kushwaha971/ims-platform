'use client';

import { useEffect } from 'react';

/**
 * Part 19 §19.12.1 tier 2 — a crash inside an authenticated route. The shell
 * stays; only the content area shows the error card, with Retry and the digest.
 */
export default function AppError({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>): React.JSX.Element {
  useEffect(() => {
    console.error('[app]', error.message, error.digest);
  }, [error]);

  return (
    <div
      role="alert"
      className="m-4 flex flex-col items-start gap-3 rounded-md border border-formError bg-formError-dim p-5"
    >
      <h2 className="ds-h3 text-text-primary">We could not load this screen</h2>
      <p className="ds-body-sm text-text-tertiary">Try again, or go back to the dashboard.</p>
      {error.digest && <p className="ds-mono text-text-muted">{error.digest}</p>}
      <button
        type="button"
        onClick={reset}
        className="ds-body-sm-medium rounded-control border border-border-strong px-4 py-2 text-text-primary"
      >
        Try again
      </button>
    </div>
  );
}
