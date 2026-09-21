'use client';

import { memo, type ReactNode } from 'react';

import { UbBox, UbLogo, UbStack, UbStepper, UbText, type UbStepperStep } from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectAppName } from 'src/redux/slice/whiteLabelSlice';
import { cn } from 'src/utils/cn';

import { AuthFooter } from '../../auth/components/AuthFooter';
import { AuthScreenHeading } from '../../auth/components/AuthScreenHeading';
import { ONBOARDING_STEP_COUNT } from '../constants/businessTypes';

/**
 * CR-2026-09-19-F — the wizard's page. Layout **A**, the full-height rail.
 *
 * ── WHAT WAS REJECTED, AND WHY ──────────────────────────────────────────────
 * The wizard used to be the `(auth)` group's centred column with the step list
 * floating to its left, and it failed review on four counts:
 *
 *  1. **The step list was orphaned.** It sat outside the card, so the screen
 *     read as two unrelated objects — a menu, and a form that happened to be
 *     beside it — rather than as one page with a place in it.
 *  2. **Half the width was dead.** An 880 px column centred on a 1440 px screen
 *     leaves 280 px of empty canvas on each side of a four-step setup flow.
 *  3. **The card overflowed.** `position: sticky` on the action bar puts it
 *     over whatever is beneath it, and with no bottom slack in the scroll
 *     container the last field could never be scrolled clear of it.
 *  4. **Nine tiles dominated two inputs.** Fixed in the step, not here.
 *
 * ── WHAT THIS IS ────────────────────────────────────────────────────────────
 * At `lg` and up, two parts, edge to edge, no card around either:
 *
 *   ┌──────────────┬───────────────────────────────────────────┐
 *   │ mark         │                                           │
 *   │              │   h1 + subtitle                           │
 *   │ 1 Tell us …  │   the step, in a readable measure,        │
 *   │ 2 GST …      │   left-aligned in its half                │
 *   │ 3 Address    │                                           │
 *   │ 4 Almost …   │                                           │
 *   │              │                                           │
 *   │ reassurance  │   footer                                  │
 *   └──────────────┴───────────────────────────────────────────┘
 *
 * The rail is `position: sticky` at full viewport height, so the four steps and
 * the reassurance stay put while the form scrolls — the Stripe/Linear/Notion
 * shape for multi-step setup, and the same `lg` breakpoint and
 * `--surface-nav` surface as `UbSidebar`, because a product with two rails
 * should not have two rules for rails.
 *
 * **The reassurance line is the rail's bottom.** Zoho puts a product message
 * and an illustration in the second half of its setup screens. We have no
 * illustration and are not inventing one; what we do have is the one thing a
 * merchant in the middle of a setup wizard actually wants told to them, which
 * is that none of it is irreversible.
 *
 * ── BELOW `lg` ──────────────────────────────────────────────────────────────
 * The rail collapses to the slim bar `UbStepper` renders in its `bar` form —
 * "Step 2 of 4" and the name of the step — directly above the form. The rest of
 * the phone layout is the one the group already had and is unchanged: the mark
 * centred at the top, the heading under it, the footer at the bottom.
 *
 * ── THE OVERFLOW ────────────────────────────────────────────────────────────
 * The form area is the scroll container at `lg` (`h-dvh overflow-y-auto`) and
 * the document below it. Either way it carries `pb-28` — 112 px, comfortably
 * more than the sticky action bar's ~69 px — so the last field always scrolls
 * clear of the bar instead of dying behind it.
 */
export interface OnboardingShellProps {
  readonly steps: readonly UbStepperStep[];
  /** 1-based. */
  readonly current: number;
  readonly completed: number;
  readonly onStepSelect: (step: number) => void;
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
}

/**
 * Wide enough for a three-column tile grid at 1024 px and still a readable
 * measure for a label and a field. Capped, never stretched (§23.3).
 */
const MEASURE = 'w-full max-w-[560px]';

function OnboardingShellBase({
  steps,
  current,
  completed,
  onStepSelect,
  title,
  description,
  children,
}: Readonly<OnboardingShellProps>) {
  const { t } = useTranslation();
  const appName = useAppSelector(selectAppName);

  const progressLabel = t('onboarding.progress', {
    current,
    total: ONBOARDING_STEP_COUNT,
  });

  return (
    <UbStack direction="column" className="min-h-dvh bg-canvas lg:flex-row">
      {/* ── The rail. Full viewport height, sticky, `lg` and up only. ─────── */}
      <UbStack
        as="aside"
        aria-label={t('onboarding.rail.label')}
        gap={8}
        className={cn(
          'hidden lg:flex lg:w-[320px] lg:shrink-0',
          'lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto',
          'border-r border-surface-navHover bg-surface-nav px-6 py-8 text-text-onNav'
        )}
      >
        <UbLogo variant="full" size="lg" wordmark={appName} tone="inherit" label={appName} />

        <UbStepper
          steps={steps}
          current={current}
          completed={completed}
          onStepSelect={onStepSelect}
          progressLabel={progressLabel}
          tone="onNav"
          show="list"
        />

        {/* `mt-auto` is what puts the reassurance AT THE BOTTOM of the rail
            rather than under the last step, which is the difference between a
            closing line and a fifth step. */}
        <UbText variant="body-sm" tone="onNavMuted" className="mt-auto text-balance">
          {t('onboarding.rail.reassurance')}
        </UbText>
      </UbStack>

      {/* ── The form half. ──────────────────────────────────────────────────
          Three levels, and each one is load-bearing:

            · the COLUMN is the scroll container at `lg` (`h-dvh
              overflow-y-auto`), which is what makes the rail beside it stay
              still while the form moves;
            · `<main>` inside it is the measure — capped at 560 px, centred on a
              phone, left-aligned in its half from `lg` — and carries `pb-28`,
              the slack the sticky action bar needs so the last field can be
              scrolled clear of it;
            · the FOOTER is `<main>`'s SIBLING, not its child. `<footer>` is
              only a `contentinfo` landmark when it is not inside `main`,
              `article`, `aside`, `nav` or `section`, so nesting it would have
              quietly demoted the one landmark the group's own tests demand. */}
      <UbStack gap={0} className="min-w-0 flex-1 lg:h-dvh lg:overflow-y-auto">
        <UbStack
          as="main"
          id="auth-main"
          gap={6}
          /* Centred at every width, including `lg`.
           *
           * It used to be `lg:mx-0`, which pinned a 560px form to the left edge
           * of a column that is over 1100px wide on a 1440 screen — so the
           * content sat hard against the rail with roughly 560px of empty page
           * to its right. A capped measure is right; anchoring it to one side
           * of a much wider column is what made the screen look unbalanced.
           *
           * Centring here is centring within the column beside the rail, not
           * within the viewport, which is what a rail layout should do: the
           * form reads as the subject of its own space rather than as something
           * pushed aside by the navigation. */
          className={cn(MEASURE, 'mx-auto px-4 pb-28 pt-8 lg:px-10 lg:pt-12')}
        >
          {/* The mark is the first thing on the page below `lg`; above it the
              rail already carries it, and two marks on one screen is one too
              many. */}
          <UbStack direction="row" justify="center" className="lg:hidden">
            <UbLogo variant="full" size="lg" wordmark={appName} label={appName} />
          </UbStack>

          {/* One `h1` for the page, at level 1, with the step's own heading at
              level 2 inside it — the outline the group already agreed on. */}
          <AuthScreenHeading title={title} description={description} align="start" />

          {/* The rail's job below `lg`: the slim bar, above the form. */}
          <UbStepper
            steps={steps}
            current={current}
            completed={completed}
            onStepSelect={onStepSelect}
            progressLabel={progressLabel}
            show="bar"
            className="lg:hidden"
          />

          {children}
        </UbStack>

        <UbBox className="mt-auto w-full">
          <AuthFooter />
        </UbBox>
      </UbStack>
    </UbStack>
  );
}

OnboardingShellBase.displayName = 'OnboardingShell';
export const OnboardingShell = memo(OnboardingShellBase);
