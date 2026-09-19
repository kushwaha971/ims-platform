'use client';

import { useEffect } from 'react';

import { UbButton, UbStack, UbText } from 'src/design-system';

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
    <UbStack
      role="alert"
      align="start"
      gap={3}
      className="m-4 rounded-md border border-formError bg-formError-dim p-5"
    >
      <UbText as="h2" variant="h3">
        We could not load this screen
      </UbText>
      <UbText variant="body-sm" tone="tertiary">
        Try again, or go back to the dashboard.
      </UbText>
      {error.digest && (
        <UbText variant="mono" tone="muted">
          {error.digest}
        </UbText>
      )}
      <UbButton variant="secondary" size="sm" onClick={reset}>
        Try again
      </UbButton>
    </UbStack>
  );
}
