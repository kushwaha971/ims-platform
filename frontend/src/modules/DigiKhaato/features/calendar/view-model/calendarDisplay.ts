import type { ModuleCode } from 'src/types/domain.types';
import { loadedMessage } from 'src/utils/loadedMessage';

import type { ClosedDay, Weekday } from '../types/calendar.types';

type Translate = (id: string, values?: Record<string, string | number | Date>) => string;

/** Monday first, as the server numbers them (0 = Monday). */
export const WEEKDAYS: readonly Weekday[] = [0, 1, 2, 3, 4, 5, 6];

/**
 * Close or open one weekday. BR-2: a list that would close all seven is
 * returned unchanged — the chip for the last open day is disabled on screen,
 * and the server refuses it too.
 */
export const toggleWeekday = (days: readonly Weekday[], day: Weekday): Weekday[] => {
  const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day];
  return next.length >= WEEKDAYS.length ? [...days] : [...next].sort((a, b) => a - b);
};

/** The one day left open, whose chip must not be pressed (BR-2). */
export const lastOpenDay = (days: readonly Weekday[]): Weekday | null => {
  const open = WEEKDAYS.filter((day) => !days.includes(day));
  return open.length === 1 ? (open[0] ?? null) : null;
};

export interface MonthGroup {
  /** `YYYY-MM`. */
  readonly month: string;
  readonly rows: readonly ClosedDay[];
}

/** Closures grouped by calendar month, in date order (FRD §8). */
export const groupByMonth = (rows: readonly ClosedDay[]): MonthGroup[] => {
  const groups = new Map<string, ClosedDay[]>();
  for (const row of [...rows].sort((a, b) => a.date.localeCompare(b.date))) {
    const month = row.date.slice(0, 7);
    groups.set(month, [...(groups.get(month) ?? []), row]);
  }
  return [...groups].map(([month, grouped]) => ({ month, rows: grouped }));
};

/**
 * A module's name, or `null` when its copy is not loaded here — never the code.
 * A caller given `null` uses a whole generic sentence: a fallback WORD spliced
 * into "{module} uses different days" reads "When on, This feature is…".
 */
export const moduleName = (t: Translate, module: ModuleCode): string | null =>
  loadedMessage(t, `nav.module.${module}`);

/** "Library only", or "One feature only" when the module has no name here. */
export const moduleOnly = (t: Translate, module: ModuleCode): string => {
  const name = moduleName(t, module);
  return name
    ? t('calendar.closures.moduleOnly', { module: name })
    : t('calendar.closures.moduleOnlyGeneric');
};

/** The range the screen reads: today and the next twelve months (FRD §2). */
export const nextTwelveMonths = (todayIso: string): { from: string; to: string } => {
  const [year, month, day] = todayIso.split('-').map(Number);
  const end = new Date(Date.UTC((year ?? 1970) + 1, (month ?? 1) - 1, day ?? 1));
  return { from: todayIso, to: end.toISOString().slice(0, 10) };
};
