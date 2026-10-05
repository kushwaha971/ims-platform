'use client';

import { useId, useMemo, useRef, useState } from 'react';

import { X } from 'lucide-react';

import {
  UbBox,
  UbButton,
  UbListItemText,
  UbLoadMore,
  UbStack,
  UbText,
  UbTextInput,
  type UbFieldRenderProps,
} from 'src/design-system';
import type { TranslateFn } from 'src/hooks/useTranslation';
import { cn } from 'src/utils/cn';

import { usePartySearch } from '../hooks/usePartySearch';

/**
 * THE party picker field — a bill's supplier, an expense's or payment's party,
 * a sale's customer, a related party. There were three copies of it, each a
 * text box whose matches appeared only after two typed characters.
 *
 * Owner, 5 Oct 2026: on focus the list opens at once (the people traded with
 * most recently), it pages as it scrolls, and typing narrows it. It is one
 * combobox in the ARIA sense — `listbox`/`option`, ↑/↓ move (↓ on the last row
 * fetches the next page), Enter picks, Escape closes — and once a party is
 * chosen it is a row with a clear button, so what will be saved is never
 * ambiguous.
 *
 * The list sits in the flow of the form rather than floating: these fields
 * live in drawers and dialogs, which clip anything positioned outside them.
 * Its height is capped and it scrolls inside itself.
 */
export interface PartyPickerLabels {
  readonly clear: (name: string) => string;
  readonly noAccess: string;
  readonly results: string;
  readonly noMatch: string;
}

export interface PartyPickerFieldProps {
  readonly field: UbFieldRenderProps;
  readonly pickedName: string;
  readonly onPick: (id: string, name: string) => void;
  readonly labels: PartyPickerLabels;
  readonly t: TranslateFn;
  /** `supplier` for a purchase bill, `customer` for a sale. */
  readonly type?: 'customer' | 'supplier';
  /** A party that may not be picked here (the khata a relation is made from). */
  readonly excludeId?: string;
  readonly disabled?: boolean;
  readonly testId?: string;
}

export function PartyPickerField({
  field,
  pickedName,
  onPick,
  labels,
  t,
  type,
  excludeId,
  disabled = false,
  testId,
}: Readonly<PartyPickerFieldProps>): React.JSX.Element {
  const search = usePartySearch(type ? { type } : {});
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const closeTimer = useRef<number | null>(null);

  const shown = useMemo(
    () => (excludeId ? search.results.filter((party) => party.id !== excludeId) : search.results),
    [search.results, excludeId]
  );

  if (field.value) {
    return (
      <UbStack
        direction="row"
        align="center"
        justify="between"
        className="border-border-default h-10 rounded-control border px-3"
      >
        <UbText variant="body" className="truncate" data-testid={testId}>
          {pickedName}
        </UbText>
        {!disabled && (
          <UbButton
            variant="ghost"
            size="sm"
            iconOnly
            icon={<X className="h-4 w-4" aria-hidden />}
            aria-label={labels.clear(pickedName)}
            onClick={() => {
              onPick('', '');
              search.clear();
            }}
          >
            {labels.clear(pickedName)}
          </UbButton>
        )}
      </UbStack>
    );
  }

  if (!search.canSearch) {
    return (
      <UbText variant="caption" tone="tertiary">
        {labels.noAccess}
      </UbText>
    );
  }

  const pick = (index: number) => {
    const party = shown[index];
    if (!party) return;
    onPick(party.id, party.name);
    setOpen(false);
    search.clear();
  };

  const handleKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!shown.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      if (active === shown.length - 1 && search.hasMore) {
        search.loadMore();
        return;
      }
      setActive((index) => (index + 1) % shown.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => (index - 1 + shown.length) % shown.length);
    } else if (event.key === 'Enter' && open) {
      event.preventDefault();
      pick(active);
    }
  };

  const listOpen = open && search.active;
  const noMatch = search.status === 'succeeded' && shown.length === 0;

  return (
    <UbStack gap={1}>
      <UbTextInput
        id={field.id}
        name={field.name}
        value={search.query}
        onChange={(next) => {
          search.setQuery(next);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => {
          if (closeTimer.current) window.clearTimeout(closeTimer.current);
          search.activate();
          setOpen(true);
        }}
        onBlur={() => {
          field.onBlur?.();
          // Long enough for a tap on a row to land first.
          closeTimer.current = window.setTimeout(() => setOpen(false), 150);
        }}
        onKeyDown={handleKey}
        placeholder={field.placeholder}
        invalid={field.invalid}
        aria-invalid={field['aria-invalid']}
        aria-describedby={field['aria-describedby']}
        role="combobox"
        aria-expanded={listOpen && shown.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={listOpen && shown[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        disabled={disabled}
      />
      {listOpen && shown.length > 0 && (
        <UbBox
          as="ul"
          id={listId}
          role="listbox"
          aria-label={labels.results}
          className="border-border-default max-h-64 overflow-y-auto overscroll-contain rounded-control border py-1"
        >
          {shown.map((party, index) => (
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
          {search.hasMore && (
            <UbLoadMore
              as="li"
              onLoadMore={search.loadMore}
              loading={search.status === 'loadingMore'}
              loadingLabel={t('common.search.loadingMore')}
              moreLabel={t('common.search.showMore')}
            />
          )}
        </UbBox>
      )}
      {listOpen && search.status === 'loading' && shown.length === 0 && (
        <UbText variant="caption" tone="tertiary">
          {t('common.search.loading')}
        </UbText>
      )}
      {listOpen && noMatch && (
        <UbText variant="caption" tone="tertiary">
          {labels.noMatch}
        </UbText>
      )}
    </UbStack>
  );
}
