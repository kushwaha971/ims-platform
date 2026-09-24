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
}

export function ExpensePartyField({
  field,
  partyName,
  onPick,
  t,
}: Readonly<ExpensePartyFieldProps>): React.JSX.Element {
  const { query, setQuery, results, status, isEmpty, canSearch, clear } = usePartySearch();

  if (field.value) {
    return (
      <UbStack
        direction="row"
        align="center"
        justify="between"
        className="border-border-default h-10 rounded-control border px-3"
      >
        <UbText variant="body" className="truncate">
          {partyName}
        </UbText>
        <UbButton
          variant="ghost"
          size="sm"
          iconOnly
          icon={<X className="h-4 w-4" aria-hidden />}
          aria-label={t('expenses.paidTo.clear', { name: partyName })}
          onClick={() => {
            onPick('', '');
            clear();
          }}
        >
          {t('expenses.paidTo.clear', { name: partyName })}
        </UbButton>
      </UbStack>
    );
  }

  if (!canSearch) {
    return (
      <UbText variant="caption" tone="tertiary">
        {t('expenses.paidTo.noAccess')}
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
      />
      {results.length > 0 && (
        <UbStack
          as="ul"
          gap={0}
          aria-label={t('expenses.paidTo.results')}
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
          {t('expenses.paidTo.noMatch')}
        </UbText>
      )}
    </UbStack>
  );
}
