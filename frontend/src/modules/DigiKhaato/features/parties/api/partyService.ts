import { API_PATHS } from 'src/api/APIPaths';
import { api, ubConfig } from 'src/api/AxiosInstances';
import { toQueryString } from 'src/utils/queryString';

import type {
  CreditCheck,
  Party,
  PartyApiRow,
  PartyDetail,
  PartyDetailResult,
  PartyFormValues,
  PartyListParams,
  PartyListResult,
  PartySaveResult,
} from '../types/party.types';

/**
 * Part 19 §19.3.4 — the service layer: one exported async function per
 * endpoint, owning the snake_case ⇄ camelCase mapping, the query string and the
 * response typing, returning domain objects rather than `AxiosResponse`.
 *
 * No React, no Redux, no `Ub*`, no `react-intl`.
 */

// ── Wire shapes (snake_case, exactly as Part 22 §22.4 documents them) ────────

interface PartyListApiResponse {
  readonly data: readonly PartyApiRow[];
  readonly meta: {
    readonly page: number;
    readonly page_size: number;
    readonly total: number;
    readonly total_pages: number;
    /**
     * The header figures for the whole FILTERED set (Part 22 §22.4).
     *
     * Nested, and it was read flat — `totals_receivable` / `totals_payable` —
     * which is a shape the endpoint has never sent. The consequence was not an
     * error anywhere: the destructure produced `undefined`, the "both or
     * neither" branch below fell through to the page-sum fallback, and the
     * screen showed the twenty-five rows' sum under the caption "From the 25
     * customers on this page". Correct, legible, and not the number the
     * merchant opened the screen for. Nothing failed because the fallback is
     * real and says what it is.
     *
     * Still OPTIONAL, and that is not leftover defensiveness: this client is
     * deployed separately from the API it talks to, so a frontend that ships
     * ahead of the backend gets a `meta` without this key, and the honest page
     * sum is better than `undefined` formatted as "₹NaN".
     */
    readonly totals?: {
      readonly receivable: string;
      readonly payable: string;
      /**
       * The same number as `meta.total`, computed in the same scan. Read
       * rather than ignored so the two can be checked against each other —
       * see `listParties`.
       */
      readonly count: number;
      /**
       * PTY-06 FR-12 — how many of the matched parties are past their limit.
       *
       * Optional for the same reason the block around it is: this client
       * deploys separately from the API, and a frontend that ships ahead of a
       * backend gets a `totals` without the key. Absent then means "not
       * counted", which the list treats as "do not draw the chip" — the honest
       * reading, because a chip that appears with no number behind it is a
       * control whose only outcome is a list nobody asked for.
       */
      readonly over_limit?: number;
    };
  };
}

/**
 * Maps one wire row to the domain shape.
 *
 * Money stays a STRING on purpose (R-TS-7). `UbAmount` and `view-model/*` parse
 * with decimal.js-light when they need maths.
 */
const toParty = (row: PartyApiRow): Party => ({
  id: row.id,
  name: row.name,
  displayCode: row.display_code,
  mobile: row.mobile,
  isCustomer: row.is_customer,
  isSupplier: row.is_supplier,
  balance: row.balance,
  status: row.status,
  lastActivityAt: row.last_activity_at,
  /* `?? []` because a server older than this client sends no `tags` key. An
     absent key and an untagged party render identically, which is the one
     place a default is honest: both mean "no chips on this row". */
  tags: (row.tags ?? []).map((tag) => ({ id: tag.id, name: tag.name, color: tag.color })),
});

/**
 * The list's FILTERS as a query string — shared by the list request and its
 * CSV export (IMP-02 BR-1: the file is the screen). Pagination is passed by
 * the list alone, because an export is every matching row.
 */
const partyFilterQuery = (
  params: PartyListParams
): Record<string, string | number | undefined> => ({
  q: params.q || undefined,
  status: params.status,
  // `|| undefined` on all three, because `toQueryString` drops undefined and
  // the URL is this request's IDENTITY. `?balance=` and no `balance` are two
  // spellings of one request: `partyListWarmup` claims a speculative fetch by
  // comparing the arguments that produced it, and FR-15's cache keys a page
  // by its filter signature — so two spellings mean a warm request that is
  // never claimed and a cache that never hits itself.
  //
  // Not because the server refuses it. Checked against the running API:
  // `?balance=` returns 200 and an unfiltered list, because django-filter
  // treats an empty value as an absent one. An earlier version of this
  // comment claimed a 400.
  type: params.type || undefined,
  balance: params.balance || undefined,
  collection: params.collection || undefined,
  tag: params.tag || undefined,
  credit: params.credit || undefined,
  ordering: params.ordering,
});

/**
 * IMP-02 — the list's own path with its current filters, for the Export
 * button. Built HERE because this module is the one allowed to name
 * `API_PATHS.PARTIES` (the party-fetch lint rule), and a second copy of the
 * filter mapping is how an export stops matching its screen.
 */
export const partyExportPath = (params: PartyListParams): string =>
  `${API_PATHS.PARTIES}${toQueryString(partyFilterQuery(params))}`;

/**
 * GET /parties — page-paginated list (Part 32 S0-70's read-only endpoint).
 *
 * CR-2026-09-19-E, DOCUMENTED EXCEPTION — a whole-page failure keeps its
 * in-page error state, so this request sets `suppressErrorSnackbar`. This is a
 * WHOLE-PAGE read: when it fails there is nothing on the screen but the
 * failure, so `PartyListPageContent` renders it in place, with the request id
 * and a Try again. A toast would say the same thing and then disappear,
 * leaving an empty screen with no explanation of why it is empty. BrandHub has
 * the same flag, for the same kind of case ("calls that present the API's
 * message in their own UI").
 */
export const listParties = async (
  params: PartyListParams,
  signal?: AbortSignal
): Promise<PartyListResult> => {
  const query = toQueryString({
    ...partyFilterQuery(params),
    page: params.page,
    page_size: params.pageSize,
  });

  const response = await api.get<PartyListApiResponse>(
    `${API_PATHS.PARTIES}${query}`,
    ubConfig({ signal, suppressErrorSnackbar: true })
  );

  const { totals } = response.data.meta;

  const rows = response.data.data.map(toParty);

  return {
    rows,
    meta: {
      page: response.data.meta.page,
      pageSize: response.data.meta.page_size,
      total: response.data.meta.total,
      totalPages: response.data.meta.total_pages,
    },
    // The whole block or none of it: half a total is worse than none, because
    // the screen would show one server figure beside one page figure and label
    // them the same way. `totals.count` is deliberately not carried into the
    // result — `meta.total` already holds it and the server computes both from
    // one scan, so a second copy in the store is a second thing that can be
    // stale. It is read off the wire so that the day they disagree, the shape
    // says they were meant to agree.
    //
    // `totalsScope` says which of the two this is, because a merchant told
    // "₹2,40,000 receivable" has to know whether that is their book or the
    // twenty-five rows in front of them. The PAGE SUM itself is computed on the
    // screen, not here and not in the reducer — see `partyListSlice`.
    ...(totals
      ? {
          totals: { receivable: totals.receivable, payable: totals.payable },
          totalsScope: 'filtered' as const,
        }
      : { totals: null, totalsScope: 'page' as const }),
    /* `null` when the server did not send it, and that is not the same as zero:
       zero means "nobody is over", which hides the chip, and null means "this
       server does not count", which hides it too — but only one of them is a
       statement about the merchant's book. */
    overLimit: totals?.over_limit ?? null,
  };
};

// ── PTY-01 — create and edit ────────────────────────────────────────────────

interface PartyDetailApiRow extends PartyApiRow {
  readonly alt_phone: string | null;
  readonly email: string | null;
  readonly gstin: string | null;
  readonly gst_registration: string;
  readonly state_code: string | null;
  readonly notes: string;
  readonly collection_date: string | null;
  readonly credit_limit: string | null;
  readonly credit_days: number | null;
  readonly sms_opt_in: boolean;
  readonly consent_source: string | null;
  readonly billing_address: Record<string, string>;
  readonly opening_balance_amount: string | null;
  readonly opening_balance_direction: string | null;
  readonly opening_balance_as_of: string | null;
  readonly created_at: string;
  /** A2 — additive, and absent unless they mean something (see `PartyDetail`). */
  readonly loan_balance?: string;
  readonly trade_balance?: string;
  readonly deposit_held?: string;
}

interface PartySaveApiResponse {
  readonly data: PartyDetailApiRow;
  readonly meta?: {
    readonly warnings?: readonly {
      readonly code: string;
      readonly field?: string;
      readonly gstin_state_code?: string;
      readonly state_code?: string;
    }[];
  };
}

const toPartyDetail = (row: PartyDetailApiRow): PartyDetail => ({
  ...toParty(row),
  altPhone: row.alt_phone,
  email: row.email,
  gstin: row.gstin,
  gstRegistration: row.gst_registration,
  stateCode: row.state_code,
  notes: row.notes,
  collectionDate: row.collection_date,
  creditLimit: row.credit_limit,
  creditDays: row.credit_days,
  smsOptIn: row.sms_opt_in,
  consentSource: row.consent_source,
  billingAddress: row.billing_address ?? {},
  openingAmount: row.opening_balance_amount,
  openingDirection: row.opening_balance_direction,
  openingAsOf: row.opening_balance_as_of,
  createdAt: row.created_at,
  /* A2 — spread only when sent, so an absent figure stays absent rather than
     becoming an `undefined` key a `?? '0.00'` would turn into a fact. */
  ...(row.loan_balance != null ? { loanBalance: row.loan_balance } : {}),
  ...(row.trade_balance != null ? { tradeBalance: row.trade_balance } : {}),
  ...(row.deposit_held != null ? { depositHeld: row.deposit_held } : {}),
});

const toSaveResult = (body: PartySaveApiResponse): PartySaveResult => ({
  party: toPartyDetail(body.data),
  warnings: (body.meta?.warnings ?? []).map((warning) => ({
    code: warning.code,
    field: warning.field,
    gstinStateCode: warning.gstin_state_code,
    stateCode: warning.state_code,
  })),
});

/**
 * The wire body. Empty strings become `undefined` rather than `""`, because the
 * two mean different things to the server: a missing key leaves a column alone,
 * and `""` is a value that fails an email or a date field's own validation. The
 * form cannot hold `null` — an uncontrolled input is a React warning — so the
 * translation happens here, once, instead of in every field.
 */
const toWireBody = (values: PartyFormValues, { create }: { create: boolean }) => {
  const text = (value: string | null | undefined) => (value?.trim() ? value.trim() : undefined);
  const address = {
    ...(text(values.billingLine1) ? { line1: text(values.billingLine1) } : {}),
    ...(text(values.billingCity) ? { city: text(values.billingCity) } : {}),
    ...(text(values.billingPincode) ? { pincode: text(values.billingPincode) } : {}),
  };

  return {
    name: values.name.trim(),
    is_customer: values.isCustomer,
    is_supplier: values.isSupplier,
    mobile: text(values.mobile),
    alt_phone: text(values.altPhone),
    email: text(values.email),
    display_code: text(values.displayCode),
    gstin: text(values.gstin),
    state_code: text(values.stateCode),
    notes: values.notes.trim(),
    credit_limit: text(values.creditLimit),
    credit_days: text(values.creditDays) ? Number(values.creditDays) : undefined,
    collection_date: text(values.collectionDate),
    sms_opt_in: values.smsOptIn,
    consent_source: text(values.consentSource),
    /* PTY-05. ALWAYS sent, including as an empty array, and the two halves of
       that are different rules.
 
       Always, because on PATCH the server REPLACES the set when the key is
       present and leaves it alone when it is absent (FR-4) — so a merchant who
       takes the last chip off a party and saves has to send `tags: []`, or the
       removal is a no-op and the chip is back on the next render.
 
       Names rather than ids, because the picker creates inline: the server
       resolves an unknown name to a new tag inside the party's own transaction,
       so a save that fails leaves no orphan tag behind.
 
       This key was missing entirely for a while. The chips rendered, the form
       validated, the party saved with a 201 — and every tag a merchant put on
       the form was dropped on the way to the wire, which is the whole of FRD
       §6's primary flow doing nothing. Nothing failed, which is why it took
       reading a request body to find. */
    tags: values.tags.map((name) => name.trim()).filter(Boolean),
    ...(Object.keys(address).length > 0 ? { billing_address: address } : {}),
    // Create only. PATCH does not accept these at all — the server's update
    // serializer does not have the fields, so sending them would be a lie the
    // client told itself.
    ...(create && text(values.openingAmount)
      ? {
          opening_balance_amount: values.openingAmount,
          opening_balance_direction: values.openingDirection,
          ...(text(values.openingAsOf) ? { opening_balance_as_of: values.openingAsOf } : {}),
        }
      : {}),
  };
};

/**
 * POST /parties.
 *
 * `Idempotency-Key` is mandatory — `API_PATHS.PARTIES` is on
 * `IDEMPOTENT_POST_PATHS` — and is minted ONCE per logical save by the caller,
 * so a retry after a lost response replays the party that was created rather
 * than adding a second one. A party with no mobile has no uniqueness backstop
 * at all, which makes the key the only protection there is.
 *
 * The snackbar is left on: a failed save is a thing that happened to an action
 * the merchant just took, and the form shows the field errors itself.
 */
export const createParty = async (
  values: PartyFormValues,
  idempotencyKey: string
): Promise<PartySaveResult> => {
  const response = await api.post<PartySaveApiResponse>(
    API_PATHS.PARTIES,
    toWireBody(values, { create: true }),
    ubConfig({ headers: { 'Idempotency-Key': idempotencyKey } })
  );
  return toSaveResult(response.data);
};

/** PATCH /parties/{id}. No idempotency key: an edit is already idempotent. */
export const updateParty = async (
  id: string,
  values: PartyFormValues
): Promise<PartySaveResult> => {
  const response = await api.patch<PartySaveApiResponse>(
    API_PATHS.PARTY(id),
    toWireBody(values, { create: false }),
    ubConfig({})
  );
  return toSaveResult(response.data);
};

// ── PTY-03 — the khata page ─────────────────────────────────────────────────

/**
 * `GET /parties/{id}`'s envelope.
 *
 * `summary` and `credit` are OPTIONAL in this type, and that is a statement
 * about the server rather than caution: `credit` is omitted entirely for a
 * party with no credit limit, because a party with no limit has no usage bar
 * to draw and `{limit: null, used: "0.00", available: null}` is three fields
 * saying one thing. `summary` carries `balance` and nothing else today — the
 * other figures FRD §14 lists are about ledger entries, invoices and payments,
 * and the ledger app has no tables yet. They are absent rather than zero, so
 * that a client cannot render a placeholder as a fact.
 */
interface PartyDetailApiResponse {
  readonly data: PartyDetailApiRow & {
    readonly summary?: { readonly balance: string };
    readonly credit?: {
      readonly limit: string;
      readonly days: number | null;
      readonly exposure: string;
      readonly available: string;
      readonly over_by: string;
      readonly usage_pct: number | null;
      readonly mode: 'off' | 'warn' | 'block';
      readonly status: 'over' | 'near' | 'ok';
    };
  };
}

/**
 * The khata page's one read.
 *
 * `suppressErrorSnackbar` for the same reason the list has it (CR-2026-09-19-E):
 * this is a WHOLE-PAGE fetch, so when it fails there is nothing on screen but
 * the failure and the page renders it in place, with the request id and a Try
 * again. A toast would say the same thing and then disappear, leaving an empty
 * screen with no explanation.
 */
export const getParty = async (id: string, signal?: AbortSignal): Promise<PartyDetailResult> => {
  const response = await api.get<PartyDetailApiResponse>(
    API_PATHS.PARTY(id),
    ubConfig({ signal, suppressErrorSnackbar: true })
  );
  const { summary, credit } = response.data.data;
  return {
    party: toPartyDetail(response.data.data),
    /* Falling back to the party's own balance rather than to a zero: the two
       are the same column, and a `summary` the server did not send is a server
       that is older than this client, not a party who owes nothing. */
    summary: { balance: summary?.balance ?? response.data.data.balance },
    credit: credit
      ? {
          limit: credit.limit,
          days: credit.days,
          exposure: credit.exposure,
          available: credit.available,
          overBy: credit.over_by,
          usagePct: credit.usage_pct,
          mode: credit.mode,
          status: credit.status,
        }
      : null,
  };
};

/**
 * The collection date, on its own — the khata page's single editable control.
 *
 * A dedicated call rather than `updateParty`, which takes the whole
 * `PartyFormValues` and would need the page to hold a form it does not have.
 * Sending one field also means a concurrent edit in the PTY-01 drawer cannot be
 * clobbered by a stale copy of the other twenty.
 *
 * `null` clears the promise, and it is sent as `null` rather than omitted:
 * an absent key leaves the column alone, which is the opposite of what
 * "clear this date" means.
 */
export const setCollectionDate = async (
  id: string,
  collectionDate: string | null
): Promise<PartyDetail> => {
  const response = await api.patch<PartySaveApiResponse>(
    API_PATHS.PARTY(id),
    { collection_date: collectionDate },
    ubConfig({})
  );
  return toPartyDetail(response.data.data);
};

// ── PTY-04 — archive and restore ────────────────────────────────────────────

/**
 * `POST /parties/{id}/archive`.
 *
 * A POST on a sub-path rather than a DELETE, and that is the shape of the
 * feature rather than a style choice: a party is never deleted, because
 * deleting one would destroy the ledger behind it. The API exposes no DELETE
 * for a party at all, so there is no verb a client can reach for that would
 * mean "remove this".
 *
 * `reason` is optional and capped at a sentence. It is stored on the audit row
 * and not on the party — it explains a decision, not a record.
 *
 * ── The caller mints the key, and the reason is subtle ─────────────────────
 * `Idempotency-Key` protects the case canon rule 5 is about: the response is
 * lost on a 2G link and the merchant presses again, and without a key the
 * second attempt answers 409 `party_already_archived` for something that
 * worked. The key has to be stable across RETRIES OF ONE INTENT and different
 * between two intents — so it is minted once when the confirm dialog opens,
 * not here and not per press. A key derived from the party id would be stable
 * forever, and a merchant who archived, restored and archived again would have
 * the second archive answered with a replay of the first and no state change
 * at all; a fresh key per call would protect nothing, because the lost-response
 * retry is a second call.
 */
export interface ArchiveWriteOff {
  /** Why the money is being written off — 3 to 160 characters, required. */
  readonly reason: string;
  /** ISO date; the server defaults to today in the tenant's timezone. */
  readonly entryDate?: string;
  /**
   * The amount the merchant CONFIRMED — the figure the dialog showed beside
   * "I understand this money is written off". The server writes off the
   * balance it reads under the row lock and refuses 409 `balance_changed`
   * when the two differ, so a payment that lands between the dialog and the
   * press cannot turn a ₹2,300 write-off into a ₹2,800 one.
   */
  readonly amount: string;
}

export const archiveParty = async (
  id: string,
  reason: string,
  idempotencyKey: string,
  writeOff?: ArchiveWriteOff
): Promise<PartyDetail> => {
  const body: Record<string, unknown> = reason ? { reason } : {};
  if (writeOff) {
    body.write_off = {
      reason: writeOff.reason.trim(),
      amount: writeOff.amount,
      ...(writeOff.entryDate ? { entry_date: writeOff.entryDate } : {}),
    };
  }
  const response = await api.post<PartySaveApiResponse>(
    API_PATHS.PARTY_ARCHIVE(id),
    body,
    ubConfig({ headers: { 'Idempotency-Key': idempotencyKey } })
  );
  return toPartyDetail(response.data.data);
};

/**
 * `POST /parties/{id}/restore`. No body, and no guard beyond being archived.
 *
 * A key is still sent, because the interceptor requires one under `/parties`
 * and would otherwise mint its own and warn. It buys less here than on archive:
 * a replayed restore on an already-active party answers 409 `party_not_archived`,
 * which is the truth and costs nothing — the party is active, which is what the
 * caller wanted.
 */
export const restoreParty = async (id: string, idempotencyKey: string): Promise<PartyDetail> => {
  const response = await api.post<PartySaveApiResponse>(
    API_PATHS.PARTY_RESTORE(id),
    {},
    ubConfig({ headers: { 'Idempotency-Key': idempotencyKey } })
  );
  return toPartyDetail(response.data.data);
};

export interface BulkArchiveSkip {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  /** Decimal string, or `null` for an id the server could not find. */
  readonly balance: string | null;
}

export interface BulkArchiveResult {
  readonly archived: readonly string[];
  readonly skipped: readonly BulkArchiveSkip[];
}

interface BulkArchiveApiResponse {
  readonly data: {
    readonly archived: readonly string[];
    readonly skipped: readonly BulkArchiveSkip[];
  };
  readonly meta: { readonly archived_count: number; readonly skipped_count: number };
}

/**
 * `POST /parties/bulk-archive` — partial success in a 200 envelope.
 *
 * The response names who was skipped and what they owe, because a merchant who
 * selected thirty and archived twenty-six needs to know which four and why. A
 * status code cannot carry that, which is why this is a 200 with a body rather
 * than a 207.
 */
export const bulkArchiveParties = async (
  ids: readonly string[],
  reason: string,
  idempotencyKey: string
): Promise<BulkArchiveResult> => {
  const response = await api.post<BulkArchiveApiResponse>(
    `${API_PATHS.PARTIES}/bulk-archive`,
    { ids: [...ids], ...(reason ? { reason } : {}) },
    ubConfig({ headers: { 'Idempotency-Key': idempotencyKey } })
  );
  return { archived: response.data.data.archived, skipped: response.data.data.skipped };
};

// ── PTY-06 — the credit limit's pre-flight ──────────────────────────────────

interface CreditCheckApiResponse {
  readonly data: {
    readonly status: 'ok' | 'warn' | 'block';
    readonly mode: 'off' | 'warn' | 'block';
    readonly limit: string | null;
    readonly exposure_before: string;
    readonly exposure_after: string;
    readonly available_before: string | null;
    readonly over_by: string;
    readonly can_override: boolean;
  };
}

/**
 * `GET /parties/{id}/credit-check?amount=…` — would this amount cross the limit?
 *
 * ── It is ADVISORY, and that is the whole design ──────────────────────────
 * FR-8. The authoritative check runs inside the write transaction, after the
 * party row is locked (BR-2), so a stale answer from here cannot let anything
 * through — it never had the power to allow anything. What it buys is that the
 * merchant is told BEFORE they finish the bill rather than after, which is the
 * difference between a rule that helps and a rule that wastes their typing.
 *
 * `suppressErrorSnackbar`, and this one is not the usual whole-page argument.
 * §9's "Error" state says it out loud: when the pre-flight fails, no dialog is
 * shown and the write PROCEEDS, because a slow or broken network must not stop
 * somebody billing. The server's own check then applies. A toast about a
 * background question the merchant never asked would be noise in the middle of
 * a sale.
 */
export const creditCheck = async (
  id: string,
  amount: string,
  operation: 'entry' | 'invoice' = 'entry',
  signal?: AbortSignal
): Promise<CreditCheck> => {
  const query = toQueryString({ amount, operation });
  const response = await api.get<CreditCheckApiResponse>(
    `${API_PATHS.PARTY_CREDIT_CHECK(id)}${query}`,
    ubConfig({ signal, suppressErrorSnackbar: true })
  );
  const { data } = response.data;
  return {
    status: data.status,
    mode: data.mode,
    limit: data.limit,
    exposureBefore: data.exposure_before,
    exposureAfter: data.exposure_after,
    availableBefore: data.available_before,
    overBy: data.over_by,
    canOverride: data.can_override,
  };
};
