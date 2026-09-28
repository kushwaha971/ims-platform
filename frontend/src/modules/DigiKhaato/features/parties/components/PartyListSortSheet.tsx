'use client';

import { memo, useCallback, useState } from 'react';

import dynamic from 'next/dynamic';

import { ArrowUpDown } from 'lucide-react';

import { UbButton } from 'src/design-system';
import type { TranslateFn } from 'src/hooks/useTranslation';

/* The sheet itself loads when the button is pressed, and is mounted only while
   open — see `PartyListSortDialog`. `ssr: false` because `open` is false in
   every server pass. */
const PartyListSortDialogLazy = /* @__PURE__ */ dynamic(
  () => import('./PartyListSortDialog').then((m) => m.PartyListSortDialog),
  { ssr: false }
);

/**
 * UAT D5 — sorting where there are no column headers.
 *
 * On a phone the party list is cards, and the table's sortable headers
 * (name, balance, last entry) are the only sort control the screen had — so a
 * merchant on the device they actually use could not ask "who owes me most".
 * This is an icon button in the grid's toolbar (owner rule: icon-only actions
 * on a phone) opening a bottom sheet with one single choice. The choice writes
 * the same server-side `ordering` the headers write, so the URL, the slice and
 * the desktop headers all agree, and it closes the sheet: one tap is the job.
 *
 * An ordering the sheet does not list (a desktop header's "Name Z→A", say)
 * simply shows no chip checked rather than pretending to be one of these.
 */
export interface PartyListSortSheetProps {
  readonly t: TranslateFn;
  readonly ordering: string;
  readonly onOrderingChange: (ordering: string) => void;
}

function PartyListSortSheetBase({
  t,
  ordering,
  onOrderingChange,
}: Readonly<PartyListSortSheetProps>): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const openSheet = useCallback(() => setOpen(true), []);

  return (
    <>
      <UbButton
        variant="secondary"
        iconOnly
        icon={<ArrowUpDown className="h-4 w-4" aria-hidden />}
        onClick={openSheet}
        aria-haspopup="dialog"
      >
        {t('parties.list.sort.label')}
      </UbButton>
      {open && (
        <PartyListSortDialogLazy
          t={t}
          open={open}
          onOpenChange={setOpen}
          ordering={ordering}
          onOrderingChange={onOrderingChange}
        />
      )}
    </>
  );
}

PartyListSortSheetBase.displayName = 'PartyListSortSheet';
export const PartyListSortSheet = memo(PartyListSortSheetBase);
