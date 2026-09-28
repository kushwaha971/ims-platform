'use client';

import { useId, useState } from 'react';

import { X } from 'lucide-react';

import {
  UbBox,
  UbButton,
  UbListItemText,
  UbStack,
  UbText,
  UbTextInput,
  type UbFieldRenderProps,
} from 'src/design-system';
import type { TranslateFn } from 'src/hooks/useTranslation';
import { cn } from 'src/utils/cn';

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
  const listId = useId();
  const [active, setActive] = useState(0);

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

  const pick = (index: number) => {
    const party = results[index];
    if (!party) return;
    onPick(party.id, party.name);
    clear();
  };

  /* QA P-D6 — the matches were a list of plain buttons: no `combobox` on the
     input, no `listbox`/`option` on the matches, and no arrow keys. It is the
     same combobox pattern as the party quick search now. */
  const handleKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!results.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => (index + 1) % results.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => (index - 1 + results.length) % results.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      pick(active);
    }
  };

  const open = results.length > 0;
  return (
    <UbStack gap={1}>
      <UbTextInput
        id={field.id}
        name={field.name}
        value={query}
        onChange={(next) => {
          setQuery(next);
          setActive(0);
        }}
        onBlur={field.onBlur}
        onKeyDown={handleKey}
        placeholder={field.placeholder}
        invalid={field.invalid}
        aria-invalid={field['aria-invalid']}
        aria-describedby={field['aria-describedby']}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && results[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        disabled={disabled}
      />
      {open && (
        <UbBox
          as="ul"
          id={listId}
          role="listbox"
          aria-label={t('purchases.supplier.results')}
          className="border-border-default rounded-control border py-1"
        >
          {results.map((party, index) => (
            <UbBox
              as="li"
              key={party.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event: React.MouseEvent) => event.preventDefault()}
              onClick={() => pick(index)}
              onMouseEnter={() => setActive(index)}
              className={cn(
                'w-full cursor-pointer px-3 py-2 text-left',
                index === active && 'bg-surface-hover'
              )}
            >
              <UbListItemText primary={party.name} secondary={party.mobile ?? undefined} />
            </UbBox>
          ))}
        </UbBox>
      )}
      {isEmpty && status === 'succeeded' && (
        <UbText variant="caption" tone="tertiary">
          {t('purchases.supplier.noMatch')}
        </UbText>
      )}
    </UbStack>
  );
}
