'use client';

import { memo, useCallback, useId, useState } from 'react';

import { useRouter } from 'next/navigation';

import { UbAmount, UbBox, UbSearchInput, UbText } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { partyPath } from 'src/routes';
import { cn } from 'src/utils/cn';

import { usePartySearch } from '../hooks/usePartySearch';
import { balanceView } from '../view-model/partyDisplay';

/**
 * The app bar's "find a khata" — type a name, code or mobile, pick the party,
 * land on their page. The first consumer of `usePartySearch`.
 *
 * A combobox in the ARIA sense: the input owns `aria-activedescendant`, the
 * list is a `listbox` of `option`s, arrows move, Enter opens, Escape closes.
 * Nothing about it is clever — it is the one keyboard contract a merchant who
 * types fast already knows from every search box they have used.
 */
export interface PartyQuickSearchProps {
  readonly className?: string;
  /**
   * UAT D2 — the phone's search sheet. The sheet opens BECAUSE the merchant
   * asked to search, so the field takes focus (and brings the keyboard up) at
   * once; the desktop bar must not steal focus on every page load.
   */
  readonly autoFocus?: boolean;
  /**
   * UAT D2 — results in the flow of the page instead of a floating popover. A
   * sheet is `overflow: hidden`, so an absolutely-positioned list inside one is
   * clipped at the sheet's edge: the matches were there and could not be seen.
   */
  readonly inline?: boolean;
  /** Called after a party is chosen — the sheet closes itself with it. */
  readonly onNavigate?: () => void;
}

function PartyQuickSearchBase({
  className,
  autoFocus = false,
  inline = false,
  onNavigate,
}: Readonly<PartyQuickSearchProps>) {
  const { t } = useTranslation();
  const router = useRouter();
  const search = usePartySearch();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const openParty = useCallback(
    (id: string) => {
      setOpen(false);
      search.clear();
      router.push(partyPath(id));
      onNavigate?.();
    },
    [router, search, onNavigate]
  );

  const handleKey = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (!search.results.length) return;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setOpen(true);
        setActive((index) => (index + 1) % search.results.length);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActive((index) => (index - 1 + search.results.length) % search.results.length);
      } else if (event.key === 'Enter') {
        const chosen = search.results[active];
        if (chosen) {
          event.preventDefault();
          openParty(chosen.id);
        }
      }
    },
    [search.results, active, openParty]
  );

  if (!search.canSearch) return null;

  const showList = open && (search.results.length > 0 || search.isEmpty);

  return (
    <UbBox className={cn('relative w-full', className)}>
      <UbSearchInput
        value={search.query}
        onChange={(next) => {
          search.setQuery(next);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        /* Inline, the list IS the sheet's content: a phone user who drops the
           keyboard to read the matches blurs the field, and closing on that
           would take the matches away at the moment they looked at them. */
        onBlur={inline ? undefined : () => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={handleKey}
        autoFocus={autoFocus}
        placeholder={t('parties.quickSearch.placeholder')}
        aria-label={t('parties.quickSearch.label')}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          showList && search.results[active] ? `${listId}-${active}` : undefined
        }
      />
      {showList && (
        <UbBox
          as="ul"
          id={listId}
          role="listbox"
          className={cn(
            'max-h-80 overflow-y-auto rounded-control border border-border-hairline bg-surface-card py-1',
            inline ? 'mt-2' : 'absolute left-0 right-0 top-11 z-40 shadow-2'
          )}
        >
          {search.isEmpty ? (
            <UbBox as="li" className="px-3 py-2">
              <UbText as="span" variant="inherit" className="ds-body-s-regular text-text-tertiary">
                {t('parties.quickSearch.empty', { query: search.query.trim() })}
              </UbText>
            </UbBox>
          ) : (
            search.results.map((party, index) => {
              const view = balanceView(party.balance);
              return (
                <UbBox
                  as="li"
                  key={party.id}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === active}
                  onMouseDown={(event: React.MouseEvent) => event.preventDefault()}
                  onClick={() => openParty(party.id)}
                  onMouseEnter={() => setActive(index)}
                  className={cn(
                    'flex cursor-pointer items-center justify-between gap-3 px-3 py-2',
                    index === active && 'bg-surface-hover'
                  )}
                >
                  <UbBox className="flex min-w-0 flex-col">
                    <UbText
                      as="span"
                      variant="inherit"
                      truncate
                      className="ds-body-base-medium text-text-primary"
                    >
                      {party.name}
                    </UbText>
                    {party.mobile && (
                      <UbText
                        as="span"
                        variant="inherit"
                        className="ds-num-s-regular text-text-tertiary"
                      >
                        {party.mobile}
                      </UbText>
                    )}
                  </UbBox>
                  <UbAmount
                    value={party.balance}
                    tone={view.tone}
                    sign={view.sign}
                    label={t(view.labelId)}
                    size="sm"
                  />
                </UbBox>
              );
            })
          )}
        </UbBox>
      )}
    </UbBox>
  );
}

PartyQuickSearchBase.displayName = 'PartyQuickSearch';
export const PartyQuickSearch = memo(PartyQuickSearchBase);
