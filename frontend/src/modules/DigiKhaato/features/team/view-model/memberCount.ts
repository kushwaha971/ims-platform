/**
 * Part 19 §19.2.5 — view-model: pure, no React.
 *
 * The Team heading's count (QA O3). It read "3 people" for two people who
 * work here and one address that was invited and has not joined — counting a
 * hope as a colleague, on the screen an owner uses to answer "who can get
 * into my shop". An invited row holds no access (CR-2026-09-23-B), so it is
 * counted apart: "2 people · 1 invited".
 *
 * The server's `meta.total` counts every listed row and says nothing about
 * status, so the split is computed from the rows — which is only the whole
 * team when the whole team is on this page. On a team that pages (more than
 * one page of people, which a small shop does not reach) the split would be
 * a guess about pages not downloaded, so the plain total is kept instead.
 */
export interface MemberCount {
  readonly joined: number;
  /** `null` when it cannot be known from what is held — see above. */
  readonly invited: number | null;
}

export const memberCountOf = (
  rows: readonly { readonly status?: string }[],
  meta: { readonly total: number; readonly totalPages: number }
): MemberCount => {
  if (meta.totalPages > 1) return { joined: meta.total, invited: null };
  const invited = rows.filter((row) => row.status === 'invited').length;
  return { joined: Math.max(0, meta.total - invited), invited };
};
