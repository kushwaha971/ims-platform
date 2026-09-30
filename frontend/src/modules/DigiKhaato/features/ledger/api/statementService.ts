import { API_PATHS } from 'src/api/APIPaths';
import { absoluteApiUrl } from 'src/api/apiUrl';
import { api, ubConfig } from 'src/api/AxiosInstances';
import { toQueryString } from 'src/utils/queryString';

import type {
  StatementDeposit,
  StatementDepositApi,
  StatementDepositRow,
  StatementDepositRowApi,
  StatementFilters,
  StatementPage,
  StatementRow,
  StatementRowApi,
  StatementShop,
} from '../types/statement.types';

/**
 * Part 19 §19.3.4 — LED-04's endpoint, and nothing else.
 *
 * Its own service file rather than three more functions in `ledgerService.ts`,
 * because the statement has its own response shape, its own query parameters
 * and — the reason that matters for the bundle — its own ROUTE. A file the
 * khata page does not import is a file the khata page does not download.
 */

interface StatementApiResponse {
  readonly data: {
    readonly party: {
      readonly id: string;
      readonly name: string;
      readonly mobile_masked: string | null;
    };
    readonly period: { readonly from: string | null; readonly to: string | null };
    readonly opening_balance: string;
    readonly closing_balance: string;
    readonly totals: {
      readonly debit: string;
      readonly credit: string;
      /** CR-2026-09-24-A — additive; absent from an older server. */
      readonly written_off?: { readonly debit: string; readonly credit: string };
    };
    readonly has_entries_before_opening: boolean;
    readonly rows: readonly StatementRowApi[];
  };
  readonly meta?: {
    readonly next_cursor: string | null;
    readonly has_more: boolean;
    /** A2 — the "Deposit held" block; present only when the period has a deposit line. */
    readonly deposit?: StatementDepositApi;
  };
}

const toDepositRow = (row: StatementDepositRowApi): StatementDepositRow => ({
  id: row.id,
  entryDate: row.entry_date,
  entryType: row.entry_type,
  direction: row.direction,
  amount: row.amount,
  note: row.note ?? '',
  status: row.status,
  source: row.source
    ? {
        type: row.source.type,
        id: row.source.id,
        number: row.source.number,
        ...(row.source.adjustment ? { adjustment: true as const } : {}),
      }
    : null,
  reversesId: row.reverses_id,
  supersedesId: row.supersedes_id,
  reason: row.reason,
  ...(row.bucket ? { bucket: row.bucket } : {}),
});

const toDeposit = (deposit: StatementDepositApi): StatementDeposit => ({
  rows: deposit.rows.map(toDepositRow),
  held: deposit.held,
});

const toRow = (row: StatementRowApi): StatementRow => ({
  id: row.id,
  entryDate: row.entry_date,
  entryType: row.entry_type,
  direction: row.direction,
  // Money stays a string all the way through (R-TS-7), and `running_balance`
  // is the one that would hurt most: it is a cumulative figure, so a rounding
  // error introduced by a `Number()` here compounds down the page.
  amount: row.amount,
  note: row.note ?? '',
  status: row.status,
  runningBalance: row.running_balance,
  source: row.source
    ? {
        type: row.source.type,
        id: row.source.id,
        number: row.source.number,
        ...(row.source.adjustment ? { adjustment: true as const } : {}),
      }
    : null,
  reversesId: row.reverses_id,
  supersedesId: row.supersedes_id,
  reason: row.reason,
  ...(row.bucket ? { bucket: row.bucket } : {}),
});

/**
 * The query the server takes.
 *
 * `preset` is deliberately NOT sent. It is what the merchant chose; the dates
 * are what it resolved to, and resolving a preset twice — once on a device set
 * to UTC and once in the tenant's timezone — is how "This month" returns
 * thirty-one days on the first of the month.
 *
 * `include_corrections` is sent only when true, so the ordinary request stays
 * the ordinary URL. The server's parameter is LED-04's spelling;
 * `/ledger-entries` keeps LED-03's `include_reversed` for the same predicate,
 * which is a wart the FRDs created and renaming either now would compound.
 */
const toQuery = (
  filters: StatementFilters,
  extra: { readonly cursor?: string | null; readonly limit?: number } = {}
): string =>
  toQueryString({
    date_from: filters.dateFrom || undefined,
    date_to: filters.dateTo || undefined,
    include_corrections: filters.includeCorrections ? 'true' : undefined,
    cursor: extra.cursor || undefined,
    limit: extra.limit || undefined,
  });

export const getStatement = async (
  partyId: string,
  filters: StatementFilters,
  extra: { readonly cursor?: string | null; readonly limit?: number } = {},
  signal?: AbortSignal
): Promise<StatementPage> => {
  const response = await api.get<StatementApiResponse>(
    `${API_PATHS.PARTY_STATEMENT(partyId)}${toQuery(filters, extra)}`,
    ubConfig({ signal })
  );
  const { data, meta } = response.data;
  return {
    party: { id: data.party.id, name: data.party.name, mobileMasked: data.party.mobile_masked },
    period: data.period,
    summary: {
      openingBalance: data.opening_balance,
      closingBalance: data.closing_balance,
      totalDebit: data.totals.debit,
      totalCredit: data.totals.credit,
      ...(data.totals.written_off
        ? {
            writtenOff: {
              debit: data.totals.written_off.debit,
              credit: data.totals.written_off.credit,
            },
          }
        : {}),
      hasEntriesBeforeOpening: data.has_entries_before_opening,
      /* A2 — on the summary rather than beside it: it is a figure about the whole
         period, sent on every page exactly as the opening and closing are, so the
         slice's "write the header from every page" rule carries it too. */
      ...(meta?.deposit ? { deposit: toDeposit(meta.deposit) } : {}),
    },
    rows: data.rows.map(toRow),
    nextCursor: meta?.next_cursor ?? null,
    hasMore: Boolean(meta?.has_more),
  };
};

/**
 * FR-10 — the CSV, as a browser download.
 *
 * A plain link rather than a fetch, and that is the whole design: the server
 * streams it with a `Content-Disposition`, so the browser saves it without the
 * client ever holding five thousand rows in memory. Building a blob would undo
 * the streaming the endpoint was written for.
 *
 * It carries no `Idempotency-Key` and no body; it is a GET, and the only thing
 * this function does is compose the address.
 */
export const statementCsvUrl = (partyId: string, filters: StatementFilters): string => {
  const query = toQuery(filters);
  return absoluteApiUrl(
    `${API_PATHS.PARTY_STATEMENT(partyId)}${query}${query ? '&' : '?'}format=csv`
  );
};

// ── The letterhead (UAT D3) ─────────────────────────────────────────────────

/** `platform_tenant.address` — a closed jsonb shape whose blank keys the server drops. */
interface TenantAddressApi {
  readonly line1?: string | null;
  readonly line2?: string | null;
  readonly city?: string | null;
  readonly district?: string | null;
  readonly state?: string | null;
  readonly pincode?: string | null;
}

/** Only the three fields the letterhead reads; the serializer sends ~25. */
interface TenantCurrentApiResponse {
  readonly data: {
    readonly gstin?: string | null;
    readonly phone?: string | null;
    readonly address?: TenantAddressApi | null;
  };
}

const present = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
};

/**
 * "12 Station Road" / "Near Bus Stand" / "Nashik, Maharashtra 422001" — the way
 * an Indian address is written on a bill. The district is dropped when it
 * repeats the city, which for most towns it does.
 */
const addressLines = (address: TenantAddressApi | null | undefined): string[] => {
  if (!address) return [];
  const city = present(address.city);
  const district = present(address.district);
  const place = [city, district && district !== city ? district : null, present(address.state)]
    .filter((part): part is string => part !== null)
    .join(', ');
  const locality = [place, present(address.pincode)].filter(Boolean).join(' ');
  return [present(address.line1), present(address.line2), present(locality)].filter(
    (line): line is string => line !== null
  );
};

/**
 * `GET /tenants/current` — the shop's address, phone and GSTIN for the printed
 * statement's header (LED-04 §7.1).
 *
 * `/auth/me`'s active-tenant block has the GSTIN and the legal name but NOT the
 * address or the phone, so the session cannot supply a letterhead on its own;
 * this is the endpoint the shell is documented to read the business from, and
 * any member may read it.
 */
export const getStatementShop = async (signal?: AbortSignal): Promise<StatementShop> => {
  /* Quiet on failure: the sheet still names the shop without it, and a red
     toast about an address over a statement the merchant is reading would say
     the statement was wrong. */
  const response = await api.get<TenantCurrentApiResponse>(
    API_PATHS.TENANT_CURRENT,
    ubConfig({ signal, suppressErrorSnackbar: true })
  );
  const tenant = response.data.data;
  return {
    addressLines: addressLines(tenant.address),
    phone: present(tenant.phone),
    gstin: present(tenant.gstin),
  };
};
