import type { ModuleCode } from 'src/types/domain.types';

/**
 * A9b (PLT-X08, ADR-055) — the tenant's business-days calendar: closed weekdays
 * (0 = Monday … 6 = Sunday), per-module overrides, and dated closures.
 */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface ClosedDayApiRow {
  readonly id: string;
  readonly date: string;
  readonly reason: string;
  readonly module: ModuleCode | null;
}

export interface ClosedDay {
  readonly id: string;
  /** ISO `YYYY-MM-DD`, tenant-local. */
  readonly date: string;
  readonly reason: string;
  /** `null` closes the whole business; a module code closes only that module. */
  readonly module: ModuleCode | null;
}

export interface BusinessDays {
  readonly rows: readonly ClosedDay[];
  readonly closedWeekdays: readonly Weekday[];
  /** Only the modules that HAVE an override; the rest follow the business. */
  readonly moduleWeekdays: Readonly<Partial<Record<ModuleCode, readonly Weekday[]>>>;
  /** The enabled modules that read the calendar. */
  readonly readers: readonly ModuleCode[];
}

export interface ClosedDayDraft {
  readonly from: string;
  readonly to?: string | null;
  readonly reason: string;
  readonly module?: ModuleCode | null;
}

export interface AddedClosedDays {
  readonly rows: readonly ClosedDay[];
  readonly skippedExisting: number;
}

export interface WeekdaysDraft {
  readonly value: readonly Weekday[];
  /** A module's override list, or `null` to drop it (the module follows the business). */
  readonly modules: Readonly<Partial<Record<ModuleCode, readonly Weekday[] | null>>>;
}

export interface SavedWeekdays {
  readonly value: readonly Weekday[];
  readonly modules: Readonly<Partial<Record<ModuleCode, readonly Weekday[]>>>;
}
