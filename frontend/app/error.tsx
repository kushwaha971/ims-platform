'use client';

import { useEffect } from 'react';

import { UbButton, UbLogo, UbStack, UbText } from 'src/design-system';

/**
 * Part 19 §19.12.1 tier 1 — a crash in the provider stack or the shell itself.
 * Full page, Reload, and the digest Next.js carries, which is the only trace id
 * available when the failure happened before any request was made.
 *
 * ── Why this file, alone, is not translated ─────────────────────────────────
 * This boundary REPLACES the provider tree, `IntlProvider` included. Calling
 * `useTranslation()` here would throw inside the error boundary that exists to
 * catch throws, and the user would get a blank page instead of an apology.
 * `app/(app)/error.tsx` renders inside the providers and IS translated;
 * the difference is deliberate and is the reason the two files do not share an
 * implementation.
 *
 * CR-2026-09-19-D adds the mark and the vertical rhythm the rest of the product
 * has: even the page that means "everything failed" is still this product's
 * page, and a bare `<h1>` on an empty canvas is what a 500 from a load balancer
 * looks like.
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
      gap={6}
      className="min-h-dvh bg-canvas px-4 py-12"
    >
      <UbLogo variant="full" size="lg" />

      <UbStack gap={2} align="center" className="max-w-[420px]">
        <UbText as="h1" variant="h2" align="center">
          Something went wrong
        </UbText>
        <UbText variant="body" tone="tertiary" align="center">
          Reload the page. If it keeps happening, quote the reference below.
        </UbText>
        {error.digest && (
          <UbText variant="mono" tone="muted" align="center">
            {error.digest}
          </UbText>
        )}
      </UbStack>

      <UbButton size="lg" variant="secondary" onClick={reset}>
        Reload
      </UbButton>
    </UbStack>
  );
}
