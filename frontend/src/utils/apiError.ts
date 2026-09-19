/**
 * Part 19 §19.4.4 — the ONLY module that knows what an `AxiosError` looks like.
 * Everything above the transport layer sees `ApiErrorShape` and nothing else.
 */
import axios, { type AxiosError } from 'axios';

import type { ApiErrorCode, ApiErrorShape, ServerErrorEnvelope } from 'src/types/api.types';

const EMPTY_DETAILS: Readonly<Record<string, readonly string[]>> = Object.freeze({});

const freeze = (shape: ApiErrorShape): ApiErrorShape => Object.freeze(shape);

/** Errors must stay serialisable — the store and the outbox both JSON them. */
export const isApiErrorShape = (value: unknown): value is ApiErrorShape =>
  typeof value === 'object' &&
  value !== null &&
  'code' in value &&
  'message' in value &&
  'details' in value &&
  'requestId' in value;

const mapStatusToCode = (status: number): ApiErrorCode => {
  switch (status) {
    case 400:
      return 'validation_error';
    case 401:
      return 'invalid_credentials';
    case 403:
      return 'permission_denied';
    case 404:
      return 'not_found';
    case 409:
      return 'stale_version';
    case 412:
      return 'precondition_failed';
    case 429:
      return 'rate_limited';
    default:
      return status >= 500 ? 'server_error' : 'unknown';
  }
};

const defaultMessageFor = (status: number): string =>
  status >= 500 ? 'Something went wrong. Quote this reference to support.' : 'Request failed.';

/**
 * Normalises anything thrown by the transport into one shape.
 *
 * `fallbackMessageId` is the i18n key a caller wants used when the server gave
 * no message; it is carried rather than resolved here because this module is
 * below the React tree and has no `t()`.
 */
export const toApiError = (error: unknown, fallbackMessageId = 'error.generic'): ApiErrorShape => {
  if (isApiErrorShape(error)) return error; // already normalised

  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<ServerErrorEnvelope>;
    const headerId = axiosError.response?.headers?.['x-request-id'];
    const requestId =
      (typeof headerId === 'string' ? headerId : undefined) ??
      axiosError.response?.data?.error?.request_id ??
      null;

    if (!axiosError.response) {
      // §19.4.4's listing decides `offline` vs `network_error` by reading
      // `navigator.onLine` here. §25.14's lint rule reserves that read for the
      // state machine, and §19.10.3 is explicit that `navigator.onLine` is a
      // link-layer answer to a transport-layer question — so the code says what
      // this layer actually knows, and `networkSlice` owns the word "offline".
      return freeze({
        code: axiosError.code === 'ECONNABORTED' ? 'timeout' : 'network_error',
        message: 'Could not reach the server.',
        details: EMPTY_DETAILS,
        requestId,
        status: null,
        warnings: [],
      });
    }

    const body = axiosError.response.data?.error;
    return freeze({
      code: (body?.code as ApiErrorCode | undefined) ?? mapStatusToCode(axiosError.response.status),
      message: body?.message ?? defaultMessageFor(axiosError.response.status),
      details: body?.details ?? EMPTY_DETAILS,
      requestId,
      status: axiosError.response.status,
      warnings: [],
    });
  }

  return freeze({
    code: 'unknown',
    message: error instanceof Error ? error.message : String(error ?? fallbackMessageId),
    details: EMPTY_DETAILS,
    requestId: null,
    status: null,
    warnings: [],
  });
};

/**
 * §19.4.3 — the error classes that always have a better local presentation than
 * a toast. Everything else toasts, so no failure is ever silent.
 *
 * This list IS the fourth of the transport's four documented exceptions
 * (CR-2026-09-19-E — see the comment on the toast decision in
 * src/api/AxiosInstances.ts). Adding a code here is a claim that some other
 * surface already says this, in a better place, and that a toast would
 * therefore say it twice. Each case below names that surface.
 */
const LOCALLY_PRESENTED: ReadonlySet<ApiErrorCode> = new Set<ApiErrorCode>([
  // CASE 1 — field-level validation. `details` is a map of field → messages
  // and `applyServerErrors` puts each one under the control that caused it. A
  // toast saying "Please check the highlighted fields" with nothing highlighted
  // is the worst of both.
  'validation_error',

  // CASE 2 — a wrong email or password. PLT-02 AC-5 requires ONE message,
  // under the password field, for both a bad password and an address nobody
  // has; a toast beside it would be a second, differently-worded report of the
  // same event, and a toast that named the address would enumerate users.
  'invalid_credentials',

  // CASE 3 — the login/reset lockout. The screen shows a countdown banner
  // and the submit is disabled until it runs out, which is information a toast
  // cannot carry because it disappears before the countdown does.
  'login_throttled',
  'otp_throttled',
  'rate_limited',

  // CASE 4 — a spent, expired or forged reset link. The reset screen is a
  // dead end after this: the form on it can never succeed. A toast would fade
  // and leave the merchant retyping a password into a form that is already
  // finished, so that screen keeps its in-page banner and the way out beneath
  // it (the same reasoning as a list that could not load at all).
  'invalid_token',

  // CASE 5 — "a business must always have one owner". The leave-business
  // confirm dialog (`TenantSwitcherMenu`) swaps its body copy for this message,
  // because it is guidance shown at the moment of the act, not a report of a
  // failure after it.
  'last_owner',

  // Business errors whose own surface carries the number that matters — the
  // credit limit, the stock on hand, the version that moved.
  'credit_limit_exceeded',
  'insufficient_stock',
  'stale_version',
  'document_not_draft',
  'idempotency_conflict',
]);

export const shouldToast = (error: ApiErrorShape): boolean => !LOCALLY_PRESENTED.has(error.code);

/**
 * CR-2026-09-19-E — the codes minted on the CLIENT carry no server copy, so
 * their `message` is a hardcoded English sentence from `toApiError` above.
 * Those must reach the snackbar as an i18n key for the host to resolve; a
 * server-sent message is already localised via `Accept-Language` and is passed
 * through untouched. Returning `null` means "use `error.message`".
 */
const CLIENT_MINTED_MESSAGE_ID: Partial<Record<ApiErrorCode, string>> = {
  network_error: 'error.network',
  timeout: 'error.timeout',
  offline: 'common.network.offline',
};

export const errorMessageId = (error: ApiErrorShape): string | null =>
  CLIENT_MINTED_MESSAGE_ID[error.code] ?? (error.message ? null : 'error.generic');

/** §19.4.4 — `details` feeds `setError`; snake_case keys become RHF paths. */
export const fieldErrorEntries = (
  error: ApiErrorShape
): readonly { readonly field: string; readonly message: string }[] =>
  Object.entries(error.details).flatMap(([field, messages]) =>
    messages.length > 0 && messages[0] !== undefined
      ? [
          {
            field: field.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase()),
            message: messages[0],
          },
        ]
      : []
  );
