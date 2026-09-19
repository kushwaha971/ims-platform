/**
 * Part 22 §22.1 — reading `error.details`, which is NOT one shape.
 *
 * The envelope documents two families and the server sends both:
 *
 *  - **`F` (field map).** `validation_error` — `{ field: [messages] }`, and DRF
 *    nests a child serializer under its own key, so `details.address` is
 *    `{ line1: ["This field may not be null."] }` and not an array. A list
 *    serializer nests further still: `{ lines: [{}, { qty: ["…"] }] }`.
 *  - **`D` (named keys).** `plan_limit_reached`, `login_throttled`,
 *    `rate_limited` — named keys carrying their natural JSON types, so
 *    `details.limit` is the number `3`, `details.plan_code` is the string
 *    `"free"`, `details.retry_after` is the number `900`, and
 *    `details.support_contact` is an object.
 *
 * Every previous reader in this codebase assumed exactly one of those and was
 * wrong about the other: `applyServerErrors` called `.join()` on every value
 * and threw on the first nested `details`, and `toPlanLimitHit` indexed `[0]`
 * on every value, turning `"max_users"` into `"m"` and `3` into `undefined`.
 *
 * These two helpers are the only sanctioned way to read `details`. Neither
 * throws on a shape it did not expect, because the surface that reads a 400 is
 * the surface that has to DISPLAY it — a reader that throws replaces a visible
 * error message with an unhandled rejection, which is strictly worse than the
 * failure it was handed.
 */

/** A `details` value flattened to one dotted wire path and one message. */
export interface ErrorDetailEntry {
  /** Snake_case wire path, dotted through nesting: `address.line1`. */
  readonly path: string;
  /** Every message at that path, already joined into one sentence. */
  readonly message: string;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A leaf worth showing. `null`/`undefined` are "no message", not "null". */
const scalarMessage = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.trim().length > 0 ? value : null;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
};

const flattenInto = (value: unknown, path: string, out: ErrorDetailEntry[]): void => {
  if (Array.isArray(value)) {
    // The common case: a flat list of messages for one field. It is joined
    // rather than emitted per-item so a field gets ONE `setError`, which is all
    // RHF keeps anyway.
    const messages = value.map(scalarMessage).filter((one): one is string => one !== null);
    if (messages.length > 0) out.push({ path, message: messages.join(' ') });

    // DRF's list serializer: `[{}, {qty: ["…"]}]` — the index is part of the
    // path, and `snakeToCamelPath` already leaves a numeric segment alone.
    value.forEach((item, index) => {
      if (isPlainObject(item) || Array.isArray(item)) flattenInto(item, `${path}.${index}`, out);
    });
    return;
  }

  if (isPlainObject(value)) {
    Object.entries(value).forEach(([key, child]) => {
      flattenInto(child, path ? `${path}.${key}` : key, out);
    });
    return;
  }

  const message = scalarMessage(value);
  if (message !== null) out.push({ path, message });
};

/**
 * Every message in `details`, each against the dotted wire path it belongs to.
 *
 * Order is `Object.entries` order, which is the serializer's field order — so
 * the first entry is the first field the server rejected, and a form that can
 * only focus one control focuses that one.
 */
export const flattenErrorDetails = (
  details: Readonly<Record<string, unknown>> | undefined
): readonly ErrorDetailEntry[] => {
  if (!details) return [];
  const out: ErrorDetailEntry[] = [];
  Object.entries(details).forEach(([key, value]) => flattenInto(value, key, out));
  return out;
};

/**
 * One value out of a `D` envelope, by dotted path, whatever shape it arrived in.
 *
 * `readDetail(details, 'limit')` is `3` for `{limit: 3}` and `3` for
 * `{limit: ["3"]}`; `readDetail(details, 'support_contact.phone')` walks into
 * the nested object the server actually sends. A one-element array is unwrapped
 * because that is the `F`-envelope spelling of the same value and both have
 * been seen on this contract.
 */
export const readDetail = (
  details: Readonly<Record<string, unknown>> | undefined,
  path: string
): unknown => {
  if (!details) return undefined;
  const value = path.split('.').reduce<unknown>((current, segment) => {
    if (Array.isArray(current)) {
      const index = Number(segment);
      return Number.isInteger(index) ? current[index] : undefined;
    }
    if (!isPlainObject(current)) return undefined;
    return current[segment];
  }, details as unknown);

  return Array.isArray(value) ? value[0] : value;
};

/** `readDetail` narrowed to a string, for a code or a name. */
export const readDetailString = (
  details: Readonly<Record<string, unknown>> | undefined,
  ...paths: readonly string[]
): string | null => {
  for (const path of paths) {
    const value = readDetail(details, path);
    if (typeof value === 'string' && value.length > 0) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
};

/** `readDetail` narrowed to a finite number, for a count or a ceiling. */
export const readDetailNumber = (
  details: Readonly<Record<string, unknown>> | undefined,
  ...paths: readonly string[]
): number | null => {
  for (const path of paths) {
    const value = readDetail(details, path);
    if (value === null || value === undefined || value === '') continue;
    if (typeof value === 'boolean' || typeof value === 'object') continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};
