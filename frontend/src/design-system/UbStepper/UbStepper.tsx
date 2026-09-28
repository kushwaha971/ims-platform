'use client';

import { memo } from 'react';

import { Check } from 'lucide-react';

import { MLProgress } from 'src/design-system/primitives';
import { cn } from 'src/utils/cn';

/**
 * PLT-03 §7 — the wizard's progress, in its two forms.
 *
 *  · **`lg` and up** — labelled steps down a rail: a numbered marker, the
 *    step's real sentence label, a tick once it is done.
 *  · **below `lg`** — a slim bar above the form: "Step 2 of 4" and the name of
 *    the step you are on, over an `MLProgress` that carries the same sentence
 *    as its accessible name and the percentage as its value.
 *
 * ── CR-2026-09-19-F: the breakpoint moved from `md` to `lg` ─────────────────
 * The rail this list now sits in is a full-height column (§19.6.1's onboarding
 * layout A). At 768 px a 320 px rail leaves 448 px for a form whose widest
 * element is a three-column grid of tiles, which is the "half the width is dead
 * on both sides" complaint arriving from the other direction. `lg` (1024 px) is
 * where a rail and a readable measure both fit, and it is the same breakpoint
 * `UbSidebar` uses for the application's own rail — one rule for rails.
 *
 * ── The compact bar says WHICH step, not just how many ──────────────────────
 * "Step 2 of 4" alone tells the merchant how far they have to go and nothing
 * about where they are. On a phone the step's heading is the only label the
 * list would have carried, so the bar carries it.
 *
 * A completed step is NAVIGABLE (FR-9: "steps already completed are navigable
 * via the stepper for edits"); a future step is not, and is rendered as plain
 * text rather than a disabled button — a disabled control invites a tap that
 * does nothing.
 *
 * The current step is `aria-current="step"`, and the whole thing is an ordered
 * list, so a screen reader reads "2 of 4" without the visual.
 */
export interface UbStepperStep {
  readonly key: string;
  readonly label: string;
}

/**
 * `onNav` paints the list for the dark rail — `--surface-nav` is dark in BOTH
 * themes (§23.2.4), so its text does not follow `--text-primary`. It is the
 * same contract `UbLogo`'s `tone="inherit"` and `UbAvatar`'s `tone="onNav"`
 * already carry.
 */
export type UbStepperTone = 'default' | 'onNav';

export interface UbStepperProps {
  readonly steps: readonly UbStepperStep[];
  /** 1-based. */
  readonly current: number;
  /** Highest step the user has completed; steps ≤ this are navigable. */
  readonly completed: number;
  readonly onStepSelect?: (step: number) => void;
  /** "Step {current} of {total}" — already interpolated by the caller. */
  readonly progressLabel: string;
  readonly tone?: UbStepperTone;
  /**
   * Render only one of the two forms. The onboarding page puts the list in its
   * rail and the bar above its form — two different places in the DOM, so one
   * component rendering both and hiding one with a media query would put the
   * bar inside the rail, where it is not.
   */
  readonly show?: 'both' | 'list' | 'bar';
  readonly className?: string;
}

function UbStepperBase({
  steps,
  current,
  completed,
  onStepSelect,
  progressLabel,
  tone = 'default',
  show = 'both',
  className,
}: Readonly<UbStepperProps>) {
  const total = steps.length;
  const percent = total === 0 ? 0 : (Math.min(current, total) / total) * 100;
  const onNav = tone === 'onNav';
  const currentLabel = steps[Math.min(Math.max(current, 1), total) - 1]?.label ?? '';
  /** What the progress bar is called: the number AND the name of the step. */
  const barName = currentLabel ? `${progressLabel} — ${currentLabel}` : progressLabel;

  return (
    <div className={cn('flex w-full flex-col gap-3', className)}>
      {show !== 'list' && (
        <div className={cn('flex flex-col gap-2', show === 'both' && 'lg:hidden')}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className={cn('ds-label', onNav ? 'text-text-onNavMuted' : 'text-text-tertiary')}>
              {progressLabel}
            </p>
            <p
              className={cn(
                'ds-body-sm-medium min-w-0 truncate',
                onNav ? 'text-text-onNav' : 'text-text-primary'
              )}
            >
              {currentLabel}
            </p>
          </div>
          <MLProgress value={percent} ariaLabel={barName} />
        </div>
      )}

      {show !== 'bar' && (
        <ol className={cn('flex flex-col gap-1', show === 'both' && 'hidden lg:flex')}>
          {steps.map((step, index) => {
            const number = index + 1;
            const isDone = number <= completed && number !== current;
            const isCurrent = number === current;
            const navigable = Boolean(onStepSelect) && number <= completed && !isCurrent;

            const marker = (
              <>
                <span
                  aria-hidden
                  className={cn(
                    'ds-label flex h-7 w-7 shrink-0 items-center justify-center rounded-pill border',
                    isCurrent && 'border-accent bg-accent text-text-inverse',
                    isDone && !onNav && 'border-success bg-success-dim text-success',
                    // Not the -bright step: #2FAE72 is 2.83:1 on the white rail, under the
                    // 3:1 a state glyph needs (WCAG 1.4.11, Sprint 12 contrast scan).
                    isDone && onNav && 'border-success text-success',
                    !isCurrent &&
                      !isDone &&
                      (onNav
                        ? 'border-text-onNavMuted text-text-onNavMuted'
                        : 'border-border-subtle text-text-muted')
                  )}
                >
                  {isDone ? <Check className="h-3.5 w-3.5" /> : number}
                </span>
                <span
                  className={cn(
                    'ds-body-sm min-w-0 flex-1 text-balance',
                    isCurrent &&
                      (onNav
                        ? 'ds-body-sm-medium text-text-onNav'
                        : 'ds-body-sm-medium text-text-primary'),
                    !isCurrent && (onNav ? 'text-text-onNavMuted' : 'text-text-tertiary')
                  )}
                >
                  {step.label}
                </span>
              </>
            );

            return (
              <li key={step.key} aria-current={isCurrent ? 'step' : undefined}>
                {navigable ? (
                  <button
                    type="button"
                    onClick={() => onStepSelect?.(number)}
                    className={cn(
                      'flex min-h-11 w-full items-center gap-3 rounded-control px-2 py-2 text-left',
                      onNav ? 'hover:bg-surface-navHover' : 'hover:bg-surface-hover'
                    )}
                  >
                    {marker}
                  </button>
                ) : (
                  <span className="flex min-h-11 w-full items-center gap-3 px-2 py-2">
                    {marker}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

UbStepperBase.displayName = 'UbStepper';
export const UbStepper = memo(UbStepperBase);
