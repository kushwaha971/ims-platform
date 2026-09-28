'use client';

import { useCallback, useMemo } from 'react';

import { UbChoiceChips, UbDialog } from 'src/design-system';
import type { TranslateFn } from 'src/hooks/useTranslation';

import { PHONE_SORT_CHOICES, type PhoneSortOrdering } from '../view-model/partyListSort';

// Loaded with dynamic(), so its own words come with its own chunk rather than
// with the screen that opens it (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/parties';

/**
 * `PartyListSortSheet`'s body — the sheet and its one single choice — in its
 * own module so it loads when the sort button is pressed.
 *
 * `UbChoiceChips` is on no other part of `/parties`, and the list is a screen
 * almost every visit opens to READ: carried statically, the sheet cost the
 * route ~0.8 KB gz for a control a laptop never shows. The rule is the one the
 * party drawer and the bulk-tag dialog follow — a sheet belongs in the chunk
 * that OPENS it.
 */
export interface PartyListSortDialogProps {
  readonly t: TranslateFn;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly ordering: string;
  readonly onOrderingChange: (ordering: string) => void;
}

export function PartyListSortDialog({
  t,
  open,
  onOpenChange,
  ordering,
  onOrderingChange,
}: Readonly<PartyListSortDialogProps>): React.JSX.Element {
  const options = useMemo(
    () =>
      PHONE_SORT_CHOICES.map((choice) => ({ value: choice.ordering, label: t(choice.labelKey) })),
    [t]
  );
  const current = PHONE_SORT_CHOICES.some((choice) => choice.ordering === ordering)
    ? (ordering as PhoneSortOrdering)
    : '';

  const choose = useCallback(
    (next: PhoneSortOrdering) => {
      if (next !== ordering) onOrderingChange(next);
      onOpenChange(false);
    },
    [ordering, onOrderingChange, onOpenChange]
  );

  return (
    <UbDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('parties.list.sort.title')}
      closeLabel={t('common.action.close')}
    >
      <UbChoiceChips
        value={current}
        onChange={choose}
        options={options}
        ariaLabel={t('parties.list.sort.title')}
      />
    </UbDialog>
  );
}
