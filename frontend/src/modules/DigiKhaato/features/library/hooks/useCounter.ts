'use client';

import { useCallback, useEffect, useRef } from 'react';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { selectActiveTenant, selectTenantTimezone } from 'src/redux/slice/sessionSlice';
import type { ApiErrorShape } from 'src/types/api.types';
import { todayInTenantTz } from 'src/utils/dates';
import { formatInr } from 'src/utils/money';
import { newRequestId } from 'src/utils/requestId';

import { markLibraryLoanLost } from '../redux/libraryChargeThunk';
import {
  counterEnqueued,
  counterMemberCleared,
  counterModeChanged,
  counterModeRestored,
  counterNoted,
  counterPromptClosed,
  counterRetried,
  counterSessionRestored,
  counterSkipped,
  counterStarted,
  selectLibraryCounter,
  type LibraryCounterState,
} from '../redux/libraryCounterSlice';
import {
  loadCounterMember,
  processCounterItem,
  renewAllAtCounter,
  undoCounterIssue,
} from '../redux/libraryCounterThunk';
import {
  beep,
  beepOn,
  readMode,
  readSession,
  rememberMode,
  saveSession,
} from '../view-model/counterDisplay';

import type { CounterMode, CounterRow } from '../types/counter.types';

export interface Counter extends LibraryCounterState {
  readonly today: string;
  readonly canIssue: boolean;
  readonly canOverride: boolean;
  readonly setMode: (mode: CounterMode) => void;
  /** Anything typed or scanned into the box; queued, never lost (FR-14). */
  readonly submit: (
    code: string,
    extra?: { overrideReason?: string; copyId?: string; mode?: CounterMode }
  ) => void;
  readonly pickMember: (membershipId: string) => void;
  readonly finish: () => void;
  readonly closePrompt: () => void;
  readonly retry: (key: string) => void;
  readonly skip: (key: string) => void;
  readonly undo: (row: CounterRow, reason: string) => Promise<void>;
  readonly renewAll: () => void;
  /** F06 — the loan is lost: fine to today, then the book's cost; the copy is marked lost. */
  readonly markLost: (
    loanId: string,
    title: string,
    reason: string
  ) => Promise<{ ok: true } | { ok: false; error: ApiErrorShape | null }>;
}

/**
 * F05 (LIB-06 FR-1, FR-13, FR-14) — the counter's engine, so the page only
 * renders: the queue drains one scan at a time, a refusal beeps, the mode and
 * today's session are remembered on this device, and every scan carries its
 * own idempotency key so a retried scan never issues twice (BR-5).
 */
export const useCounter = (): Counter => {
  const dispatch = useAppDispatch();
  const state = useAppSelector(selectLibraryCounter);
  const tenant = useAppSelector(selectActiveTenant);
  const timezone = useAppSelector(selectTenantTimezone);
  const today = todayInTenantTz(timezone ?? undefined);
  const { can, hasModule } = usePermissions();
  const on = hasModule('library');
  const canIssue = on && can('library.loan.write');
  const canOverride = canIssue && can('library.loan.override');

  // Restore this device's mode and today's session once.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !tenant) return;
    restored.current = true;
    dispatch(counterModeRestored(readMode()));
    dispatch(counterSessionRestored(readSession(tenant.id, today)));
  }, [dispatch, tenant, today]);

  useEffect(() => {
    if (tenant && restored.current) saveSession(tenant.id, today, state.session);
  }, [tenant, today, state.session]);

  // Beep on a new refusal at the top of the list (FR-15).
  const top = state.session[0];
  const lastBeeped = useRef<string | null>(null);
  useEffect(() => {
    if (!top || top.id === lastBeeped.current) return;
    lastBeeped.current = top.id;
    if ((top.kind === 'refused' || top.kind === 'unknown') && beepOn()) beep();
  }, [top]);

  // The queue: one in flight, in order (FR-14).
  const { queue, inFlight } = state;
  useEffect(() => {
    if (inFlight || queue.length === 0) return;
    dispatch(counterStarted());
  }, [dispatch, inFlight, queue.length]);
  // Each scan is sent once per attempt: StrictMode runs an effect twice in
  // development, and the second run must not push a second row (the key would
  // make the server replay, but the list would say "issued" twice).
  const sent = useRef(new Set<string>());
  useEffect(() => {
    if (!inFlight) return;
    const attempt = `${inFlight.key}:${state.failed.length}:${state.session.length}`;
    if (sent.current.has(attempt)) return;
    sent.current.add(attempt);
    void dispatch(processCounterItem({ item: inFlight, canOverride }));
    // `inFlight` changes identity exactly when a new attempt starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, inFlight, canOverride]);

  const setMode = useCallback(
    (mode: CounterMode) => {
      rememberMode(mode);
      dispatch(counterModeChanged(mode));
    },
    [dispatch]
  );

  const submit = useCallback<Counter['submit']>(
    (code, extra) => {
      const trimmed = code.trim();
      if (!trimmed) return;
      dispatch(
        counterEnqueued({
          key: newRequestId(),
          code: trimmed,
          mode: extra?.mode ?? state.mode,
          membershipId: state.member?.membershipId ?? null,
          ...(extra?.overrideReason ? { overrideReason: extra.overrideReason } : {}),
          ...(extra?.copyId ? { copyId: extra.copyId } : {}),
        })
      );
      if (extra?.overrideReason || extra?.copyId) dispatch(counterPromptClosed());
    },
    [dispatch, state.mode, state.member]
  );

  const pickMember = useCallback(
    (membershipId: string) => {
      void dispatch(loadCounterMember(membershipId));
    },
    [dispatch]
  );

  const undo = useCallback(
    async (row: CounterRow, reason: string) => {
      if (!row.loanId) return;
      await dispatch(
        undoCounterIssue({
          rowId: row.id,
          loanId: row.loanId,
          reason,
          membershipId: state.member?.membershipId ?? null,
        })
      );
    },
    [dispatch, state.member]
  );

  const markLost = useCallback<Counter['markLost']>(
    async (loanId, title, reason) => {
      const result = await dispatch(markLibraryLoanLost({ loanId, ...(reason ? { reason } : {}) }));
      if (!markLibraryLoanLost.fulfilled.match(result)) {
        return { ok: false, error: result.payload ?? null };
      }
      const total = result.payload.reduce((sum, charge) => sum + Number(charge.amount), 0);
      dispatch(
        counterNoted({
          id: `lost-${loanId}`,
          kind: 'info',
          code: title,
          at: new Date().toISOString(),
          title,
          messageId: 'library.counter.markedLost',
          messageParams: { amount: formatInr(total.toFixed(2)) },
        })
      );
      if (state.member) void dispatch(loadCounterMember(state.member.membershipId));
      return { ok: true };
    },
    [dispatch, state.member]
  );

  const renewAll = useCallback(() => {
    if (state.member) void dispatch(renewAllAtCounter(state.member.membershipId));
  }, [dispatch, state.member]);

  return {
    ...state,
    today,
    canIssue,
    canOverride,
    setMode,
    submit,
    pickMember,
    finish: () => dispatch(counterMemberCleared()),
    closePrompt: () => dispatch(counterPromptClosed()),
    retry: (key: string) => dispatch(counterRetried(key)),
    skip: (key: string) => dispatch(counterSkipped(key)),
    undo,
    renewAll,
    markLost,
  };
};
