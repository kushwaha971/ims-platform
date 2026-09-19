'use client';

import { useEffect } from 'react';

/**
 * Part 19 §19.12.1 tier 1 — a crash in the provider stack or the shell itself.
 * Full page, Reload, and the digest Next.js carries, which is the only trace id
 * available when the failure happened before any request was made.
 */
export default function RootError({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>): React.JSX.Element {
  useEffect(() => {
    console.error('[root]', error.message, error.digest);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas px-4 text-center">
      <h1 className="ds-h2 text-text-primary">Something went wrong</h1>
      <p className="ds-body text-text-tertiary">
        Reload the page. If it keeps happening, quote the reference below.
      </p>
      {error.digest && <p className="ds-mono text-text-muted">{error.digest}</p>}
      <button
        type="button"
        onClick={reset}
        className="ds-body-medium rounded-control border border-border-strong px-4 py-2 text-text-primary"
      >
        Reload
      </button>
    </main>
  );
}
