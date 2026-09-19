'use client';

import { useEffect } from 'react';

import { UbButton, UbStack, UbText } from 'src/design-system';

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
    <UbStack
      as="main"
      align="center"
      justify="center"
      gap={4}
      className="min-h-dvh bg-canvas px-4 text-center"
    >
      <UbText as="h1" variant="h2">
        Something went wrong
      </UbText>
      <UbText variant="body" tone="tertiary">
        Reload the page. If it keeps happening, quote the reference below.
      </UbText>
      {error.digest && (
        <UbText variant="mono" tone="muted">
          {error.digest}
        </UbText>
      )}
      <UbButton variant="secondary" onClick={reset}>
        Reload
      </UbButton>
    </UbStack>
  );
}
