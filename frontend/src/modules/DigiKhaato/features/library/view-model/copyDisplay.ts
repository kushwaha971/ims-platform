import type { UbStatusBadgeTone } from 'src/design-system';
import type { UbGridState } from 'src/design-system/UbDataGrid';
import type { RequestStatus } from 'src/types/api.types';

import type { CopyRow, CopyStatus, TitleRow, WithdrawReason } from '../types/catalogue.types';

/**
 * F03 (LIB-02 §7) — how a copy and a title READ: the badge tone of each copy
 * status, the shelf line of a title, and which moves a copy offers. Words are
 * message ids; nothing here formats text.
 */
export const COPY_STATUS_TONE: Readonly<Record<CopyStatus, UbStatusBadgeTone>> = {
  available: 'success',
  on_loan: 'info',
  on_hold_shelf: 'info',
  in_repair: 'warning',
  lost: 'error',
  missing: 'error',
  withdrawn: 'neutral',
};

/** "2 of 3 on shelf" — or, when nothing is left in stock, the word for that. */
export const shelfLine = (
  row: Pick<TitleRow, 'copiesAvailable' | 'copiesTotal'>
): { readonly id: string; readonly params: Record<string, number> } =>
  row.copiesTotal === 0
    ? { id: 'library.title.noCopies', params: {} }
    : {
        id: 'library.title.onShelf',
        params: { available: row.copiesAvailable, total: row.copiesTotal },
      };

/** Where a copy is kept: the location code, else the free text, else nothing. */
export const copyPlace = (copy: Pick<CopyRow, 'location' | 'locationText'>): string =>
  copy.location?.code ?? copy.locationText;

/** BR-7 — withdrawal is refused while the copy is out or set aside for someone. */
export const canWithdraw = (status: CopyStatus): boolean =>
  status !== 'on_loan' && status !== 'on_hold_shelf' && status !== 'withdrawn';

/** `/repair` takes a copy from the shelf; `/back-to-shelf` returns it. */
export const canRepair = (status: CopyStatus): boolean => status === 'available';
export const canShelve = (status: CopyStatus): boolean => status === 'in_repair';

/** LIB-02 §9 — "other" needs a note of at least three characters. */
export const WITHDRAW_NOTE_MIN = 3;
export const noteRequired = (reason: WithdrawReason | ''): boolean => reason === 'other';

/**
 * Which of the grid's five states a library list is in. A list that has rows
 * keeps showing them while it refetches; "filtered-empty" is only for a list
 * narrowed by something other than its page, so a first-use library is never
 * told to clear filters it never set.
 */
export const listGridState = (list: {
  readonly status: RequestStatus;
  readonly canRead: boolean;
  readonly rows: readonly unknown[];
  readonly narrowed: boolean;
}): UbGridState => {
  if (list.status === 'loading' || (list.status === 'idle' && list.canRead)) return 'loading';
  if (list.status === 'failed') return 'error';
  if (list.rows.length > 0) return 'rows';
  return list.narrowed ? 'filtered-empty' : 'empty';
};
