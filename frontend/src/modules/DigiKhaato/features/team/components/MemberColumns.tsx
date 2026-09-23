import type { UbDataGridColumn } from 'src/design-system/UbDataGrid';

import { accessStateOf } from '../view-model/credentialsShare';

import {
  MemberAccessCell,
  MemberMetaCell,
  MemberNameCell,
  MemberRegenerateCell,
} from './MemberRow';

import type { Member } from '../types/member.types';

/**
 * Part 19 §19.9.4 — a MODULE-LEVEL column factory, memoised by the screen on
 * its real dependencies. Building this array inside the component is the single
 * biggest `UbDataGrid` mistake there is: a new array every render invalidates
 * every cell.
 *
 * ── The priority order, and the reasoning ───────────────────────────────────
 *
 * The reader is answering one question: **has everybody I added actually got
 * in, and if not, what do I do about it?** Every column is scored against that
 * sentence.
 *
 * | # | Column | Priority | Card | Why |
 * |---|---|---|---|---|
 * | 1 | Name       | 1 | title    | Who. The address rides along in the same cell because it is what they sign in with. |
 * | 2 | Access     | 1 | meta     | The question itself — signed in, waiting, or expired. |
 * | 3 | New password | 1 | trailing | The act the screen exists for when the answer to 2 is "waiting". An action column is never dropped. |
 * | 4 | Role       | 2 | meta     | What they can do. Decides whether the row is right, not whether to look. |
 * | 5 | Last signed in | 3 | none | The evidence behind the access word. `accessStateOf` already gives the reader the CONSEQUENCE at every width, so the date is a desktop luxury. |
 *
 * `sortField` is absent everywhere on purpose: the server documents no
 * `ordering` for this collection, and a sort control that does not sort is
 * worse than no control (the grid's own rule). The server's own order already
 * floats the rows that need acting on to the top.
 */
export interface MemberColumnDeps {
  /** Already-bound `t` from the screen; a column never calls `useTranslation`. */
  readonly t: (id: string, values?: Record<string, string | number | Date>) => string;
  /** A formatted date, bound by the screen so the cell stays pure. */
  readonly d: (value: string | Date) => string;
  /** "Now", captured once by the screen, so this array has a stable memo key. */
  readonly nowMs: number;
  readonly canWrite: boolean;
  readonly onRegenerate: (membershipId: string) => void;
}

export const createMemberColumns = ({
  t,
  d,
  nowMs,
  canWrite,
  onRegenerate,
}: MemberColumnDeps): readonly UbDataGridColumn<Member>[] => [
  {
    id: 'name',
    header: t('team.members.column.name'),
    priority: 1,
    cardSlot: 'title',
    widthShare: 34,
    cell: (member) => <MemberNameCell name={member.fullName} email={member.email} />,
  },
  {
    id: 'access',
    header: t('team.members.column.access'),
    priority: 1,
    cardSlot: 'meta',
    widthShare: 20,
    cell: (member) => {
      const state = accessStateOf(member, nowMs);
      return (
        <MemberAccessCell
          state={state}
          label={
            state === 'pending' && member.passwordExpiresAt
              ? t('team.members.state.expiring', { when: d(member.passwordExpiresAt) })
              : t(`team.members.state.${state}`)
          }
        />
      );
    },
  },
  {
    id: 'role',
    header: t('team.members.column.role'),
    priority: 2,
    cardSlot: 'meta',
    widthShare: 14,
    cell: (member) => <MemberMetaCell text={t(`tenant.role.${member.role}`)} />,
  },
  {
    id: 'lastLogin',
    header: t('team.members.column.lastLogin'),
    priority: 3,
    widthShare: 16,
    cell: (member) => (
      <MemberMetaCell
        text={member.lastLoginAt ? d(member.lastLoginAt) : t('team.members.state.never')}
      />
    ),
  },
  {
    id: 'actions',
    header: t('team.members.column.actions'),
    priority: 1,
    cardSlot: 'trailing',
    widthShare: 16,
    align: 'end',
    cell: (member) => (
      <MemberRegenerateCell
        membershipId={member.id}
        label={t('team.regenerate.action')}
        canWrite={canWrite}
        // Hidden once they have chosen their own password, and for somebody
        // only invited: the server refuses both, and a control whose only
        // outcome is a refusal teaches the merchant to distrust the screen.
        visible={member.mustChangePassword && member.status !== 'invited'}
        onRegenerate={onRegenerate}
      />
    ),
  },
];
