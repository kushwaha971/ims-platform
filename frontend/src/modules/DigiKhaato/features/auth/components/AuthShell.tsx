'use client';

import { memo, type ReactNode } from 'react';

import { usePathname } from 'next/navigation';

import { UbBox, UbLogo, UbStack } from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import { selectAppName } from 'src/redux/slice/whiteLabelSlice';
import { ROUTES } from 'src/routes';
import { cn } from 'src/utils/cn';

import { AuthFooter } from './AuthFooter';

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
 * ── THE DECISION: a centred column, not a split panel ───────────────────────
 * Zoho Books — the direct competitor — puts the form in the left half of one
 * card and a product message with an illustration in the right half. Notion and
 * Linear both use a single centred column about 400 px wide. This screen takes
 * the SECOND shape, for four reasons, in order of weight:
 *
 *  1. **Mobile-first is a constraint here, not a preference.** The merchants
 *     this product is for are on 360 px Android phones. A split panel has no
 *     mobile form — its right half is `hidden lg:block`, which means the
 *     illustrated half is decoration the primary user never sees and the
 *     primary layout is *still* a centred column, designed second. One column
 *     that grows is one design that is right at every width.
 *  2. **There is no second thing to say.** The right half of a Zoho screen
 *     carries a product message and an illustration. We have neither — and the
 *     honest alternative to inventing them is not to reserve half the screen
 *     for them.
 *  3. **The page has structure without a panel.** What was actually missing was
 *     not a second column: it was a top (the mark), a middle with rhythm, and a
 *     bottom (the legal links and the language control). Those are what this
 *     shell adds, and they are what makes the difference between a page and a
 *     floating card.
 *  4. **It survives the wizard.** `/onboarding/step/n` is four screens of form
 *     inside the same group. A split panel would either repeat the illustration
 *     four times or be dropped for the wizard, giving the product two auth
 *     layouts.
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

const WIDTH: Readonly<Record<'form' | 'wide', string>> = {
  form: 'max-w-[400px]',
  wide: 'max-w-[880px]',
};

function AuthShellBase({ children, width }: Readonly<AuthShellProps>) {
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

  return (
    <UbStack className="relative min-h-dvh bg-canvas">
      {/* The wash. Decorative, token-only, and behind everything. */}
      <UbBox
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 h-[420px]',
          'bg-gradient-to-b from-accent-quiet to-transparent'
        )}
      />

      <UbStack
        as="main"
        align="center"
        className="relative flex-1 px-4 pb-10 pt-10 sm:pt-16"
        id="auth-main"
      >
        <UbStack gap={6} className={cn('w-full', WIDTH[resolved])}>
          {/* The mark is the FIRST thing on the page — before the heading, and
              a long way before the language control, which is now at the very
              bottom where Notion puts it. */}
          <UbStack direction="row" justify="center">
            <UbLogo variant="full" size="lg" wordmark={appName} label={appName} />
          </UbStack>

          {children}
        </UbStack>
      </UbStack>

      <AuthFooter />
    </UbStack>
  );
}

AuthShellBase.displayName = 'AuthShell';
export const AuthShell = memo(AuthShellBase);
