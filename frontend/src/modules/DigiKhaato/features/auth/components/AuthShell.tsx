'use client';

import { memo, type ReactNode } from 'react';

import { usePathname } from 'next/navigation';

import { UbBox, UbLogo, UbStack, UbText } from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectAppName } from 'src/redux/slice/whiteLabelSlice';
import { ROUTES } from 'src/routes';
import { cn } from 'src/utils/cn';

import { AuthFooter } from './AuthFooter';
import { AuthHeroArt } from './AuthHeroArt';

/**
 * CR-2026-09-19-D — the `(auth)` group's page, replacing the bare centred card
 * of §19.6.1.
 *
 * ── WHAT WAS THERE ──────────────────────────────────────────────────────────
 * `max-w-sm` of card, centred vertically and horizontally on an empty canvas.
 * No mark, no heading structure above the form, no footer, and a language
 * toggle as the first element on the page. On a phone that is a form in a void;
 * in dark mode it was a form in a void you could not see the edge of.
 *
 * ── THE DECISION, REVISITED: a split panel after all ────────────────────────
 * This shell argued for a centred column and against a split panel, in four
 * numbered reasons. The owner has since asked for BrandHub's split, and reading
 * how BrandHub actually builds it retires the first reason, which was the one
 * carrying the weight:
 *
 *  1. It said "a split panel has no mobile form — its right half is
 *     `hidden lg:block`, so the primary layout is still a centred column,
 *     designed second." That is not what BrandHub does.
 *     `CustomerAuthShell` is `grid lg:grid-cols-2`; below `lg` the HERO half is
 *     hidden, the grid collapses to one column, and the brand row is
 *     re-rendered at the top of the form half. The mobile layout is the centred
 *     column — this exact one — and the hero is additive above 1024px. Nothing
 *     the merchant on a 360px phone sees changes.
 *  2. It said "there is no second thing to say", and that was true when nobody
 *     had decided what the second thing was. It is a content question, and the
 *     owner has answered it.
 *  3. Structure — a top, a middle with rhythm, a bottom — is still what makes
 *     this a page rather than a floating card. All of it is kept.
 *  4. The wizard is unaffected: `/onboarding/step/n` already returns early
 *     below and renders its own shell.
 *
 * So: identical at phone and tablet width, and from `lg` a brand half appears
 * beside the form. The form column is `max-w-auth-form` — 340px, BrandHub's
 * `maxWidth['auth-form']` — so the heading, the card and the footer link all
 * share one measure, which is the detail that makes their auth pages look set
 * rather than assembled.
 *
 * The hero background is BrandHub's exactly: a 95%-white wash over the brand
 * colour, which is a 5% tint that follows a white-label tenant without an asset
 * per tenant. `AuthHeroArt` is this product's own drawing using their technique
 * (see that file).
 *
 * ── THE CARD, AND WHERE IT STOPS ────────────────────────────────────────────
 * Below `sm` there is no card: the column runs to the 16 px page gutter and the
 * fields are the surface. A 360 px screen cannot spare 2×20 px of card padding
 * plus 2×16 px of page margin to draw a box around a form that already fills
 * the width. From `sm` up the card appears, because at that width the column no
 * longer fills the viewport and needs its own edge. This is the Stripe/Zoho
 * behaviour rather than the "card everywhere" default, and it is the reason
 * the dark re-tone of `--surface-card` matters: from `sm` up, that edge is the
 * thing separating the form from the page.
 *
 * ── THE BACKGROUND ──────────────────────────────────────────────────────────
 * One very soft radial wash of `--accent-quiet` behind the column — Zoho's
 * "subtly textured page" expressed in tokens rather than an image. It is an
 * `aria-hidden` layer with no content, it costs no request, and at 10 % alpha it
 * changes no contrast ratio.
 */
export interface AuthShellProps {
  readonly children: ReactNode;
  /**
   * Overrides the width the shell picks for itself. Every screen in the group
   * is a form of the same measure, so there is one value and it is the default;
   * the prop stays because the next screen that is not may need it.
   */
  readonly width?: 'form' | 'wide';
}

/**
 * `auth-form` is BrandHub's `maxWidth['auth-form']` — 21.25rem / 340px — and it
 * is used by the heading block, the card, the skeleton and the back link there,
 * so all four share one measure. That single shared width is most of why their
 * auth pages look set rather than assembled; this was `max-w-[400px]`, a number
 * with nothing behind it.
 */
const WIDTH: Readonly<Record<'form' | 'wide', string>> = {
  form: 'max-w-auth-form',
  wide: 'max-w-[880px]',
};

function AuthShellBase({ children, width }: Readonly<AuthShellProps>) {
  const { t } = useTranslation();
  const appName = useAppSelector(selectAppName);
  const pathname = usePathname();
  const resolved = width ?? 'form';

  /**
   * CR-2026-09-19-F — the wizard brings its own page.
   *
   * `/onboarding/step/n` used to be this centred column at `max-w-[880px]`,
   * with the stepper floating beside the step. That layout was reviewed and
   * rejected, and its replacement — `OnboardingShell`, layout A — is a
   * full-height rail against an edge-to-edge form half. There is no width this
   * shell can pass that produces that, because the rail has to reach the top
   * and bottom of the viewport and out to the left edge, which is outside this
   * component's `<main>` and its gutters.
   *
   * So the group's four auth screens keep this shell, and the wizard renders
   * its own `<main>`, its own mark and the same `AuthFooter` — the three things
   * that make the group read as one product — from its own page component.
   */
  if (pathname.startsWith(ROUTES.ONBOARDING)) return <>{children}</>;

  const brandRow = (
    <UbStack direction="row" justify="center" className="w-full">
      <UbLogo variant="full" size="lg" wordmark={appName} label={appName} />
    </UbStack>
  );

  return (
    <UbBox className="grid min-h-dvh w-full bg-canvas lg:grid-cols-2">
      {/* ── The hero half. `hidden` below lg, so the phone layout is unchanged. */}
      <UbStack
        as="section"
        align="center"
        justify="center"
        gap={8}
        aria-hidden
        className={cn(
          'hidden min-h-dvh p-6 lg:flex xl:gap-10',
          // BrandHub's wash — 95% white over the brand colour, a 5% tint that
          // follows a white-label tenant with no asset to export. The rule is
          // `.ub-auth-hero` in globals.css; a Tailwind arbitrary value does not
          // survive the commas inside the gradient's own colour functions.
          'ub-auth-hero'
        )}
      >
        {brandRow}

        <UbBox className="relative mx-auto w-full max-w-xl px-4 text-accent">
          <AuthHeroArt />
        </UbBox>

        <UbStack gap={1} align="center" className="w-full max-w-lg text-center">
          <UbText variant="h3" align="center">
            {t('auth.hero.title', { name: appName })}
          </UbText>
          <UbText variant="body" tone="secondary" align="center">
            {t('auth.hero.description')}
          </UbText>
        </UbStack>
      </UbStack>

      {/* ── The form half. This IS the phone layout, unchanged. */}
      <UbStack
        as="main"
        align="center"
        justify="center"
        gap={6}
        className="relative min-h-dvh px-6 py-10"
        id="auth-main"
      >
        {/* The mark moves here below lg, where the hero half is not rendered —
            BrandHub does the same, and it is what stops the phone screen
            losing its top. */}
        <UbBox className="lg:hidden">{brandRow}</UbBox>

        <UbStack gap={6} className={cn('w-full', WIDTH[resolved])}>
          {children}
        </UbStack>

        <AuthFooter />
      </UbStack>
    </UbBox>
  );
}

AuthShellBase.displayName = 'AuthShell';
export const AuthShell = memo(AuthShellBase);
