'use client';

import { useCallback, useMemo, useState } from 'react';

import { useAppDispatch } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import type { ApiErrorShape } from 'src/types/api.types';
import { newRequestId } from 'src/utils/requestId';

import {
  archiveParty,
  bulkArchiveParties,
  restoreParty,
} from '../redux/partyArchiveThunk';

import type { BulkArchiveResult } from '../api/partyService';

/**
 * What the archive dialog is showing: the ordinary confirmation, or the state
 * the server puts it in when the party still owes something.
 */
export type ArchiveStage = 'closed' | 'confirm' | 'blocked' | 'saving';

export interface BlockedBalance {
  readonly amount: string;
  /** `receivable` — they owe the merchant; `payable` — the merchant owes them. */
  readonly label: string;
}

export interface UsePartyArchiveResult {
  readonly canArchive: boolean;
  readonly stage: ArchiveStage;
  readonly blocked: BlockedBalance | null;
  readonly error: ApiErrorShape | null;
  readonly open: () => void;
  readonly close: () => void;
  readonly confirm: (reason: string) => void;
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

  const canArchive = can('parties.party.delete');

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
            setBlocked({
              amount: details.balance ?? '0.00',
              label: details.balance_label ?? 'receivable',
            });
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
      restore,
      restoring,
    }),
    [canArchive, stage, blocked, error, open, close, confirm, restore, restoring]
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
export function useBulkArchive(
  ids: readonly string[],
  onDone: () => void
): UseBulkArchiveResult {
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
      void dispatch(
        bulkArchiveParties({ ids, reason, idempotencyKey: newRequestId() })
      )
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
