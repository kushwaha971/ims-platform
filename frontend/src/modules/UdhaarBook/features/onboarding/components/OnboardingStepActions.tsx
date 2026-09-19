'use client';

import { memo } from 'react';

import { UbButton, UbStack } from 'src/design-system';

/**
 * PLT-03 §7 — the action bar, identical on every step: sticky at the bottom on
 * mobile so Continue is under the thumb with the keyboard up, right-aligned
 * above `sm`.
 *
 * The order in the DOM is Back, Skip, Continue — and `flex-col-reverse` on
 * mobile puts Continue at the TOP of the stack, nearest the thumb, without
 * changing the tab order. That is the whole reason this is one component rather
 * than three copies of a `div`.
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
    <UbStack
      direction="column-reverse"
      gap={2}
      className="sticky bottom-0 border-t border-border-hairline bg-surface-card py-3 sm:flex-row sm:items-center sm:justify-end"
    >
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
    </UbStack>
  );
}

OnboardingStepActionsBase.displayName = 'OnboardingStepActions';
export const OnboardingStepActions = memo(OnboardingStepActionsBase);
