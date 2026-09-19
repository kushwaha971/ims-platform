/**
 * Query building lives here so no service hand-rolls `?a=1&b=2` and no
 * `undefined` ever reaches the wire as the string "undefined".
 */
export type QueryValue = string | number | boolean | null | undefined;

export const toQueryString = (params: Readonly<Record<string, QueryValue>>): string => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : '';
};
