'use client';

import { memo } from 'react';

import { Check } from 'lucide-react';

import { MLProgress } from 'src/design-system/primitives';
import { cn } from 'src/utils/cn';

/**
 * PLT-03 §7 — the wizard's progress. Desktop: labelled dots down the left rail.
 * Mobile: an `MLProgress` bar plus "Step 2 of 4", because four labelled dots on
 * a 320 px screen are four illegible dots.
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

export interface UbStepperProps {
  readonly steps: readonly UbStepperStep[];
  /** 1-based. */
  readonly current: number;
  /** Highest step the user has completed; steps ≤ this are navigable. */
  readonly completed: number;
  readonly onStepSelect?: (step: number) => void;
  /** "Step {current} of {total}" — already interpolated by the caller. */
  readonly progressLabel: string;
  readonly className?: string;
}

function UbStepperBase({
  steps,
  current,
  completed,
  onStepSelect,
  progressLabel,
  className,
}: Readonly<UbStepperProps>) {
  const total = steps.length;
  const percent = total === 0 ? 0 : (Math.min(current, total) / total) * 100;

  return (
    <div className={cn('flex w-full flex-col gap-3', className)}>
      <div className="flex flex-col gap-2 md:hidden">
        <p className="ds-label text-text-tertiary">{progressLabel}</p>
        <MLProgress value={percent} ariaLabel={progressLabel} />
      </div>

      <ol className="hidden flex-col gap-1 md:flex">
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
                  isDone && 'border-success bg-success-dim text-success',
                  !isCurrent && !isDone && 'border-border-subtle text-text-muted'
                )}
              >
                {isDone ? <Check className="h-3.5 w-3.5" /> : number}
              </span>
              <span
                className={cn(
                  'ds-body-sm truncate',
                  isCurrent ? 'ds-body-sm-medium text-text-primary' : 'text-text-tertiary'
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
                  className="flex min-h-11 w-full items-center gap-3 rounded-control px-2 text-left hover:bg-surface-hover"
                >
                  {marker}
                </button>
              ) : (
                <span className="flex min-h-11 w-full items-center gap-3 px-2">{marker}</span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

UbStepperBase.displayName = 'UbStepper';
export const UbStepper = memo(UbStepperBase);
