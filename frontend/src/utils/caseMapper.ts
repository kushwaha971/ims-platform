/**
 * The wire is snake_case (Part 22 §22.1); the client is camelCase. A service
 * owns this mapping for its own shapes — these helpers exist for the generic
 * cases (query params, error `details` keys) where hand-writing it is noise.
 */
const toCamel = (key: string): string =>
  key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

const toSnake = (key: string): string => key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Blob);

const mapKeys = (value: unknown, mapper: (key: string) => string): unknown => {
  if (Array.isArray(value)) return value.map((item) => mapKeys(item, mapper));
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, inner]) => [mapper(key), mapKeys(inner, mapper)])
  );
};

export const camelizeKeys = <T>(value: unknown): T => mapKeys(value, toCamel) as T;
export const snakeifyKeys = <T>(value: unknown): T => mapKeys(value, toSnake) as T;
export const camelCase = toCamel;
export const snakeCase = toSnake;
