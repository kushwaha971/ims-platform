'use client';

import { useMemo } from 'react';

import type { UbFieldRenderProps } from 'src/design-system';
import type { TranslateFn } from 'src/hooks/useTranslation';

import { PartyPickerField } from '../../parties/components/PartyPickerField';

/**
 * EXP-01 FR-6 — "Paid to": any party, customer or supplier, optional when the
 * expense is paid and required when it is owed.
 *
 * The source is `usePartySearch` — the one debounced, abortable party search
 * every picker in the product shares (docs/DESIGN-SYSTEM.md §4), so a party
 * findable on the list is findable here, and lint refuses a third source.
 * Once chosen the party is shown as a row with a clear button rather than as
 * text in the box, so what will be saved is never ambiguous.
 */
export interface ExpensePartyFieldProps {
  readonly field: UbFieldRenderProps;
  readonly partyName: string;
  readonly onPick: (id: string, name: string) => void;
  readonly t: TranslateFn;
  /** Restrict a reused picker to the transaction’s party role. Expenses keep both. */
  readonly type?: 'customer' | 'supplier';
  readonly disabled?: boolean;
}

export function ExpensePartyField({
  field,
  partyName,
  onPick,
  t,
  type,
  disabled,
}: Readonly<ExpensePartyFieldProps>): React.JSX.Element {
  const labels = useMemo(
    () => ({
      clear: (name: string) => t('expenses.paidTo.clear', { name }),
      noAccess: t('expenses.paidTo.noAccess'),
      results: t('expenses.paidTo.results'),
      noMatch: t('expenses.paidTo.noMatch'),
    }),
    [t]
  );
  return (
    <PartyPickerField
      field={field}
      pickedName={partyName}
      onPick={onPick}
      labels={labels}
      t={t}
      type={type}
      disabled={disabled}
    />
  );
}
