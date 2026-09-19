/**
 * The wire is snake_case (Part 22 §22.1); the client is camelCase.
 *
 * **There is no bulk converter here, and that is deliberate.** Each service in
 * `features/<name>/api` hand-maps its own shapes, and no interceptor converts
 * anything, which is why nothing in this codebase can double-convert a key.
 * This module used to also export `camelizeKeys` and `snakeifyKeys`, a
 * recursive whole-payload converter with no caller anywhere in `src/` or
 * `app/`. A dead bulk converter sitting next to the transport layer is an
 * invitation to wire it into an interceptor, and the moment anyone does, every
 * hand-mapped service converts twice. Deleting it is the fix; if a bulk
 * conversion is ever genuinely wanted, adding it back is a decision somebody
 * makes on purpose rather than a helper they found lying there.
 *
 * What remains is the per-KEY mapping the error path needs: a rejected wire
 * field name has to become an RHF path, and those names are not known ahead of
 * time the way a service's shapes are.
 */
const toCamel = (key: string): string =>
  key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

const toSnake = (key: string): string => key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

export const camelCase = toCamel;
export const snakeCase = toSnake;

/**
 * Part 19 §19.5.6 — a wire field path becomes an RHF path. Dotted segments are
 * mapped individually so that `lines.2.unit_price` → `lines.2.unitPrice` and a
 * numeric index survives untouched.
 */
export const snakeToCamelPath = (path: string): string =>
  path
    .split('.')
    .map((segment) => (/^\d+$/.test(segment) ? segment : toCamel(segment)))
    .join('.');

/** The first segment of a path — the field RHF actually knows about. */
export const rootOfPath = (path: string): string => path.split('.')[0] ?? path;
