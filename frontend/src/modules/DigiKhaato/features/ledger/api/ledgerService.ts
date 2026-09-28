import { API_PATHS } from 'src/api/APIPaths';
import { api, ubConfig } from 'src/api/AxiosInstances';
import { toQueryString } from 'src/utils/queryString';

import type {
  LedgerCorrectionResult,
  LedgerCorrectionValues,
  LedgerEntry,
  LedgerEntryApiRow,
  LedgerEntryFormValues,
  LedgerEntryPostResult,
  LedgerPage,
  LedgerWarning,
} from '../types/ledger.types';

/**
 * Part 19 §19.3.4 — the service layer: one exported async function per
 * endpoint, owning the snake_case ⇄ camelCase mapping, the query string and the
 * response typing, returning domain objects rather than `AxiosResponse`.
 *
 * No React, no Redux, no `Ub*`, no `react-intl`.
 */

// ── Wire shapes (snake_case, exactly as Part 22 §22.5 documents them) ────────

interface LedgerListApiResponse {
  readonly data: readonly LedgerEntryApiRow[];
  readonly meta: {
    readonly next_cursor: string | null;
    readonly has_more: boolean;
    /**
     * First page only. Absent on page two and after, because the figures do not
     * change as the merchant scrolls and re-aggregating a party's whole history
     * per page would undo the reason the endpoint is cursor-paged at all.
     *
     * Optional for the other reason too: this client deploys separately from
     * its API, so a frontend that ships ahead of the backend gets a `meta`
     * without the key, and a header that draws nothing is better than one that
     * draws `NaN`.
     */
    readonly summary?: {
      readonly total_debit: string;
      readonly total_credit: string;
      /** CR-2026-09-24-A — additive; absent from an older server. */
      readonly written_off?: { readonly debit: string; readonly credit: string };
      readonly entry_count: number;
    };
  };
}

interface LedgerCorrectionApiResponse {
  readonly data: LedgerEntryApiRow;
  readonly meta?: {
    readonly party_balance?: string;
    readonly original_id?: string;
    readonly reversal_id?: string;
  };
}

/** The detail read, which carries the whole correction chain (LED-03 FR-8). */
interface LedgerEntryDetailApiResponse {
  readonly data: LedgerEntryApiRow & { readonly history?: readonly LedgerEntryApiRow[] };
}

interface LedgerEntryApiResponse {
  readonly data: LedgerEntryApiRow;
  readonly meta?: {
    readonly party_balance?: string;
    readonly warnings?: readonly {
      readonly code: string;
      readonly limit: string | null;
      readonly balance_after: string;
      readonly over_by: string;
    }[];
  };
}

// ── Mappers, hand-written, one per shape ────────────────────────────────────

const toEntry = (row: LedgerEntryApiRow): LedgerEntry => ({
  id: row.id,
  partyId: row.party_id,
  direction: row.direction,
  // `amount` stays a string all the way through (R-TS-7). There is no
  // `Number(row.amount)` in this file and there must never be one.
  amount: row.amount,
  entryDate: row.entry_date,
  entryType: row.entry_type,
  sourceType: row.source_type,
  sourceId: row.source_id,
  note: row.note ?? '',
  paymentMode: row.payment_mode,
  upiApp: row.upi_app ?? null,
  reference: row.reference ?? '',
  status: row.status,
  reversedById: row.reversed_by_id,
  reversesId: row.reverses_id,
  supersedesId: row.supersedes_id,
  reason: row.reason,
  createdBy: row.created_by ? { id: row.created_by.id, name: row.created_by.name } : null,
  createdAt: row.created_at,
  /* CR-027. Spread only when present, so a row from a 201 (which carries no
     running balance) has no key rather than a `null` that reads like a value. */
  ...(row.running_balance != null ? { runningBalance: row.running_balance } : {}),
  /* LED-10 FR-5 — only a document-sourced row carries one. */
  ...(row.source
    ? {
        source: {
          type: row.source.type,
          id: row.source.id,
          number: row.source.number,
          status: row.source.status ?? null,
          kind: row.source.kind ?? null,
        },
      }
    : {}),
});

const toWarning = (warning: {
  code: string;
  limit: string | null;
  balance_after: string;
  over_by: string;
}): LedgerWarning => ({
  code: warning.code,
  limit: warning.limit,
  balanceAfter: warning.balance_after,
  overBy: warning.over_by,
});

/**
 * The POST body.
 *
 * `payment_mode` and `reference` are sent only for a credit, which mirrors what
 * the server does with them (EC-9: it nulls them for a debit silently, because
 * the client keeps the typed value in form state so switching direction back
 * does not lose it). Sending them anyway would work — the server drops them —
 * and would put a UTR in the request log against money that went out by no
 * method at all.
 *
 * `amount` is passed through untouched. It has already been through the form's
 * own `parseAmountInput`; a second normalisation here would be a second place
 * for the rounding rule to live.
 */
const toWireBody = (values: LedgerEntryFormValues): Record<string, unknown> => {
  const isCredit = values.direction === 'credit';
  return {
    direction: values.direction,
    amount: values.amount,
    entry_date: values.entryDate,
    note: values.note.trim(),
    ...(isCredit
      ? {
          payment_mode: values.paymentMode || undefined,
          // The app only rides with UPI; for any other mode it is form state
          // left over from a chip the merchant tapped and moved off.
          upi_app: values.paymentMode === 'upi' ? values.upiApp || undefined : undefined,
          reference: values.reference.trim() || undefined,
        }
      : {}),
  };
};

// ── The endpoints ───────────────────────────────────────────────────────────

/**
 * One page of a party's khata, newest first.
 *
 * `cursor` rather than a page number: §20.14.3 chose a keyset here so a party
 * a shop has traded with daily for three years costs the same to open as one
 * they met last week.
 *
 * `suppressErrorSnackbar` is NOT set: the timeline sits beside a header that
 * has already rendered, so a failure here is a strip inside one card rather
 * than a page that failed to load, and the merchant should be told.
 */
export const listPartyEntries = async (
  partyId: string,
  params: {
    readonly cursor?: string | null;
    readonly limit?: number;
    /**
     * LED-03 FR-7 — "Show corrections". Off by default, and the default is the
     * honest one: a khata that grew by three lines every time somebody fixed a
     * typo is one nobody can read at the counter. Sent only when true, so the
     * ordinary request stays the ordinary URL and a cached one is not missed
     * over a `?include_reversed=false` nobody needed.
     */
    readonly includeReversed?: boolean;
  } = {},
  signal?: AbortSignal
): Promise<LedgerPage> => {
  const query = toQueryString({
    cursor: params.cursor || undefined,
    limit: params.limit || undefined,
    include_reversed: params.includeReversed ? 'true' : undefined,
  });
  const response = await api.get<LedgerListApiResponse>(
    `${API_PATHS.PARTY_LEDGER_ENTRIES(partyId)}${query}`,
    ubConfig({ signal })
  );
  const summary = response.data.meta?.summary;
  return {
    rows: response.data.data.map(toEntry),
    nextCursor: response.data.meta?.next_cursor ?? null,
    hasMore: Boolean(response.data.meta?.has_more),
    summary: summary
      ? {
          totalDebit: summary.total_debit,
          totalCredit: summary.total_credit,
          ...(summary.written_off
            ? {
                writtenOff: {
                  debit: summary.written_off.debit,
                  credit: summary.written_off.credit,
                },
              }
            : {}),
          entryCount: summary.entry_count,
        }
      : null,
  };
};

/**
 * Post one entry. The most consequential write in the product.
 *
 * `idempotencyKey` is minted once per logical save by the hook and REUSED on
 * every retry (FR-12), which is what makes AC-6 safe: a merchant on a 2G
 * connection taps Save, the response is lost, they tap Save again, and the
 * server replays the first 201 instead of posting a second entry. Without it
 * that is two lines against one customer and a balance wrong by the amount of
 * the sale — the number they read out at the counter.
 *
 * `override` is a separate argument rather than a form field: it is not
 * something the merchant types, it is what "Save anyway" means, and keeping it
 * out of `LedgerEntryFormValues` stops it from ever surviving a form reset.
 */
/**
 * LED-02 FR-3 — post an opening balance for a party that has none.
 *
 * The same endpoint as an ordinary entry, with `entry_type: "opening"` — which
 * is the ONE entry type a client may name (CR-037). Everything else is derived
 * from the direction and the source, because a client that could send
 * `entry_type` freely could write a reversal with no reversal behind it.
 *
 * A separate exported function rather than a flag on `postLedgerEntry`, because
 * the two are different writes with different rules: an opening is refused when
 * one already exists, carries no payment mode and has no credit-limit check to
 * warn about. One function with a boolean would put all three differences
 * inside the caller.
 *
 * `note` is not sent. The server sets "Opening balance", in English, so the row
 * stays findable by a report or an export; the client renders its own label off
 * `entry_type` (BR-1).
 */
export const postOpeningBalance = async (
  partyId: string,
  values: {
    readonly amount: string;
    readonly direction: 'debit' | 'credit';
    readonly asOf: string;
  },
  idempotencyKey: string
): Promise<LedgerEntryPostResult> => {
  const response = await api.post<LedgerEntryApiResponse>(
    API_PATHS.PARTY_LEDGER_ENTRIES(partyId),
    {
      entry_type: 'opening',
      direction: values.direction,
      amount: values.amount,
      entry_date: values.asOf,
    },
    ubConfig({ headers: { 'Idempotency-Key': idempotencyKey } })
  );
  return {
    entry: toEntry(response.data.data),
    balance: response.data.meta?.party_balance ?? '',
    warnings: (response.data.meta?.warnings ?? []).map(toWarning),
  };
};

export const postLedgerEntry = async (
  partyId: string,
  values: LedgerEntryFormValues,
  idempotencyKey: string,
  options: { readonly override?: boolean } = {}
): Promise<LedgerEntryPostResult> => {
  const response = await api.post<LedgerEntryApiResponse>(
    API_PATHS.PARTY_LEDGER_ENTRIES(partyId),
    { ...toWireBody(values), ...(options.override ? { override: true } : {}) },
    ubConfig({ headers: { 'Idempotency-Key': idempotencyKey } })
  );
  return {
    entry: toEntry(response.data.data),
    // `?? '0.00'` rather than throwing: an older server that does not send the
    // figure should leave the header alone rather than break the save that
    // already succeeded. The slice treats it as "unknown" and refetches.
    balance: response.data.meta?.party_balance ?? '',
    warnings: (response.data.meta?.warnings ?? []).map(toWarning),
  };
};

// ── LED-03: reversing and correcting ────────────────────────────────────────

/**
 * The correction body, and the reason it is built by DIFFERENCE.
 *
 * Only the fields the merchant actually changed are sent. The server treats an
 * absent field as "as it was", so posting the whole form back would re-assert
 * five values nobody looked at — and the server would then compare them against
 * the original and, finding no change at all, refuse the correction outright
 * when the only thing edited was cleared to its old value.
 *
 * It also makes `changed_fields` in the audit row true: that list is what an
 * accountant reads to see what somebody altered, and a correction that claims
 * to have touched six fields when one was edited is a log that answers nothing.
 */
const toCorrectionBody = (
  values: LedgerCorrectionValues,
  original: LedgerEntry
): Record<string, unknown> => {
  const body: Record<string, unknown> = { reason: values.reason.trim() };
  const direction = values.direction ?? original.direction;
  if (values.direction !== undefined && values.direction !== original.direction) {
    body.direction = values.direction;
  }
  if (values.amount !== undefined && values.amount !== original.amount) {
    body.amount = values.amount;
  }
  if (values.entryDate !== undefined && values.entryDate !== original.entryDate) {
    body.entry_date = values.entryDate;
  }
  if (values.note !== undefined && values.note.trim() !== original.note) {
    body.note = values.note.trim();
  }
  /* A payment mode belongs to a credit and nothing else — the server nulls it
     for a debit anyway, and sending a UTR against money that went out by no
     method at all would put it in the request log regardless. So both of these
     are gated on the direction the entry will END UP with, not the one it had. */
  if (direction === 'credit') {
    if (values.paymentMode !== undefined && (values.paymentMode || null) !== original.paymentMode) {
      body.payment_mode = values.paymentMode || null;
    }
    if (values.reference !== undefined && values.reference.trim() !== original.reference) {
      body.reference = values.reference.trim();
    }
    /* Switching INTO a credit needs the mode even when the control was never
       touched, because the original had none to inherit and the server refuses
       a credit without one. */
    if (original.direction !== 'credit' && body.payment_mode === undefined) {
      body.payment_mode = values.paymentMode || null;
    }
    /* The app is sent only when it CHANGED and the entry will end up as UPI.
       Omitted means "as it was" on the server, which is what keeps PhonePe on
       an entry whose amount alone was corrected. Moving off UPI needs nothing:
       the server drops the app with the mode. */
    const finalMode = values.paymentMode ?? original.paymentMode ?? '';
    if (
      finalMode === 'upi' &&
      values.upiApp !== undefined &&
      (values.upiApp || null) !== original.upiApp
    ) {
      body.upi_app = values.upiApp || null;
    }
  }
  return body;
};

const toCorrectionResult = (
  response: LedgerCorrectionApiResponse,
  fallbackOriginalId: string
): LedgerCorrectionResult => ({
  entry: toEntry(response.data),
  balance: response.meta?.party_balance ?? '',
  originalId: response.meta?.original_id ?? fallbackOriginalId,
  reversalId: response.meta?.reversal_id ?? '',
});

/**
 * Undo one entry (FR-2). Returns the REVERSAL row.
 *
 * `idempotencyKey` for the same reason the post has one, and more sharply: a
 * lost response on a retried reverse would otherwise write a second reversal,
 * and the second one moves the balance again by the same amount. The server's
 * `entry_already_reversed` guard would catch it — but it answers 409, and a
 * merchant whose connection dropped would be told they had already done
 * something they never saw succeed.
 */
export const reverseLedgerEntry = async (
  entryId: string,
  reason: string,
  idempotencyKey: string
): Promise<LedgerCorrectionResult> => {
  const response = await api.post<LedgerCorrectionApiResponse>(
    API_PATHS.LEDGER_ENTRY_REVERSE(entryId),
    { reason: reason.trim() },
    ubConfig({ headers: { 'Idempotency-Key': idempotencyKey } })
  );
  return toCorrectionResult(response.data, entryId);
};

/** Replace one entry's values (FR-3). Returns the REPLACEMENT row. */
export const correctLedgerEntry = async (
  original: LedgerEntry,
  values: LedgerCorrectionValues,
  idempotencyKey: string
): Promise<LedgerCorrectionResult> => {
  const response = await api.post<LedgerCorrectionApiResponse>(
    API_PATHS.LEDGER_ENTRY_CORRECT(original.id),
    toCorrectionBody(values, original),
    ubConfig({ headers: { 'Idempotency-Key': idempotencyKey } })
  );
  return toCorrectionResult(response.data, original.id);
};

/**
 * FR-8 — the whole chain an entry belongs to, oldest first.
 *
 * A separate request rather than something the list carries, because the list
 * would have to walk fifty chains to draw fifty rows and the sheet that shows
 * one is opened one entry at a time.
 */
export const fetchEntryHistory = async (
  entryId: string,
  signal?: AbortSignal
): Promise<readonly LedgerEntry[]> => {
  const response = await api.get<LedgerEntryDetailApiResponse>(
    API_PATHS.LEDGER_ENTRY(entryId),
    ubConfig({ signal })
  );
  return (response.data.data.history ?? []).map(toEntry);
};
