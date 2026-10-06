/**
 * The filter pattern (owner-approved 6 Oct 2026, "do what you recommended"):
 * a screen DESCRIBES its filters once, as specs, and the same description
 * drives the inline dropdown, the Filters drawer and the active-filter pills.
 *
 * Values are strings throughout, because they live in the address bar: `''`
 * is "any", a multi filter is a comma list, a date range is two keys.
 */
export interface UbFilterOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
  /** Why it is disabled, or a count — shown small beside the label. */
  readonly hint?: string;
}

interface SpecBase {
  readonly key: string;
  /** The filter's name: "Status", "Customer", "Show by". */
  readonly label: string;
}

/** One choice of many; `''` is "any", labelled by `anyLabel`. */
export interface UbFilterSingleSpec extends SpecBase {
  readonly kind: 'single';
  readonly options: readonly UbFilterOption[];
  /** The label of the "no filter" choice ("All"). Omit when a value is always chosen. */
  readonly anyLabel?: string;
}

/** Any number of choices, OR'd; the value is a comma list. */
export interface UbFilterMultiSpec extends SpecBase {
  readonly kind: 'multi';
  readonly options: readonly UbFilterOption[];
}

/** A from–to pair of ISO dates under two keys. */
export interface UbFilterDateRangeSpec extends SpecBase {
  readonly kind: 'dateRange';
  readonly fromKey: string;
  readonly toKey: string;
  readonly fromLabel: string;
  readonly toLabel: string;
  readonly max?: string;
}

export type UbFilterSpec = UbFilterSingleSpec | UbFilterMultiSpec | UbFilterDateRangeSpec;

export type UbFilterValues = Readonly<Record<string, string>>;
