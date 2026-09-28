'use client';

import { useCallback } from 'react';

import { Pencil, Undo2 } from 'lucide-react';

import { UbButton, UbDialog, UbStack, UbText } from 'src/design-system';
import type { TranslateFn } from 'src/hooks/useTranslation';

import { khataEntryTitle } from '../view-model/narration';

import type { LedgerEntry } from '../types/ledger.types';

/**
 * LED-03 FR-1 — the two things a merchant can do to a line they got wrong.
 *
 * ── Why ONE menu for the whole timeline ───────────────────────────────────
 * It is rendered once by `PartyLedgerTimeline` and pointed at whichever row was
 * tapped, rather than mounted per row. A khata is hundreds of rows long on a
 * party a shop has traded with for three years, and a dialog per row is
 * hundreds of portals waiting to be opened — on the phone this product is built
 * for, on the screen it is opened most.
 *
 * ── Why a sheet and not an anchored popover ───────────────────────────────
 * The same finding `PartyHeaderMenu` records: `UbPopover` pulled
 * `@radix-ui/react-popover` onto this route for +10.9 KB, and `UbDialog` is
 * hand-rolled on `createPortal` with nothing behind it. On a list row it is
 * also the better control — an anchored popover near the bottom of a scrolling
 * list has to flip, and a flipped popover over a row the merchant is reading
 * covers the row they are deciding about.
 *
 * ── Why the row is named in the title ─────────────────────────────────────
 * "Cement bags" tells a merchant which of Tuesday's four entries they are about
 * to change. "Entry options" tells them they tapped something.
 */
export interface EntryActionsMenuProps {
  readonly entry: LedgerEntry | null;
  readonly t: TranslateFn;
  readonly onClose: () => void;
  readonly onCorrect: (entry: LedgerEntry) => void;
  readonly onReverse: (entry: LedgerEntry) => void;
}

export function EntryActionsMenu({
  entry,
  t,
  onClose,
  onCorrect,
  onReverse,
}: Readonly<EntryActionsMenuProps>): React.JSX.Element | null {
  /* Close BEFORE acting, always. A menu item that opens a drawer while its own
     dialog is still mounted leaves two overlays on screen, and Escape then
     closes the wrong one — `PartyHeaderMenu` learned this first. */
  const run = useCallback(
    (action: (chosen: LedgerEntry) => void) => {
      if (!entry) return;
      onClose();
      action(entry);
    },
    [entry, onClose]
  );

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) onClose();
    },
    [onClose]
  );

  if (!entry) return null;

  return (
    <UbDialog
      open
      onOpenChange={handleOpenChange}
      title={khataEntryTitle(entry, t)}
      closeLabel={t('common.action.close')}
    >
      <UbStack gap={1}>
        <UbButton
          variant="ghost"
          fullWidth
          className="justify-start"
          icon={<Pencil className="h-4 w-4" aria-hidden />}
          onClick={() => run(onCorrect)}
        >
          {t('ledger.correction.action.correct')}
        </UbButton>
        <UbButton
          variant="ghost"
          fullWidth
          className="justify-start"
          icon={<Undo2 className="h-4 w-4" aria-hidden />}
          onClick={() => run(onReverse)}
        >
          {t('ledger.correction.action.reverse')}
        </UbButton>
        {/* Said once, here, rather than in both dialogs: whichever they pick,
            the line they are looking at stays in the book. A merchant who
            expects a delete and gets a strike-through would otherwise find out
            by seeing it. */}
        <UbText variant="caption" tone="tertiary" className="px-3 pt-1">
          {t('ledger.correction.menu.hint')}
        </UbText>
      </UbStack>
    </UbDialog>
  );
}
