/**
 * Part 19 §19.4.4 and Part 22 §22.1 — the one error shape and the two envelope
 * shapes everything above the transport layer sees.
 */

/**
 * Part 22 §22.1.1's registry, plus the transport-level codes minted on the
 * client and never sent by the server. Switch on this, never on `message`.
 */
export type ApiErrorCode =
  // cross-cutting
  | 'validation_error'
  | 'not_found'
  | 'permission_denied'
  | 'module_disabled'
  | 'plan_limit_reached'
  | 'idempotency_conflict'
  | 'idempotency_in_progress'
  | 'stale_version'
  | 'precondition_failed'
  | 'too_many_rows'
  | 'too_many_ids'
  | 'file_too_large'
  | 'image_too_large'
  | 'unsupported_file_type'
  | 'service_busy'
  | 'rate_limited'
  | 'server_error'
  // auth and session
  | 'invalid_credentials'
  | 'otp_invalid'
  | 'otp_throttled'
  | 'login_throttled'
  | 'token_stale'
  | 'invalid_token'
  | 'session_revoked'
  | 'no_active_tenant'
  | 'invitation_invalid'
  // platform and governance (Part 22 §22.1.1 group C) — the Sprint 1 subset
  | 'last_owner'
  | 'self_change_forbidden'
  | 'tenant_suspended'
  | 'gstin_in_use'
  // business
  | 'party_balance_nonzero'
  | 'party_archived'
  | 'insufficient_stock'
  | 'document_not_draft'
  | 'document_already_void'
  | 'credit_limit_exceeded'
  | 'duplicate_supplier_invoice'
  // transport-level codes minted on the client, never sent by the server:
  | 'network_error'
  | 'timeout'
  | 'offline'
  | 'unknown';

/** Non-fatal server notes returned alongside a 2xx (e.g. a credit-limit warn). */
export interface ApiWarning {
  readonly code: string;
  readonly message: string;
}

export interface ApiErrorShape {
  /** Stable machine code — switch on this, never on the message. */
  readonly code: ApiErrorCode;
  /** Human message; already localised by the server via Accept-Language. */
  readonly message: string;
  /** Field errors for 400s: { field_name: [messages] }. */
  readonly details: Readonly<Record<string, readonly string[]>>;
  /** Echo of X-Request-Id — shown to the user on error screens (R-E-4). */
  readonly requestId: string | null;
  readonly status: number | null;
  readonly warnings: readonly ApiWarning[];
}

/** The wire shape of an error envelope (Part 22 §22.1). */
export interface ServerErrorEnvelope {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
    readonly details?: Record<string, string[]>;
    readonly request_id?: string;
  };
}

/** Success envelope: `{ data, meta?, message? }`. */
export interface Envelope<TData, TMeta = unknown> {
  readonly data: TData;
  readonly meta?: TMeta;
  readonly message?: string;
}

/** Page pagination — every list (Part 22 §22.1). */
export interface PageMeta {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly totalPages: number;
}

/** Cursor pagination — ledger entries, movements, notifications. */
export interface CursorMeta {
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

/**
 * A discriminated string union, never a pair of booleans (R-TS-4).
 * `'refreshing'` exists so a background refetch keeps the old rows on screen
 * instead of flashing a skeleton.
 */
export type RequestStatus = 'idle' | 'loading' | 'refreshing' | 'succeeded' | 'failed';

/**
 * Part 19 §19.10.4 — every mutating call belongs to exactly one write class,
 * declared on its service function; `canWrite(writeClass)` is the only gate an
 * affordance consults.
 */
export type TWriteClass =
  | 'queueable' // class A — goes to the outbox in `offline`
  | 'deferred' // class B — Phase 2 promotes it; disabled in `offline` today
  | 'online-only'; // class C — never queued

/**
 * §19.10.3 — only `interactive` and `probe` requests feed the network state
 * machine; a slow background export must not put the shell into `degraded`.
 */
export type TNetworkTag = 'interactive' | 'background' | 'probe';
