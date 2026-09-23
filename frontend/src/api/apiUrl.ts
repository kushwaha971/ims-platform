import { API_BASE_URL } from 'src/constants';

/**
 * An API path as an ABSOLUTE URL, for the one place a request leaves the
 * browser without going through axios: a download link.
 *
 * `API_PATHS` are relative to axios's `baseURL`. Handed to an `<a href>` they
 * resolve against the FRONTEND's origin instead — and on the frontend
 * `/ledger/aging` is the aging PAGE, so "Export CSV" saved `aging.html`. Both
 * ledger exports shipped that way and passed every test, because the unit
 * tests asserted the relative string and the e2e harnesses fetched the CSV
 * from the API directly. `e2e/aging.mjs` clicks the link. The session is a
 * cookie, so a plain navigation to the API origin carries it.
 */
export const absoluteApiUrl = (path: string): string =>
  `${API_BASE_URL.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
