import type { UbDataGridColumn } from 'src/design-system/UbDataGrid';

import { effectiveStatus, isRevocable } from '../view-model/invitationDisplay';
import { roleText } from '../view-model/roleDisplay';

import {
  InvitationEmailCell,
  InvitationMetaCell,
  InvitationRevokeCell,
  InvitationStatusCell,
} from './InvitationRow';

import type { Invitation } from '../types/invitation.types';

/**
 * Part 19 §19.9.4 — a MODULE-LEVEL column factory, memoised by the screen on
 * its real dependencies. Building this array inside the component is the single
 * biggest `UbDataGrid` performance mistake there is: a new array every render
 * invalidates every cell.
 *
 * ── The priority order, and the reasoning ───────────────────────────────────
 *
 * The reader of this screen is answering one question: **who is still waiting
 * to get in, and should they be?** Every column is scored against that sentence
 * and nothing else.
 *
 * | # | Column | Priority | Card | Why |
 * |---|---|---|---|---|
 * | 1 | Email      | 1 | title    | Who. Without it there is no row. |
 * | 2 | Status     | 1 | meta     | Whether this is still live at all — the question itself. |
 * | 3 | Revoke     | 1 | trailing | The act the screen exists for. An action column is never dropped, so it is priority 1 by necessity as well as by design. |
 * | 4 | Role       | 2 | meta     | What they would get. It decides whether to revoke, not whether to look. |
 * | 5 | Expires    | 3 | none     | The date behind the status word. `effectiveStatus` already turns a lapsed `pending` into "Expired", so the row tells the reader the CONSEQUENCE at every width and keeps the date for the desktop. |
 * | 6 | Invited by | 4 | none     | Only ever varies in a business with several admins, and answers "who do I ask", not "should this stand". |
 *
 * So the md–lg table is email / status / role / revoke, and the phone card is
 * the address, two supporting words and the one control. Nothing at any width
 * has to be dragged sideways to read.
 *
 * ── The actions column's width (QA D4) ─────────────────────────────────────
 * It was a weight of 8 with a hidden header. At 1280 px that is a ~84 px cell,
 * and a `sm` "Revoke" needs its cell padding, its own padding and the word —
 * so a cell that `truncate`s painted "Revoke …". It is 16 now, the same weight
 * the Members table directly above gives its actions column, and it shows the
 * same "Actions" header, so the two tables on one screen line up.
 * `InvitationColumns.test.tsx` does the arithmetic at 1280 and 768 px.
 *
 * `sortField` is absent everywhere on purpose: the contract documents no
 * `ordering` for this collection, and a sort control that does not sort is
 * worse than no control (the grid's own rule).
 */
export interface InvitationColumnDeps {
  /** Already-bound `t` from the screen; a column never calls `useTranslation`. */
  readonly t: (id: string, values?: Record<string, string | number | Date>) => string;
  /** A formatted date, bound by the screen so the cell stays pure. */
  readonly d: (value: string | Date) => string;
  /** "Now", captured once by the screen, so this array has a stable memo key. */
  readonly nowMs: number;
  /** §19.10.4 — may a class-C write be attempted right now? */
  readonly canWrite: boolean;
  readonly onRevoke: (id: string) => void;
}

export const createInvitationColumns = ({
  t,
  d,
  nowMs,
  canWrite,
  onRevoke,
}: InvitationColumnDeps): readonly UbDataGridColumn<Invitation>[] => [
  {
    id: 'email',
    header: t('team.list.column.email'),
    priority: 1,
    cardSlot: 'title',
    widthShare: 30,
    cell: (invitation) => <InvitationEmailCell email={invitation.email} />,
  },
  {
    id: 'status',
    header: t('team.list.column.status'),
    priority: 1,
    cardSlot: 'meta',
    widthShare: 14,
    cell: (invitation) => {
      const status = effectiveStatus(invitation.status, invitation.expiresAt, nowMs);
      return <InvitationStatusCell status={status} label={t(`team.status.${status}`)} />;
    },
  },
  {
    id: 'role',
    header: t('team.list.column.role'),
    priority: 2,
    cardSlot: 'meta',
    widthShare: 12,
    cell: (invitation) => (
      <InvitationMetaCell
        text={
          roleText(t, {
            code: invitation.role,
            labelId: invitation.roleLabelId,
            module: null,
            active: true,
          }).label
        }
      />
    ),
  },
  {
    id: 'expires',
    header: t('team.list.column.expires'),
    priority: 3,
    cardSlot: 'none',
    widthShare: 14,
    cell: (invitation) => <InvitationMetaCell text={d(invitation.expiresAt)} />,
  },
  {
    id: 'invitedBy',
    header: t('team.list.column.invitedBy'),
    priority: 4,
    cardSlot: 'none',
    widthShare: 14,
    cell: (invitation) => <InvitationMetaCell text={invitation.invitedBy ?? '—'} />,
  },
  {
    id: 'actions',
    header: t('team.list.column.actions'),
    // Visible, like the Members table's "Actions" directly above (QA D4): two
    // tables on one screen with different header rules read as a mistake.
    priority: 1,
    align: 'end',
    cardSlot: 'trailing',
    widthShare: 16,
    cell: (invitation) => (
      <InvitationRevokeCell
        id={invitation.id}
        revocable={isRevocable(invitation.status, invitation.expiresAt, nowMs)}
        canWrite={canWrite}
        label={t('team.revoke.action')}
        offlineTitle={t('team.offline.write')}
        onRevoke={onRevoke}
      />
    ),
  },
];
