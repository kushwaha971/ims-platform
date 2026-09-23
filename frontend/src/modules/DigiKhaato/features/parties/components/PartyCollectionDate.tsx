'use client';

import { memo, useCallback, useState } from 'react';

import { UbBox, UbButton, UbDateInput, UbStack, UbText, isoToday } from 'src/design-system';
import type { TranslateFn } from 'src/hooks/useTranslation';

/**
 * PTY-03 FR-12 — "Promised to pay on —", the khata page's one editable control.
 *
 * ── It is a promise, not a due date (BR-8) ─────────────────────────────────
 * Which is why a date in the FUTURE is the normal case and a date in the past
 * is still allowed: a merchant recording "he said Friday" on the following
 * Monday is recording what happened. The bound is a year either side, and the
 * server enforces it — this control offers quick choices and gets out of the
 * way.
 *
 * Setting it changes nothing else. It does not move any document's `due_on`
 * and does not create a reminder; FR-12's "Also remind me" belongs to LED-06,
 * which has no models yet, so the checkbox is not drawn rather than drawn and
 * inert.
 *
 * ── Saving on change, not on a Save button ─────────────────────────────────
 * One field with a native picker, on a page with no other form: a Save button
 * would be a second tap for a value the picker has already committed, and the
 * most common outcome of that pattern is a merchant who sets the date, walks
 * away, and finds it was never saved. The control shows its own busy state and
 * a failure reaches the global snackbar.
 */
export interface PartyCollectionDateProps {
  readonly t: TranslateFn;
  /** ISO `YYYY-MM-DD`, or null when no promise has been made. */
  readonly value: string | null;
  readonly onChange: (value: string | null) => void;
  readonly saving: boolean;
  /** Archived parties are read-only (FR-14); so is a role without write. */
  readonly disabled: boolean;
  /** Formatted by the caller, for the read-only rendering. */
  readonly formatted: string | null;
}

function PartyCollectionDateBase({
  t,
  value,
  onChange,
  saving,
  disabled,
  formatted,
}: Readonly<PartyCollectionDateProps>) {
  /* Local, so the picker responds to the tap immediately rather than after the
     round trip. `value` is the truth and wins whenever it changes underneath —
     a failed save rolls the control back to what the server still holds.
     
     Adjusted DURING RENDER rather than in an effect. `useEffect(() =>
     setDraft(value), [value])` is the obvious spelling and is the one React
     names in "You Might Not Need an Effect": it renders the stale value once,
     commits it, then re-renders — a visible flash of the old date on every
     save, and a lint error (`react-hooks/set-state-in-effect`) that the data
     grid's column-visibility hook already hit once. Comparing against the last
     `value` we saw lets React discard the in-progress render instead. */
  const [draft, setDraft] = useState(value);
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(value);
  }

  const handleChange = useCallback(
    (next: string | null) => {
      setDraft(next);
      if (next !== value) onChange(next);
    },
    [onChange, value]
  );

  const clear = useCallback(() => handleChange(null), [handleChange]);

  if (disabled) {
    return (
      <UbStack gap={0}>
        <UbText variant="caption" tone="tertiary">
          {t('parties.detail.collection.label')}
        </UbText>
        <UbText variant="body-sm" tone={formatted ? 'primary' : 'tertiary'}>
          {formatted ?? t('parties.detail.collection.none')}
        </UbText>
      </UbStack>
    );
  }

  return (
    <UbStack gap={2}>
      <UbText variant="caption" tone="tertiary">
        {t('parties.detail.collection.label')}
      </UbText>
      <UbDateInput
        value={draft}
        onChange={handleChange}
        aria-label={t('parties.detail.collection.label')}
        placeholder={t('parties.form.collectionDate.placeholder')}
        disabled={saving}
        quickChoicesLabel={t('parties.detail.collection.quick')}
        quickChoices={[{ label: t('parties.detail.collection.today'), date: isoToday() }]}
      />
      <UbBox className="flex items-center gap-2">
        {/* Clearing is its own control. A date input's native "clear" is a tiny
            glyph that not every browser draws, and "no promise" is a state a
            merchant needs to be able to get back to after the customer pays. */}
        {draft && (
          <UbButton variant="ghost" size="sm" onClick={clear} disabled={saving}>
            {t('parties.detail.collection.clear')}
          </UbButton>
        )}
        {saving && (
          <UbText variant="caption" tone="tertiary" role="status">
            {t('common.status.saving')}
          </UbText>
        )}
      </UbBox>
    </UbStack>
  );
}

PartyCollectionDateBase.displayName = 'PartyCollectionDate';
export const PartyCollectionDate = memo(PartyCollectionDateBase);
