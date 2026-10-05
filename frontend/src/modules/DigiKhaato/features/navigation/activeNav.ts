/**
 * Which menu row is the current page. Imports nothing.
 *
 * A row is current when the page is its href or under it — but only the MOST
 * specific such row. A workspace's home sits at the workspace's own prefix
 * (`/lending`, `/library`), so a plain prefix test lit Home on every page of
 * the workspace, beside the row that really was open (L02 QA: "Today" and
 * "Loans" both current on /lending/loans).
 */
const under = (pathname: string, href: string): boolean =>
  pathname === href || pathname.startsWith(`${href}/`);

export const activeNavHref = (pathname: string | null, hrefs: readonly string[]): string | null => {
  if (!pathname) return null;
  let best: string | null = null;
  for (const href of hrefs) {
    if (under(pathname, href) && (best === null || href.length > best.length)) best = href;
  }
  return best;
};
