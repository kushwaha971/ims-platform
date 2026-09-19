'use client';

import { memo } from 'react';

import { UbBottomBar, UbButton } from 'src/design-system';

/**
 * PLT-03 §7 — the action bar, identical on every step: sticky at the bottom on
 * mobile so Continue is under the thumb with the keyboard up, right-aligned
 * above `sm`.
 *
 * The order in the DOM is Back, Skip, Continue — and `flex-col-reverse` on
 * mobile puts Continue at the TOP of the stack, nearest the thumb, without
 * changing the tab order. That is the whole reason this is one component rather
 * than three copies of a `div`.
 *
 * CR-2026-09-19-F — the bar is OPAQUE against whatever is behind it at each
 * width, because a sticky bar over a transparent background is a bar you can
 * read the form through: `--canvas` on a phone and from `lg` (where the step
 * has no card), `--surface-card` between them (where it does). The other half
 * of the overflow fix is not here — it is the `pb-28` on the form's scroll
 * container in `OnboardingShell`, which is what lets the last field scroll
 * clear of this bar instead of dying behind it.
 *
 * CR-2026-09-19-G — it is a `UbBottomBar` rather than a `sticky bottom-0`
 * `UbStack`, so it PUBLISHES its height as `--ub-bottom-inset` and the global
 * toast anchors above it. Before this, a failed step submit toasted straight
 * over Continue: the primary action of the screen behind the error message
 * telling you the submit failed. The `sticky bottom-0` now comes from
 * `UbBottomBar`; everything else about the bar is unchanged.
 */
export interface OnboardingStepActionsProps {
  readonly onBack: (() => void) | null;
  /** FR-10 — steps 2 and 3 are skippable; step 1 is not. */
  readonly onSkip?: (() => void) | undefined;
  readonly continueLabel: string;
  readonly busyLabel: string;
  readonly backLabel: string;
  readonly skipLabel: string;
  readonly busy: boolean;
  readonly disabled: boolean;
}

function OnboardingStepActionsBase({
  onBack,
  onSkip,
  continueLabel,
  busyLabel,
  backLabel,
  skipLabel,
  busy,
  disabled,
}: Readonly<OnboardingStepActionsProps>) {
  return (
    <UbBottomBar className="flex flex-col-reverse gap-2 border-t border-border-hairline bg-canvas py-3 sm:flex-row sm:items-center sm:justify-end sm:bg-surface-card lg:bg-canvas">
      {onBack && (
        <UbButton variant="ghost" size="lg" onClick={onBack} disabled={busy}>
          {backLabel}
        </UbButton>
      )}
      {onSkip && (
        <UbButton variant="ghost" size="lg" onClick={onSkip} disabled={busy || disabled}>
          {skipLabel}
        </UbButton>
      )}
      <UbButton
        type="submit"
        size="lg"
        fullWidth
        busy={busy}
        busyLabel={busyLabel}
        disabled={disabled}
        className="sm:w-auto"
      >
        {continueLabel}
      </UbButton>
    </UbBottomBar>
  );
}

OnboardingStepActionsBase.displayName = 'OnboardingStepActions';
export const OnboardingStepActions = memo(OnboardingStepActionsBase);
