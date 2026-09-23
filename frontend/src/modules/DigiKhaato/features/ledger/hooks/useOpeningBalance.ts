'use client';

import { useCallback, useMemo, useState } from 'react';


import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useDegradedNetwork } from 'src/hooks/useDegradedNetwork';
import { useIdempotencyKey } from 'src/hooks/useIdempotencyKey';
import { usePermissions } from 'src/hooks/usePermissions';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';
import { applyServerErrors } from 'src/utils/applyServerErrors';
import { formatAmount } from 'src/utils/money';

import { selectLedgerEntries, selectLedgerStatus } from '../redux/ledgerEntrySlice';
import { postOpeningBalance } from '../redux/ledgerEntryThunk';

import type { LedgerDirection, LedgerEntry } from '../types/ledger.types';
import type { UseFormSetError } from 'react-hook-form';

/**
 * Part 19 §19.4 — LED-02's drawer, and the rule that decides whether it is
 * offered at all.
 *
 * ── Why `canAdd` is computed from the TIMELINE ──────────────────────────────
 * FR-3 offers the action only on a party with no opening entry, and §9 says the
 * menu item is hidden when one exists. The rows the timeline already holds are
 * where that answer lives — so the action disappears the moment the entry is
 * posted, because `postOpeningBalance` patches those rows (see the invalidation
 * map), and nothing has to remember to hide it.
 *
 * It waits for the timeline to have LOADED. Offering the action before the
 * rows arrive would show it for a second on a party that already has an
 * opening, and a merchant who taps it in that second gets a 409 for a rule they
 * could not have known about.
 */
export interface OpeningBalanceValues {
  readonly amount: string;
  readonly direction: LedgerDirection;
  readonly asOf: string;
}

export interface UseOpeningBalanceResult {
  readonly open: boolean;
  /** The posted opening, or `null`. Also what decides `canAdd`. */
  readonly existing: LedgerEntry | null;
  readonly canAdd: boolean;
  readonly isSaving: boolean;
  readonly formErrors: readonly string[];
  readonly openDrawer: () => void;
  readonly close: () => void;
  readonly submit: (
    values: OpeningBalanceValues,
    setError: UseFormSetError<OpeningBalanceValues>
  ) => Promise<void>;
}

export const useOpeningBalance = (partyId: string): UseOpeningBalanceResult => {
  const dispatch = useAppDispatch();
  const { can } = usePermissions();
  const { canWrite: canWriteIn } = useDegradedNetwork();
  const rows = useAppSelector(selectLedgerEntries);
  const timelineStatus = useAppSelector(selectLedgerStatus);
  const { key, rotate } = useIdempotencyKey();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<RequestStatus>('idle');
  const [formErrors, setFormErrors] = useState<readonly string[]>([]);

  /* BR-5 — a REVERSED opening is history, not an opening. The action comes
     back when a merchant undoes the figure, which is right: they have none. */
  const existing = useMemo(
    () => rows.find((row) => row.entryType === 'opening' && row.status === 'posted') ?? null,
    [rows]
  );

  /* §12 — posting an opening needs BOTH rights, and the pair is not
     redundant: it writes a ledger entry AND it is part of setting a party up,
     which is why PTY-01 lists the same pair on its create form. */
  const canAdd =
    can('ledger.entry.write') &&
    can('parties.party.write') &&
    canWriteIn('queueable') &&
    existing === null &&
    (timelineStatus === 'succeeded' || timelineStatus === 'refreshing');

  const openDrawer = useCallback(() => {
    setFormErrors([]);
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setFormErrors([]);
    setOpen(false);
  }, []);

  const submit = useCallback(
    async (values: OpeningBalanceValues, setError: UseFormSetError<OpeningBalanceValues>) => {
      setFormErrors([]);
      setStatus('loading');
      try {
        const saved = await dispatch(
          postOpeningBalance({
            partyId,
            amount: values.amount,
            direction: values.direction,
            asOf: values.asOf,
            idempotencyKey: key,
          })
        ).unwrap();
        rotate();
        setStatus('succeeded');
        setOpen(false);
        dispatch(
          showSnackbar({
            severity: 'success',
            id: 'ledger.opening.saved',
            // `formatAmount`, never `formatInr`: the copy carries the ₹ because
            // Hindi puts it elsewhere in the line. The fourth place in this
            // codebase where that pair has met.
            params: { balance: formatAmount(saved.balance) },
          })
        );
      } catch (thrown) {
        setStatus('failed');
        const apiError = thrown as ApiErrorShape;
        if (apiError.code === 'validation_error') {
          rotate();
          setFormErrors(
            applyServerErrors(
              {
                ...apiError,
                details: Object.fromEntries(
                  Object.entries(apiError.details ?? {}).map(([path, messages]) => [
                    path === 'entry_date' ? 'asOf' : path,
                    messages,
                  ])
                ),
              },
              setError,
              ['amount', 'direction', 'asOf']
            )
          );
          return;
        }
        /* Both of these are answerable in place, above the form, rather than in
           a toast over a drawer that is closing. `opening_balance_exists` is
           the one a merchant can actually hit without doing anything wrong: two
           tabs, or a colleague on another phone. */
        if (apiError.code === 'opening_balance_exists' || apiError.code === 'party_archived') {
          setFormErrors([apiError.message]);
          return;
        }
        /* Everything else has already been toasted by the response interceptor
           (R-E-2); the drawer stays open with what was typed. */
      }
    },
    [dispatch, partyId, key, rotate]
  );

  return useMemo(
    () => ({
      open,
      existing,
      canAdd,
      isSaving: status === 'loading',
      formErrors,
      openDrawer,
      close,
      submit,
    }),
    [open, existing, canAdd, status, formErrors, openDrawer, close, submit]
  );
};
