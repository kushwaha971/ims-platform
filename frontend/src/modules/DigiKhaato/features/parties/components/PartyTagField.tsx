'use client';

import { memo, useCallback, useMemo } from 'react';

import { UbTokenInput, isUbTagColor, type UbTokenInputOption } from 'src/design-system';
import type { TranslateFn } from 'src/hooks/useTranslation';

import { MAX_TAGS_PER_PARTY } from '../constants/partyTags';

import type { PartyTagWithCount } from '../types/party.types';

/**
 * PTY-05 FR-5 — the Tags control on the party form.
 *
 * It adapts between the form's shape and the picker's: the form holds NAMES,
 * because that is what the server takes and what survives a tag being created
 * inside the same transaction, while the picker works in options with ids and
 * colours so a chip can be drawn. The translation is this component's whole
 * job, and it is worth a component because getting it wrong is silent — a
 * picker keyed by id would lose a tag the merchant typed but has not saved.
 *
 * ── A name the merchant typed that does not exist yet is still a name ───────
 * `onCreate` returns an option whose `value` IS the name. It is never sent
 * anywhere as an id: the form submits `tags: string[]`, and this component
 * looks a name up in the loaded tag list to decide whether it has a colour to
 * draw. So an unsaved "Route 2" renders as a neutral chip and becomes a
 * coloured one the moment the server has a row for it — which is the honest
 * rendering, because until then nobody has chosen a colour.
 */
export interface PartyTagFieldProps {
  readonly t: TranslateFn;
  readonly value: readonly string[];
  readonly onChange: (next: string[]) => void;
  /** Everything in the tenant, most-used first (FR-5's picker order). */
  readonly tags: readonly PartyTagWithCount[];
  readonly disabled?: boolean;
  readonly invalid?: boolean;
  readonly id?: string;
  /**
   * How many tags this control accepts. Defaults to BR-3's per-party ceiling.
   *
   * The bulk dialog passes its own, and that is why the prop exists: it reused
   * this field and got the party ceiling, so the picker happily took six tags
   * and the server refused the request at five — with a caption underneath
   * saying five, a "you can have 10" message at the ceiling, and a generic
   * "could not apply those tags" afterwards with nothing pointing at the sixth
   * chip.
   */
  readonly max?: number;
  /** What to say at the ceiling, when "a party can carry N tags" is not it. */
  readonly fullLabel?: (max: number) => string;
  readonly 'aria-describedby'?: string;
}

const fold = (name: string) => name.trim().toLocaleLowerCase();

function PartyTagFieldBase({
  t,
  value,
  onChange,
  tags,
  disabled,
  invalid,
  id,
  max = MAX_TAGS_PER_PARTY,
  fullLabel,
  ...aria
}: Readonly<PartyTagFieldProps>) {
  const byName = useMemo(() => {
    const map = new Map<string, PartyTagWithCount>();
    /* Folded, because the server's uniqueness is case-insensitive: a party
       saved with "camp area" has to draw the chip the merchant created as
       "Camp Area", in the casing they chose. */
    for (const tag of tags) map.set(fold(tag.name), tag);
    return map;
  }, [tags]);

  const toOption = useCallback(
    (name: string): UbTokenInputOption => {
      const known = byName.get(fold(name));
      return {
        /* The NAME is the identity, even for a tag that exists. Keying on the
           id would make an unsaved tag and a saved one two different kinds of
           thing in one list, and the form would have to hold both. */
        value: name,
        label: known?.name ?? name,
        color: isUbTagColor(known?.color) ? known.color : null,
      };
    },
    [byName]
  );

  const selected = useMemo(() => value.map(toOption), [value, toOption]);

  const options = useMemo<readonly UbTokenInputOption[]>(
    () =>
      tags.map((tag) => ({
        value: tag.name,
        label: tag.name,
        color: isUbTagColor(tag.color) ? tag.color : null,
        /* The count is why the picker is ordered by usage: a merchant reaching
           for a tag is overwhelmingly reaching for one they already use, and
           seeing "34" beside it confirms they have the right one of two similar
           names. Absent at zero rather than shown as "0 parties" — a tag
           created a moment ago in this very picker has not been used yet, and
           labelling that as a fact reads as a warning. */
        hint:
          tag.partyCount > 0
            ? tag.partyCount === 1
              ? t('parties.tags.field.usageOne')
              : t('parties.tags.field.usage', { count: tag.partyCount })
            : undefined,
      })),
    [tags, t]
  );

  const handleChange = useCallback(
    (next: readonly UbTokenInputOption[]) => {
      onChange(next.map((option) => option.value));
    },
    [onChange]
  );

  const handleCreate = useCallback(
    (name: string): UbTokenInputOption | null => {
      const clean = name.trim();
      /* The two characters the server refuses (EC-14), refused here too rather
         than accepted and rejected on save. The list filter serialises tags as
         `?tag=Camp Area,Route 2`, so "Camp, East" would round-trip as two tags
         that do not exist — and the merchant would see a filter matching
         nothing with no clue why. */
      if (!clean || clean.includes(',') || clean.includes(';')) return null;
      return { value: clean, label: clean, color: null };
    },
    []
  );

  return (
    <UbTokenInput
      id={id}
      value={selected}
      onChange={handleChange}
      options={options}
      onCreate={handleCreate}
      max={max}
      disabled={disabled}
      invalid={invalid}
      placeholder={t('parties.tags.field.placeholder')}
      searchPlaceholder={t('parties.tags.field.search')}
      emptyLabel={t('parties.tags.field.empty')}
      createLabel={(name) => t('parties.tags.field.create', { name })}
      maxReachedLabel={(reached) =>
        fullLabel ? fullLabel(reached) : t('parties.tags.field.full', { max: reached })
      }
      removeLabel={(name) => t('parties.tags.remove', { name })}
      {...aria}
    />
  );
}

PartyTagFieldBase.displayName = 'PartyTagField';
export const PartyTagField = memo(PartyTagFieldBase);
