import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import './libraryInvalidation';

import type {
  CounterMember,
  CounterPrompt,
  CounterRow,
  LoanRow,
  QueueItem,
} from '../types/counter.types';
import type { MemberSummary } from '../types/member.types';

/**
 * F05 (LIB-06 §7) — the counter's thunks. `processCounterItem` is the whole
 * of one scan: resolve the code, then act on it in the item's mode, and say
 * what happened as ONE outcome the slice turns into a row, a loaded member, a
 * list of names or a prompt. The server decides every refusal (BR-8); the
 * outcome only carries what it said.
 */
const service = () => import('../api/libraryCirculationService');

type Reject = { rejectValue: ApiErrorShape };

export type CounterOutcome =
  | { readonly type: 'member'; readonly member: CounterMember }
  | { readonly type: 'search'; readonly code: string; readonly results: MemberSummary[] }
  | {
      readonly type: 'row';
      readonly row: CounterRow;
      readonly member?: CounterMember | null;
      readonly prompt?: CounterPrompt;
    };

let sequence = 0;
const rowId = (): string => `${Date.now().toString(36)}-${(sequence += 1)}`;
const now = (): string => new Date().toISOString();

/** A code is what a scanner types: no spaces. Anything else is a name to search. */
export const looksLikeCode = (text: string): boolean => /^[A-Za-z0-9/._-]+$/.test(text.trim());

const detailString = (error: ApiErrorShape, key: string): string => {
  const details = (error.details ?? {}) as Record<string, unknown>;
  const value = details[key];
  return value === null || value === undefined ? '' : String(value);
};

const refused = (
  item: QueueItem,
  error: ApiErrorShape,
  extra: Partial<CounterRow> = {}
): CounterRow => ({
  id: rowId(),
  kind: 'refused',
  code: item.code,
  at: now(),
  messageId: `errors.${error.code}`,
  ...extra,
});

/**
 * One refusal of an issue, in the words the counter uses. `library_member_blocked`
 * with every block overridable turns into the Override prompt for someone who
 * may override; a copy already with the loaded member asks Return or Renew.
 */
const issueRefusal = (
  item: QueueItem,
  error: ApiErrorShape,
  copyId: string,
  title: string,
  canOverride: boolean
): CounterOutcome => {
  const details = (error.details ?? {}) as Record<string, unknown>;
  if (error.code === 'library_member_blocked') {
    const blocks = ((details.blocks as { code: string; overridable: boolean; params: object }[]) ??
      []) as { code: string; overridable: boolean; params: Record<string, string> }[];
    const overridable = blocks.length > 0 && blocks.every((block) => block.overridable);
    const row = refused(item, error, {
      title,
      messageId: `library.member.block.${blocks[0]?.code ?? 'membership_closed'}`,
      messageParams: blocks[0]?.params ?? {},
    });
    return overridable && canOverride
      ? {
          type: 'row',
          row,
          prompt: {
            kind: 'override',
            code: item.code,
            copyId,
            blocks: blocks.map((b) => ({ code: b.code, params: b.params })),
          },
        }
      : { type: 'row', row };
  }
  if (error.code === 'library_copy_unavailable') {
    const withMember = details.with as
      { name: string; member_number: string; due_on: string; membership_id: string } | undefined;
    if (withMember && withMember.membership_id === item.membershipId) {
      return {
        type: 'row',
        row: refused(item, error, { title, messageId: 'library.counter.alreadyWithMember' }),
        prompt: { kind: 'alreadyWith', code: item.code, copyId, title },
      };
    }
    if (withMember) {
      return {
        type: 'row',
        row: refused(item, error, {
          title,
          messageId: 'library.counter.outWith',
          messageParams: { name: withMember.name, date: withMember.due_on },
        }),
      };
    }
    const heldFor = details.held_for as { name: string } | undefined;
    if (heldFor) {
      return {
        type: 'row',
        row: refused(item, error, {
          title,
          messageId: 'library.counter.heldFor',
          messageParams: { name: heldFor.name },
        }),
      };
    }
    return {
      type: 'row',
      row: refused(item, error, {
        title,
        messageId: `library.copy.status.${detailString(error, 'status') || 'withdrawn'}`,
      }),
    };
  }
  return { type: 'row', row: refused(item, error, { title }) };
};

export const processCounterItem = createAsyncThunk<
  CounterOutcome,
  { item: QueueItem; canOverride: boolean },
  Reject
>('libraryCounter/process', async ({ item, canOverride }, { rejectWithValue }) => {
  const api = await service();
  try {
    let copyId = item.copyId ?? null;
    let title = '';
    if (!copyId) {
      const found = await api.lookup(item.code);
      if (found.kind === 'member') {
        return { type: 'member', member: await api.getCounterMember(found.member.membershipId) };
      }
      if (found.kind === 'isbn') {
        return {
          type: 'row',
          row: {
            id: rowId(),
            kind: 'info',
            code: item.code,
            at: now(),
            messageId: 'library.counter.isbn',
            messageParams: { titles: found.titles.map((t) => t.title).join(', ') },
          },
        };
      }
      if (found.kind === 'none') {
        if (!looksLikeCode(item.code) && item.code.trim().length >= 2) {
          return { type: 'search', code: item.code, results: await api.searchMembers(item.code) };
        }
        return {
          type: 'row',
          row: { id: rowId(), kind: 'unknown', code: item.code, at: now() },
        };
      }
      copyId = found.copyId;
      title = found.title;
    }

    if (item.mode === 'issue') {
      if (!item.membershipId) {
        return {
          type: 'row',
          row: {
            id: rowId(),
            kind: 'info',
            code: item.code,
            at: now(),
            title,
            messageId: 'library.counter.memberFirst',
          },
        };
      }
      try {
        const { loan } = await api.issueCopy(
          {
            membership_id: item.membershipId,
            copy_id: copyId,
            ...(item.overrideReason ? { override_reason: item.overrideReason } : {}),
          },
          item.key
        );
        return {
          type: 'row',
          row: loanRow('issued', item, loan, { override: Boolean(item.overrideReason) }),
          member: await api.getCounterMember(item.membershipId),
        };
      } catch (error) {
        const failure = toApiError(error, 'library.counter.error');
        if (failure.status === 409) return issueRefusal(item, failure, copyId, title, canOverride);
        throw error;
      }
    }

    if (item.mode === 'return') {
      try {
        const result = await api.returnCopy(copyId, item.key);
        return {
          type: 'row',
          row: loanRow('returned', item, result.loan, {
            fine: result.fine ?? undefined,
            daysLate: result.daysLate,
            holdReady: result.holdReady,
            charge: result.fineCharge
              ? { ...result.fineCharge, partyName: result.loan.membership.name }
              : null,
          }),
          member: item.membershipId ? await api.getCounterMember(item.membershipId) : undefined,
        };
      } catch (error) {
        const failure = toApiError(error, 'library.counter.error');
        if (failure.status === 409) return { type: 'row', row: refused(item, failure, { title }) };
        throw error;
      }
    }

    // Renew: the copy's open loan, then its renewal.
    const loan = await api.openLoanOfCopy(copyId);
    if (!loan) {
      return {
        type: 'row',
        row: {
          id: rowId(),
          kind: 'refused',
          code: item.code,
          at: now(),
          title,
          messageId: 'errors.library_copy_not_on_loan',
        },
      };
    }
    try {
      const renewed = await api.renewLoan(loan.id, item.key, item.overrideReason);
      return {
        type: 'row',
        row: loanRow('renewed', item, renewed),
        member: item.membershipId ? await api.getCounterMember(item.membershipId) : undefined,
      };
    } catch (error) {
      const failure = toApiError(error, 'library.counter.error');
      if (failure.status === 409) {
        const reason = detailString(failure, 'reason');
        return {
          type: 'row',
          row: refused(item, failure, {
            title: loan.copy.title,
            messageId: reason ? `library.counter.renewRefused.${reason}` : undefined,
          }),
        };
      }
      throw error;
    }
  } catch (error) {
    return rejectWithValue(toApiError(error, 'library.counter.error'));
  }
});

const loanRow = (
  kind: 'issued' | 'returned' | 'renewed',
  item: QueueItem,
  loan: LoanRow,
  extra: Partial<CounterRow> = {}
): CounterRow => ({
  id: rowId(),
  kind,
  code: item.code,
  at: now(),
  title: loan.copy.title,
  accessionNumber: loan.copy.accessionNumber,
  memberName: loan.membership.name,
  dueOn: loan.dueOn,
  issuedOn: loan.issuedOn,
  loanId: loan.id,
  ...extra,
});

export const loadCounterMember = createAsyncThunk<CounterMember, string, Reject>(
  'libraryCounter/loadMember',
  async (membershipId, { signal, rejectWithValue }) => {
    try {
      return await (await service()).getCounterMember(membershipId, signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'library.counter.error'));
    }
  }
);

/** FR-10 — Undo an issue the same day (D20); the row turns into "Undone". */
export const undoCounterIssue = createAsyncThunk<
  { rowId: string; member: CounterMember | null },
  { rowId: string; loanId: string; reason: string; membershipId: string | null },
  Reject
>(
  'libraryCounter/undo',
  async ({ rowId: id, loanId, reason, membershipId }, { rejectWithValue }) => {
    try {
      const api = await service();
      await api.cancelLoan(loanId, reason);
      return { rowId: id, member: membershipId ? await api.getCounterMember(membershipId) : null };
    } catch (error) {
      return rejectWithValue(toApiError(error, 'library.counter.error'));
    }
  }
);

/** FR-8 — Renew every loan that can be; the refused ones are said by reason. */
export const renewAllAtCounter = createAsyncThunk<
  { renewed: number; refused: number; member: CounterMember },
  string,
  Reject
>('libraryCounter/renewAll', async (membershipId, { rejectWithValue }) => {
  try {
    const api = await service();
    const result = await api.renewAll(membershipId);
    return {
      renewed: result.renewed.length,
      refused: result.refused.length,
      member: await api.getCounterMember(membershipId),
    };
  } catch (error) {
    return rejectWithValue(toApiError(error, 'library.counter.error'));
  }
});
