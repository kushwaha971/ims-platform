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
  /**
   * A 401 with no credentials at all, as opposed to wrong ones. The server has
   * always emitted it — `exceptions.py` answers every DRF `NotAuthenticated`
   * with it and `error_codes.py` registers it as `(401, False)` — but it was
   * in neither closed registry: not in this union, and not in Part 22
   * §22.1.1's table (it appears only in the prose at §16). §22.1's own rule is
   * that the set of codes the application emits equals the set documented
   * there, so that rule was false. Adding the member here closes the client
   * half; the table is `docs/`, which this change cannot touch.
   */
  | 'unauthenticated'
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
  // PTY-04 FR-3 — the write-off escape (Part 43 CR-135).
  | 'nothing_to_write_off'
  | 'balance_changed'
  | 'party_archived'
  | 'insufficient_stock'
  | 'document_not_draft'
  | 'document_already_void'
  | 'credit_limit_exceeded'
  | 'duplicate_supplier_invoice'
  // PTY-05 — tags. Both are closed-registry codes the server mints
  // (`apps/common/error_codes.py`), and both are handled rather than merely
  // displayed: `tag_name_taken` carries `details.existing_tag_id` and becomes
  // an offer to merge, and `tag_limit_reached` points at the manager.
  | 'tag_name_taken'
  | 'tag_limit_reached'
  // LED-02 — at most one posted opening balance per party (BR-2). Handled
  // rather than merely displayed: it is the one refusal in this feature a
  // merchant can hit without doing anything wrong — two tabs, or a colleague
  // on another phone — so it is shown above the form they are looking at
  // rather than toasted over a drawer that is closing.
  | 'opening_balance_exists'
  // LED-01 — only an owner or admin may post past a blocking credit limit
  // (BR-8). A role check rather than a codename one, so the client draws the
  // override from the session's role and the server decides again on write.
  | 'override_not_allowed'
  // INV-01…INV-06 — registry codes the item master and stock posts mint.
  | 'duplicate_sku'
  | 'barcode_exists'
  | 'sku_generation_failed'
  | 'stock_nonzero'
  | 'item_archived'
  | 'item_has_movements'
  | 'item_type_locked'
  | 'opening_stock_required'
  | 'opening_exists'
  | 'unit_locked'
  | 'track_stock_not_allowed'
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
  /**
   * Part 22 §22.1 — whatever the server put in `details`, unconverted.
   *
   * This used to be typed `Record<string, readonly string[]>`, which is only
   * the `F` (field-map) envelope and only its flat case. The server also sends
   * the `D` envelope — named keys with their natural JSON types, e.g.
   * `plan_limit_reached`'s `{limit: 3, plan_code: "free", support_contact: {…}}`
   * and `login_throttled`'s `{retry_after: 900}` — and DRF nests a child
   * serializer's errors as an object, so even a 400 carries
   * `{address: {line1: […]}}`. The narrow type made three separate wrong
   * readers look safe: one called `.join()` on an object and threw, one indexed
   * `[0]` of a number and got `undefined`, one indexed `[0]` of a string and
   * got a single letter.
   *
   * `unknown` is deliberately awkward. Read it with `src/utils/errorDetails`:
   * `flattenErrorDetails` for the field map, `readDetail*` for named keys.
   */
  readonly details: Readonly<Record<string, unknown>>;
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
    readonly details?: Record<string, unknown>;
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
