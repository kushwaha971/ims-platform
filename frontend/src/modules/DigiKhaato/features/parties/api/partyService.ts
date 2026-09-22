import { API_PATHS } from 'src/api/APIPaths';
import { api, ubConfig } from 'src/api/AxiosInstances';
import { toQueryString } from 'src/utils/queryString';

import type {
  Party,
  PartyApiRow,
  PartyDetail,
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
     * The header figures for the whole filtered set. OPTIONAL on the wire: the
     * Sprint 0 endpoint does not send them yet, and the screen must still show
     * a header total at every width, so the absence is modelled rather than
     * assumed away.
     */
    readonly totals_receivable?: string;
    readonly totals_payable?: string;
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
});

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
    q: params.q || undefined,
    status: params.status,
    ordering: params.ordering,
    page: params.page,
    page_size: params.pageSize,
  });

  const response = await api.get<PartyListApiResponse>(
    `${API_PATHS.PARTIES}${query}`,
    ubConfig({ signal, suppressErrorSnackbar: true })
  );

  const { totals_receivable: receivable, totals_payable: payable } = response.data.meta;

  const rows = response.data.data.map(toParty);

  return {
    rows,
    meta: {
      page: response.data.meta.page,
      pageSize: response.data.meta.page_size,
      total: response.data.meta.total,
      totalPages: response.data.meta.total_pages,
    },
    // Both or neither: half a total is worse than none, because the screen
    // would show one server figure beside one page figure and label them the
    // same way.
    //
    // `totalsScope` says which of the two this is, because a merchant told
    // "₹2,40,000 receivable" has to know whether that is their book or the
    // twenty-five rows in front of them. The PAGE SUM itself is computed on the
    // screen, not here and not in the reducer — see `partyListSlice`.
    ...(receivable !== undefined && payable !== undefined
      ? { totals: { receivable, payable }, totalsScope: 'filtered' as const }
      : { totals: null, totalsScope: 'page' as const }),
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
    `${API_PATHS.PARTIES}/${id}`,
    toWireBody(values, { create: false }),
    ubConfig({})
  );
  return toSaveResult(response.data);
};
