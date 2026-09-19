'use client';

import { useEffect } from 'react';

import { UbButton, UbEmptyState, UbLink, UbPageShell, UbStack } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { ROUTES } from 'src/routes';

/**
 * Part 19 §19.12.1 tier 2 — a crash inside an authenticated route. The shell
 * stays; only the content area shows the error.
 *
 * CR-2026-09-19-D. Two things were wrong and both were invisible until somebody
 * hit the state:
 *
 *  · **It was in English.** Every string was a literal. This boundary renders
 *    INSIDE `AppProviders`, so `useTranslation` works here — a Hindi merchant
 *    was getting an English apology on the one screen where they most need to
 *    understand what happened. (The ROOT boundary, `app/error.tsx`, is a
 *    different case: it replaces the provider tree, so its copy stays literal
 *    and the comment there says so.)
 *  · **It was a bare red block in the top-left corner** — `m-4`, start-aligned,
 *    outside the page column, with a heading, a sentence, a digest and a button
 *    all on the same 12 px gap. It is `UbEmptyState`'s error variant inside the
 *    ordinary page column now, which is the same failure shape every list on
 *    this product already uses, so a crash looks like a state rather than like
 *    the page itself breaking.
 */
export default function AppError({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>): React.JSX.Element {
  const { t } = useTranslation();

  useEffect(() => {
    console.error('[app]', error.message, error.digest);
  }, [error]);

  return (
    <UbPageShell>
      <UbStack gap={4}>
        <UbEmptyState
          variant="error"
          title={t('common.error.screen.title')}
          description={t('common.error.screen.body')}
          // R-E-4 — the digest is the only trace id a client-side crash has.
          requestId={error.digest ?? null}
          action={
            <UbStack direction="row" gap={2} wrap justify="center">
              <UbButton variant="secondary" onClick={reset}>
                {t('common.action.retry')}
              </UbButton>
              <UbLink href={ROUTES.DASHBOARD} className="min-h-11 content-center">
                {t('common.action.goToDashboard')}
              </UbLink>
            </UbStack>
          }
        />
      </UbStack>
    </UbPageShell>
  );
}
