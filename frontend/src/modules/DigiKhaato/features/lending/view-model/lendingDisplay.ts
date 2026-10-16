import type { UbStatusBadgeTone } from 'src/design-system';
import { addDaysIso, addMonthsIso } from 'src/utils/dates';
import { addMoney } from 'src/utils/money';

import type { Frequency, LoanStatus, PlanType, TodayStop } from '../types/lending.types';

/** Lending's display decisions, made once so the round, the list and the page agree. */
export const LOAN_STATUS_TONE: Readonly<Record<LoanStatus, UbStatusBadgeTone>> = {
  active: 'info',
  closed: 'success',
  written_off: 'neutral',
  cancelled: 'neutral',
};

export const isNonZero = (amount: string | null | undefined): boolean =>
  !!amount && Number(amount) !== 0;

/**
 * What a stop — or a loan — asks for today: today's instalment plus anything
 * late. The round, the loan page and "Collect from" all show this figure, so
 * they read it from here (WP-03; `src/tests/sharedOwners.test.ts`).
 */
export const askedToday = (loan: Pick<TodayStop, 'dueToday' | 'arrears'>): string =>
  addMoney(loan.dueToday, loan.arrears);

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

/**
 * A row's caption: each word once, in order, blanks dropped. A route is often
 * named after its area, and "Station road · LN-0004 · Station road" was on two
 * screens before this existed (L03 QA).
 */
export const caption = (parts: readonly (string | null | undefined)[]): string =>
  [...new Set(parts.filter((part): part is string => Boolean(part)))].join(' · ');

/** `2026-10-05` → `2026-10-06`, on the calendar (no clock, no zone). */
export const nextDay = (wireDate: string): string => {
  const [y = 0, m = 1, d = 1] = wireDate.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return next.toISOString().slice(0, 10);
};

/**
 * L03 — whether a loan has a reminder to send: something late, something due
 * today, or the next instalment tomorrow (LEN-12 FR-1's three buckets). The
 * server decides the text; this only decides whether Remind is offered.
 */
export const isRemindable = (
  loan: { status: string; arrears: string; dueToday: string; nextDueOn: string | null },
  today: string
): boolean =>
  loan.status === 'active' &&
  (isNonZero(loan.arrears) || isNonZero(loan.dueToday) || loan.nextDueOn === nextDay(today));

/**
 * A tenant-local ISO instant (`2026-10-05T10:14:00+05:30`), read off the string:
 * the server wrote it in the lender's own time, and parsing it would move it to
 * the device's zone.
 */
export const localClock = (iso: string | null | undefined): string =>
  iso && iso.length >= 16 ? iso.slice(11, 16) : '';
export const localDay = (iso: string | null | undefined): string =>
  iso && iso.length >= 10 ? iso.slice(0, 10) : '';

const WRITE_OFF_CODE = /^(cannot_trace|death|bad_debt|other): (.*)$/s;

/**
 * LEN-10 — a written-off loan's reason as the owner reads it: the server keeps
 * "cannot_trace: Moved away"; the page says "Cannot trace the borrower · Moved away".
 */
export const endedReason = (reason: string, t: (id: string) => string): string => {
  const match = WRITE_OFF_CODE.exec(reason);
  return match ? `${t(`lending.end.writeOff.code.${match[1]}`)} · ${match[2]}` : reason;
};

/**
 * QA B46 / F12 — the first instalment's default: one period after the money is given (a
 * day, a week, a fortnight or a month), or 90 days out for a flexible loan's end date. It
 * used to be "tomorrow" whatever the plan, and it did not move when "Money given on" did,
 * so a loan back-dated to 1 Aug had its first weekly instalment on 13 Oct and a yearly rate
 * that jumped with the gap.
 */
export const defaultFirstDue = (givenOn: string, frequency: Frequency, plan: PlanType): string => {
  if (plan === 'flexible') return addDaysIso(givenOn, 90);
  if (frequency === 'monthly') return addMonthsIso(givenOn, 1);
  return addDaysIso(givenOn, frequency === 'weekly' ? 7 : frequency === 'fortnightly' ? 14 : 1);
};
