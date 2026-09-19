'use client';

import { UbLink, UbLogo, UbStack, UbText } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { ROUTES } from 'src/routes';

/**
 * Part 19 §19.12.1 — the root not-found page.
 *
 * CR-2026-09-19-D: it was three untranslated lines — "404", "This page does not
 * exist." and a "Go back" link — centred on an empty canvas with no mark on it.
 * A 404 is very often the FIRST page a person sees (a stale bookmark, a
 * mistyped address, a link from a WhatsApp forward), so it is the one page that
 * can least afford to look like a server default.
 *
 * It renders inside the root layout, and therefore inside `AppProviders`, which
 * is why it can be a client component and translate itself. The code "404" is
 * kept as a quiet caption rather than as the heading: the heading should say
 * what happened in words the reader has.
 */
export default function NotFound(): React.JSX.Element {
  const { t } = useTranslation();

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
        <UbText variant="label" tone="muted">
          404
        </UbText>
        <UbText as="h1" variant="h2" align="center">
          {t('common.notFound.title')}
        </UbText>
        <UbText variant="body" tone="tertiary" align="center">
          {t('common.notFound.body')}
        </UbText>
      </UbStack>

      {/* A link, not a button: the way out of a 404 is a navigation, and a
          navigation that is a `<button onClick>` cannot be opened in a new tab
          or middle-clicked. */}
      <UbLink href={ROUTES.DASHBOARD} variant="body-medium" className="min-h-11 content-center">
        {t('common.action.goToDashboard')}
      </UbLink>
    </UbStack>
  );
}
