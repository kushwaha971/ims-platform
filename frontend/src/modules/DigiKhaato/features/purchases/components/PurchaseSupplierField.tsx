'use client';

import { X } from 'lucide-react';

import {
  UbButton,
  UbListItemText,
  UbPressable,
  UbStack,
  UbText,
  UbTextInput,
  type UbFieldRenderProps,
} from 'src/design-system';
import type { TranslateFn } from 'src/hooks/useTranslation';

import { usePartySearch } from '../../parties/hooks/usePartySearch';

/**
 * PUR-01 FR-2 / §7 — the supplier. The source is `usePartySearch({ type:
 * 'supplier' })` — THE party search every picker shares (docs/DESIGN-SYSTEM.md
 * §4), narrowed to suppliers, so a customer-only party is not offered and
 * lint refuses a second source. Once chosen the supplier is a row with a clear
 * button, so what will be saved is never ambiguous.
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
  const { query, setQuery, results, status, isEmpty, canSearch, clear } = usePartySearch({
    type: 'supplier',
  });

  if (field.value) {
    return (
      <UbStack
        direction="row"
        align="center"
        justify="between"
        className="border-border-default h-10 rounded-control border px-3"
      >
        <UbText variant="body" className="truncate" data-testid="purchase-supplier">
          {supplierName}
        </UbText>
        {!disabled && (
          <UbButton
            variant="ghost"
            size="sm"
            iconOnly
            icon={<X className="h-4 w-4" aria-hidden />}
            aria-label={t('purchases.supplier.clear', { name: supplierName })}
            onClick={() => {
              onPick('', '');
              clear();
            }}
          >
            {t('purchases.supplier.clear', { name: supplierName })}
          </UbButton>
        )}
      </UbStack>
    );
  }

  if (!canSearch) {
    return (
      <UbText variant="caption" tone="tertiary">
        {t('purchases.supplier.noAccess')}
      </UbText>
    );
  }

  return (
    <UbStack gap={1}>
      <UbTextInput
        id={field.id}
        name={field.name}
        value={query}
        onChange={setQuery}
        onBlur={field.onBlur}
        placeholder={field.placeholder}
        invalid={field.invalid}
        aria-invalid={field['aria-invalid']}
        aria-describedby={field['aria-describedby']}
        autoComplete="off"
        disabled={disabled}
      />
      {results.length > 0 && (
        <UbStack
          as="ul"
          gap={0}
          aria-label={t('purchases.supplier.results')}
          className="border-border-default rounded-control border"
        >
          {results.map((party) => (
            <UbStack as="li" key={party.id} gap={0}>
              <UbPressable
                className="w-full px-3 py-2 text-left"
                onClick={() => {
                  onPick(party.id, party.name);
                  clear();
                }}
              >
                <UbListItemText primary={party.name} secondary={party.mobile ?? undefined} />
              </UbPressable>
            </UbStack>
          ))}
        </UbStack>
      )}
      {isEmpty && status === 'succeeded' && (
        <UbText variant="caption" tone="tertiary">
          {t('purchases.supplier.noMatch')}
        </UbText>
      )}
    </UbStack>
  );
}
