'use client';

import { useCallback, useMemo, useState } from 'react';

import { useAppDispatch } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import type { ApiErrorShape } from 'src/types/api.types';
import { absMoney, formatAmount, isNegativeAmount } from 'src/utils/money';
import { newRequestId } from 'src/utils/requestId';

import { archiveParty, bulkArchiveParties, restoreParty } from '../redux/partyArchiveThunk';

import type { BulkArchiveResult } from '../api/partyService';

/**
 * What the archive dialog is showing: the ordinary confirmation, or the state
 * the server puts it in when the party still owes something.
 */
export type ArchiveStage = 'closed' | 'confirm' | 'blocked' | 'writeOff' | 'saving';

export interface BlockedBalance {
  /** The SIGNED balance as the server sent it (`"-500.00"` for a payable) — for `UbAmount`. */
  readonly amount: string;
  /**
   * The positive magnitude (`"500.00"`) — what the copy prints and what
   * `write_off.amount` confirms. FB-1: sending the signed figure made every
   * payable write-off fail with "Enter an amount greater than 0".
   */
  readonly magnitude: string;
  /** `receivable` — they owe the merchant; `payable` — the merchant owes them. */
  readonly label: string;
}

/**
 * The dialog's blocked figure from a 409's `details`, in one place so the
 * archive refusal and the write-off's `balance_changed` cannot disagree.
 *
 * `party_balance_nonzero` carries `balance` (signed) and `balance_label`;
 * `balance_changed` adds `amount`, the server's own `|balance|`, which is
 * preferred when present because it is the exact figure the server will
 * compare the next confirmation against. `absMoney` rather than a hand-rolled
 * strip of `-`: `src/utils/money` is already in this route (this hook's
 * `formatAmount`, and `UbAmount`), so it costs nothing and is not a second
 * implementation of the same rule. A missing label is derived from the sign,
 * which is the server's own convention (positive = receivable).
 */
export const blockedFromDetails = (details: Record<string, string>): BlockedBalance | null => {
  const balance = details.balance;
  if (!balance) return null;
  return {
    amount: balance,
    magnitude: details.amount || absMoney(balance),
    label: details.balance_label ?? (isNegativeAmount(balance) ? 'payable' : 'receivable'),
  };
};

export interface UsePartyArchiveResult {
  readonly canArchive: boolean;
  readonly stage: ArchiveStage;
  readonly blocked: BlockedBalance | null;
  readonly error: ApiErrorShape | null;
  readonly open: () => void;
  readonly close: () => void;
  readonly confirm: (reason: string) => void;
  /** Owner-level: archive rights AND `ledger.entry.write` (T-PTY-04-12). */
  readonly canWriteOff: boolean;
  /** Blocked → the write-off form, in the same dialog (FR-10: no second modal). */
  readonly startWriteOff: () => void;
  /** Back from the write-off form to the blocked state. */
  readonly cancelWriteOff: () => void;
  readonly confirmWriteOff: (values: { reason: string; entryDate: string }) => void;
  /** What the dialog was in when `saving` began, so a failure returns there. */
  readonly savingFrom: ArchiveStage;
  readonly restore: () => void;
  readonly restoring: boolean;
}

/**
 * PTY-04's single-party flow, for one party.
 *
 * ── The blocked state is the SERVER's, never the client's ──────────────────
 * The dialog could read `party.balance` and refuse to open. It must not: EC-1
 * is the case where another device posts an entry between the dialog opening
 * and the merchant confirming, and a client that pre-judges archives on stale
 * data. So the confirm always goes to the server, and a 409
 * `party_balance_nonzero` swaps the dialog in place — with the server's own
 * figure, which is the current one.
 *
 * ── One key per dialog, not per press ──────────────────────────────────────
 * `Idempotency-Key` has to be stable across retries of one intent and different
 * between two intents. Minted when the dialog opens: a merchant who presses
 * Archive, loses the response and presses again is retrying; a merchant who
 * archives, restores and archives again is doing something new, and a key
 * derived from the party id would replay the first archive at them.
 */
export function usePartyArchive(id: string | null): UsePartyArchiveResult {
  const dispatch = useAppDispatch();
  const { can } = usePermissions();

  const [stage, setStage] = useState<ArchiveStage>('closed');
  const [blocked, setBlocked] = useState<BlockedBalance | null>(null);
  const [error, setError] = useState<ApiErrorShape | null>(null);
  const [key, setKey] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [savingFrom, setSavingFrom] = useState<ArchiveStage>('confirm');

  const canArchive = can('parties.party.delete');
  const canWriteOff = canArchive && can('ledger.entry.write');

  const open = useCallback(() => {
    setBlocked(null);
    setError(null);
    setKey(newRequestId());
    setStage('confirm');
  }, []);

  const close = useCallback(() => setStage('closed'), []);

  const confirm = useCallback(
    (reason: string) => {
      if (!id) return;
      setSavingFrom('confirm');
      setStage('saving');
      setError(null);
      void dispatch(archiveParty({ id, reason, idempotencyKey: key }))
        .unwrap()
        .then(() => {
          setStage('closed');
          dispatch(showSnackbar({ severity: 'success', id: 'parties.archive.done' }));
        })
        .catch((rejected: ApiErrorShape) => {
          if (rejected?.code === 'party_balance_nonzero') {
            const details = (rejected.details ?? {}) as Record<string, string>;
            setBlocked(
              blockedFromDetails(details) ?? { amount: '0.00', magnitude: '0.00', label: 'receivable' }
            );
            setStage('blocked');
            return;
          }
          // Anything else keeps the dialog open with its own message and the
          // request id (R-E-4): closing it would leave a merchant who pressed
          // Archive looking at an unchanged list with no explanation.
          setError(rejected ?? null);
          setStage('confirm');
        });
    },
    [dispatch, id, key]
  );

  const startWriteOff = useCallback(() => {
    setError(null);
    setStage('writeOff');
  }, []);
  const cancelWriteOff = useCallback(() => {
    setError(null);
    setStage('blocked');
  }, []);

  /* FR-3. The same key as the archive attempt is NOT reused: the blocked
     archive was refused and wrote nothing, and a write-off is a different
     intent — reusing the key would have the server replay the 409. */
  const confirmWriteOff = useCallback(
    ({ reason, entryDate }: { reason: string; entryDate: string }) => {
      if (!id || !blocked) return;
      const writeOffKey = newRequestId();
      setSavingFrom('writeOff');
      setStage('saving');
      setError(null);
      void dispatch(
        archiveParty({
          id,
          reason: '',
          idempotencyKey: writeOffKey,
          // The MAGNITUDE: the server confirms against |balance| and refuses a
          // signed "-500.00" for every payable (FB-1).
          writeOff: { reason, entryDate, amount: blocked.magnitude },
        })
      )
        .unwrap()
        .then(() => {
          setStage('closed');
          /* AC-3: no Undo. A write-off is a real financial event, and Restore
             does not reverse it (FR-4). */
          dispatch(
            showSnackbar({
              severity: 'success',
              id: 'parties.writeOff.done',
              params: { amount: formatAmount(blocked.magnitude) },
            })
          );
        })
        .catch((rejected: ApiErrorShape) => {
          /* EC-1 for write-offs: something moved the balance after the dialog
             showed it. Show the NEW figure and make the merchant confirm it —
             writing off an amount they did not see would be the product
             deciding a financial question for them. */
          if (rejected?.code === 'balance_changed' || rejected?.code === 'party_balance_nonzero') {
            const next = blockedFromDetails((rejected.details ?? {}) as Record<string, string>);
            if (next) setBlocked(next);
          }
          if (rejected?.code === 'nothing_to_write_off') {
            // Settled elsewhere meanwhile: the plain archive now works.
            setBlocked(null);
            setError(rejected ?? null);
            setStage('confirm');
            return;
          }
          setError(rejected ?? null);
          setStage('writeOff');
        });
    },
    [dispatch, id, blocked]
  );

  const restore = useCallback(() => {
    if (!id) return;
    setRestoring(true);
    void dispatch(restoreParty({ id, idempotencyKey: newRequestId() }))
      .unwrap()
      .then(() => dispatch(showSnackbar({ severity: 'success', id: 'parties.restore.done' })))
      .finally(() => setRestoring(false));
  }, [dispatch, id]);

  return useMemo(
    () => ({
      canArchive,
      stage,
      blocked,
      error,
      open,
      close,
      confirm,
      canWriteOff,
      startWriteOff,
      cancelWriteOff,
      confirmWriteOff,
      savingFrom,
      restore,
      restoring,
    }),
    [
      canArchive,
      stage,
      blocked,
      error,
      open,
      close,
      confirm,
      canWriteOff,
      startWriteOff,
      cancelWriteOff,
      confirmWriteOff,
      savingFrom,
      restore,
      restoring,
    ]
  );
}

export interface UseBulkArchiveResult {
  readonly canArchive: boolean;
  readonly open: boolean;
  readonly saving: boolean;
  readonly result: BulkArchiveResult | null;
  readonly start: () => void;
  readonly close: () => void;
  readonly confirm: (reason: string) => void;
}

/**
 * The list's bulk flow (FR-9).
 *
 * It keeps the RESULT after the request, because a partial success is the
 * normal outcome and "26 archived, 4 skipped" is not something a snackbar can
 * carry — the merchant needs to see which four and what they owe, so the dialog
 * stays open and becomes the report.
 */
export function useBulkArchive(ids: readonly string[], onDone: () => void): UseBulkArchiveResult {
  const dispatch = useAppDispatch();
  const { can } = usePermissions();

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<BulkArchiveResult | null>(null);

  const start = useCallback(() => {
    setResult(null);
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setResult(null);
  }, []);

  const confirm = useCallback(
    (reason: string) => {
      setSaving(true);
      void dispatch(bulkArchiveParties({ ids, reason, idempotencyKey: newRequestId() }))
        .unwrap()
        .then((outcome) => {
          setResult(outcome);
          /* The selection is cleared whatever the outcome: the archived rows
             are gone from this tab, and leaving the skipped ones ticked would
             invite a second press of a button that will skip them again for
             the same reason. */
          onDone();
        })
        .finally(() => setSaving(false));
    },
    [dispatch, ids, onDone]
  );

  return { canArchive: can('parties.party.delete'), open, saving, result, start, close, confirm };
}
