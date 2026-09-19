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
 */
const LOCALLY_PRESENTED: ReadonlySet<ApiErrorCode> = new Set<ApiErrorCode>([
  'validation_error',
  'credit_limit_exceeded',
  'insufficient_stock',
  'stale_version',
  'document_not_draft',
  'idempotency_conflict',
]);

export const shouldToast = (error: ApiErrorShape): boolean => !LOCALLY_PRESENTED.has(error.code);

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
