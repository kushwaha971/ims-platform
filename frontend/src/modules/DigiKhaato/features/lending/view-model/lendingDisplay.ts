import type { UbStatusBadgeTone } from 'src/design-system';

import type { LoanStatus, TodayStop } from '../types/lending.types';

/** Lending's display decisions, made once so the round, the list and the page agree. */
export const LOAN_STATUS_TONE: Readonly<Record<LoanStatus, UbStatusBadgeTone>> = {
  active: 'info',
  closed: 'success',
  written_off: 'neutral',
  cancelled: 'neutral',
};

export const isNonZero = (amount: string | null | undefined): boolean =>
  !!amount && Number(amount) !== 0;

/** What a stop asks for today: today's instalment plus anything late. */
export const askedToday = (stop: Pick<TodayStop, 'dueToday' | 'arrears'>): string =>
  (Number(stop.dueToday) + Number(stop.arrears)).toFixed(2);

export type StopState = 'paid' | 'part' | 'visited' | 'late' | 'due';

export const stopState = (stop: TodayStop): StopState => {
  const asked = Number(askedToday(stop));
  const got = Number(stop.collectedToday);
  if (got > 0 && asked <= 0) return 'paid';
  if (got > 0) return 'part';
  if (stop.visit) return 'visited';
  return Number(stop.arrears) > 0 ? 'late' : 'due';
};

export const STOP_TONE: Readonly<Record<StopState, UbStatusBadgeTone>> = {
  paid: 'success',
  part: 'warning',
  visited: 'neutral',
  late: 'error',
  due: 'info',
};

/** Monday = bit 1 … Sunday = bit 64; the order a week is read in. */
export const WEEKDAY_BITS = [1, 2, 4, 8, 16, 32, 64] as const;
