'use client';

import { memo, useCallback, useMemo } from 'react';

import { UbTokenInput, isUbTagColor, type UbTokenInputOption } from 'src/design-system';
import type { TranslateFn } from 'src/hooks/useTranslation';

import type { PartyTagWithCount } from '../types/party.types';

// Loaded with dynamic(), so its own words come with its own chunk rather than
// with the screen that opens it (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/parties';

/**
 * PTY-05 FR-6 — the tag filter on the party list.
 *
 * ── It filters by NAME, and the URL is the reason ───────────────────────────
 * `?tag=Camp Area,Route 2` is a parameter a person can read, edit and send to
 * somebody. Ids would make it `?tag=8f3c…,b21a…`, which is the same filter and
 * unreadable, and a merchant who pastes a link into WhatsApp so a salesman can
 * see the same list would be pasting something neither of them can check.
 *
 * That choice is what makes the comma ban at tag creation load-bearing rather
 * than fussy (EC-14): a tag called "Camp, East" would round-trip as two tags
 * that do not exist, and the list would silently match nothing.
 *
 * ── An unknown name narrows the list; it does not break the screen ──────────
 * A name in the URL that no longer exists — somebody deleted the tag, or
 * renamed it — matches nothing on the server and is rendered here as a plain
 * chip carrying the name from the URL. The merchant sees WHY the list is empty
 * and can take the chip off. The alternative, dropping it silently, would show
 * an unfiltered list under a filter the URL still claims.
 *
 * ── No create-inline ────────────────────────────────────────────────────────
 * `onCreate` is deliberately absent. Creating a tag from a filter would make a
 * tag that is on nobody, to filter for nobody — and would put a write on a
 * control a read-only accountant is entitled to use.
 */
export interface PartyTagFilterProps {
  readonly t: TranslateFn;
  /** The raw filter value: a comma-separated list of names, or ''. */
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly tags: readonly PartyTagWithCount[];
  readonly className?: string;
}

/** `"Camp Area, Route 2"` → `['Camp Area', 'Route 2']`, blanks dropped. */
export const parseTagFilter = (value: string): readonly string[] =>
  value
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0);

const fold = (name: string) => name.trim().toLocaleLowerCase();

function PartyTagFilterBase({
  t,
  value,
  onChange,
  tags,
  className,
}: Readonly<PartyTagFilterProps>) {
  const byName = useMemo(() => {
    const map = new Map<string, PartyTagWithCount>();
    for (const tag of tags) map.set(fold(tag.name), tag);
    return map;
  }, [tags]);

  const selected = useMemo<readonly UbTokenInputOption[]>(
    () =>
      parseTagFilter(value).map((name) => {
        const known = byName.get(fold(name));
        return {
          value: name,
          /* The KNOWN casing when we have it, so a filter carried in a URL as
             "camp area" draws the chip the merchant created as "Camp Area" —
             the server matches case-insensitively, and a chip that disagrees
             with the list it produced reads as a bug. */
          label: known?.name ?? name,
          color: isUbTagColor(known?.color) ? known.color : null,
        };
      }),
    [value, byName]
  );

  const options = useMemo<readonly UbTokenInputOption[]>(
    () =>
      tags.map((tag) => ({
        value: tag.name,
        label: tag.name,
        color: isUbTagColor(tag.color) ? tag.color : null,
      })),
    [tags]
  );

  const handleChange = useCallback(
    (next: readonly UbTokenInputOption[]) => {
      onChange(next.map((option) => option.value).join(','));
    },
    [onChange]
  );

  return (
    <UbTokenInput
      value={selected}
      onChange={handleChange}
      options={options}
      placeholder={t('parties.tags.filter.placeholder')}
      searchPlaceholder={t('parties.tags.filter.search')}
      emptyLabel={t('parties.tags.filter.empty')}
      removeLabel={(name) => t('parties.tags.remove', { name })}
      aria-label={t('parties.tags.filter.label')}
      className={className}
    />
  );
}

PartyTagFilterBase.displayName = 'PartyTagFilter';
export const PartyTagFilter = memo(PartyTagFilterBase);
