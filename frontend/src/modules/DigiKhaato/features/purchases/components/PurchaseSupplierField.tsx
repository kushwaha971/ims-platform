'use client';

import { useMemo } from 'react';

import type { UbFieldRenderProps } from 'src/design-system';
import type { TranslateFn } from 'src/hooks/useTranslation';

import { PartyPickerField } from '../../parties/components/PartyPickerField';

/**
 * PUR-01 FR-2 / §7 — the supplier. The source is `usePartySearch({ type:
 * 'supplier' })` — THE party search every picker shares (docs/DESIGN-SYSTEM.md
 * §4), narrowed to suppliers, so a customer-only party is not offered and
 * lint refuses a second source. Once chosen the supplier is a row with a clear
 * button, so what will be saved is never ambiguous.
 *
 * The field itself is `PartyPickerField`: it lists suppliers on focus, pages
 * on scroll and narrows as you type.
 *
 * Not here yet: "Create supplier" inline (the PTY-01 quick form, FR-2's "Mark
 * as supplier too"). A supplier is added from Parties today.
 */
export interface PurchaseSupplierFieldProps {
  readonly field: UbFieldRenderProps;
  readonly supplierName: string;
  readonly onPick: (id: string, name: string) => void;
  readonly disabled: boolean;
  readonly t: TranslateFn;
}

export function PurchaseSupplierField({
  field,
  supplierName,
  onPick,
  disabled,
  t,
}: Readonly<PurchaseSupplierFieldProps>): React.JSX.Element {
  const labels = useMemo(
    () => ({
      clear: (name: string) => t('purchases.supplier.clear', { name }),
      noAccess: t('purchases.supplier.noAccess'),
      results: t('purchases.supplier.results'),
      noMatch: t('purchases.supplier.noMatch'),
    }),
    [t]
  );
  return (
    <PartyPickerField
      field={field}
      pickedName={supplierName}
      onPick={onPick}
      labels={labels}
      t={t}
      type="supplier"
      disabled={disabled}
      testId="purchase-supplier"
    />
  );
}
