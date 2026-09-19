'use client';

import { memo } from 'react';

import { UbStack, UbText } from 'src/design-system';
import { MLProgress } from 'src/design-system/primitives';
import { useTranslation } from 'src/hooks/useTranslation';

import { passwordStrength } from '../view-model/authDisplay';

/**
 * PLT-02 §7 — the four-step strength bar with "Weak / Fair / Strong".
 *
 * It is a HINT and says so: the bar never blocks a submit, because the rule
 * that decides acceptability is `passwordValidation()` and the rule that
 * decides commonness is Django's list, on the server. A meter that looks like a
 * gate but is not one teaches the user to distrust both.
 *
 * The scoring is `passwordStrength()` in the view-model — pure, and unit-tested
 * without a DOM.
 */
export interface PasswordStrengthHintProps {
  readonly password: string;
  readonly className?: string;
}

const TONE = { weak: 'error', fair: 'warning', strong: 'success' } as const;

function PasswordStrengthHintBase({ password, className }: Readonly<PasswordStrengthHintProps>) {
  const { t } = useTranslation();
  const view = passwordStrength(password);

  // Nothing typed yet: an empty field is not "weak", it is unanswered.
  if (!password) return null;

  return (
    <UbStack direction="row" align="center" gap={3} className={className}>
      <MLProgress
        value={view.percent}
        tone={TONE[view.strength]}
        ariaLabel={t('auth.password.strength.label')}
        className="flex-1"
      />
      <UbText as="span" variant="caption" tone="tertiary" className="shrink-0">
        {t(view.labelId)}
      </UbText>
    </UbStack>
  );
}

PasswordStrengthHintBase.displayName = 'PasswordStrengthHint';
export const PasswordStrengthHint = memo(PasswordStrengthHintBase);
