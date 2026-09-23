'use client';

import { useMemo } from 'react';

import { UbChoiceChips, UbSelect, UbStack } from 'src/design-system';
import type { TranslateFn } from 'src/hooks/useTranslation';
import {
  FEATURED_UPI_APPS,
  PAYMENT_MODES,
  UPI_APPS,
  type PaymentMode,
  type UpiApp,
} from 'src/types/domain.types';

/**
 * "Received via" — how the money arrived, as one row of chips.
 *
 * ── Two columns, one question ──────────────────────────────────────────────
 * The server keeps `payment_mode` and `upi_app` apart, because a cashbook
 * totals by mode and "UPI" must stay one line in it. The merchant does not
 * think in two fields: the customer said "PhonePe kiya", and making them pick
 * UPI and then PhonePe is two decisions for one fact. So the chips are
 * FLATTENED — Cash · PhonePe · Google Pay · Paytm · Other UPI · Bank · Cheque ·
 * Card · Other — and each chip writes both fields. "Other UPI" opens a select
 * of the remaining apps, optional, because "UPI, no idea which" is true often.
 *
 * The three featured apps carry most of India's UPI volume (NPCI's monthly
 * app-wise figures have had PhonePe, Google Pay and Paytm at roughly nine in
 * ten transactions for years); a chip for each of eleven apps would bury Cash.
 */
type Choice = Exclude<PaymentMode, 'upi'> | `upi:${(typeof FEATURED_UPI_APPS)[number]}` | 'upi';

const OTHER_APPS = UPI_APPS.filter(
  (app) => !(FEATURED_UPI_APPS as readonly string[]).includes(app)
) as readonly UpiApp[];

const isFeatured = (app: UpiApp | ''): app is (typeof FEATURED_UPI_APPS)[number] =>
  (FEATURED_UPI_APPS as readonly string[]).includes(app);

/** The chip a stored pair is shown as. */
export const choiceFor = (mode: PaymentMode | '', app: UpiApp | ''): Choice | '' => {
  if (!mode) return '';
  if (mode !== 'upi') return mode;
  return isFeatured(app) ? `upi:${app}` : 'upi';
};

/** The pair a chip writes. "Other UPI" keeps a non-featured app already chosen. */
export const pairFor = (
  choice: Choice,
  currentApp: UpiApp | ''
): { mode: PaymentMode; app: UpiApp | '' } => {
  if (choice.startsWith('upi:')) return { mode: 'upi', app: choice.slice(4) as UpiApp };
  if (choice === 'upi') return { mode: 'upi', app: isFeatured(currentApp) ? '' : currentApp };
  return { mode: choice as PaymentMode, app: '' };
};

export interface PaymentMethodFieldProps {
  readonly id: string;
  readonly mode: PaymentMode | '';
  readonly app: UpiApp | '';
  readonly onChange: (mode: PaymentMode, app: UpiApp | '') => void;
  readonly onBlur?: () => void;
  readonly t: TranslateFn;
  readonly invalid?: boolean;
  readonly describedBy?: string;
  readonly disabled?: boolean;
}

export function PaymentMethodField({
  id,
  mode,
  app,
  onChange,
  onBlur,
  t,
  invalid,
  describedBy,
  disabled,
}: Readonly<PaymentMethodFieldProps>): React.JSX.Element {
  const options = useMemo(
    () =>
      PAYMENT_MODES.flatMap((m) =>
        m === 'upi'
          ? [
              ...FEATURED_UPI_APPS.map((a) => ({
                value: `upi:${a}` as Choice,
                label: t(`ledger.upiApp.${a}`),
              })),
              { value: 'upi' as Choice, label: t('ledger.mode.upiOther') },
            ]
          : [{ value: m as Choice, label: t(`ledger.mode.${m}`) }]
      ),
    [t]
  );
  const otherAppOptions = useMemo(
    () => OTHER_APPS.map((a) => ({ value: a, label: t(`ledger.upiApp.${a}`) })),
    [t]
  );
  const selected = choiceFor(mode, app);

  return (
    <UbStack gap={2}>
      <UbChoiceChips<Choice>
        id={id}
        ariaLabel={t('ledger.entry.mode')}
        value={selected}
        options={options}
        invalid={invalid}
        describedBy={describedBy}
        disabled={disabled}
        onBlur={onBlur}
        onChange={(choice) => {
          const next = pairFor(choice, app);
          onChange(next.mode, next.app);
        }}
      />
      {selected === 'upi' && (
        <UbSelect
          id={`${id}-upi-app`}
          name="upiApp"
          aria-label={t('ledger.entry.upiApp')}
          placeholder={t('ledger.entry.upiApp.placeholder')}
          value={isFeatured(app) ? '' : app}
          options={otherAppOptions}
          disabled={disabled}
          onChange={(value: string) => onChange('upi', (value || '') as UpiApp | '')}
        />
      )}
    </UbStack>
  );
}
