import type { PageMeta } from 'src/types/api.types';
import type { PartyStatus } from 'src/types/domain.types';

/**
 * Part 19 §19.2.3 — the feature's own types. Money is a STRING here and
 * everywhere below it (R-TS-7): `balance` is `numeric(14,2)` server-side and
 * turning it into a JS number at the boundary is how rounding bugs get in.
 *
 * Sprint 0's walking skeleton (Part 32 S0-71) reads the list and nothing else;
 * PTY-02 proper is Sprint 3 and grows these shapes rather than replacing them.
 */

/** The wire row, snake_case, exactly as Part 22 §22.4 documents it. */
export interface PartyApiRow {
  readonly id: string;
  readonly name: string;
  readonly display_code: string | null;
  readonly mobile: string | null;
  readonly is_customer: boolean;
  readonly is_supplier: boolean;
  readonly balance: string;
  readonly status: PartyStatus;
  readonly last_activity_at: string | null;
}

export interface Party {
  readonly id: string;
  readonly name: string;
  readonly displayCode: string | null;
  readonly mobile: string | null;
  readonly isCustomer: boolean;
  readonly isSupplier: boolean;
  /** Decimal string. Positive: they owe the merchant. */
  readonly balance: string;
  readonly status: PartyStatus;
  readonly lastActivityAt: string | null;
}

export interface PartyListParams {
  readonly q: string;
  readonly status: PartyStatus;
  readonly ordering: string;
  readonly page: number;
  readonly pageSize: number;
}

/** Committed filter values — never the raw search input (§19.3.1). */
export type PartyListFilters = PartyListParams;

export interface PartyListResult {
  readonly rows: readonly Party[];
  readonly meta: PageMeta;
}
