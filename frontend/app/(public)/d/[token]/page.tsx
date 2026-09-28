import { PublicDocumentPageContent } from 'modules/DigiKhaato/features/sales/components/public/PublicDocumentPageContent';

import type { Metadata } from 'next';

/**
 * Part 19 §19.7.6 / SAL-03 FR-5 — the customer's copy of a shared bill,
 * opened from WhatsApp with no session.
 *
 * The document is fetched in the BROWSER rather than here: the API's budgets
 * are per client IP (60/min) as well as per token, and a server-side fetch
 * would spend every customer's budget from the Next server's one address.
 * The token in the path IS the credential, so the page is never indexed and
 * never sends its address onward (the same headers are set by next.config
 * and nginx on `/d/*`; these are the in-document copies).
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

export default async function PublicDocumentPage({
  params,
}: Readonly<{ params: Promise<{ token: string }> }>): Promise<React.JSX.Element> {
  const { token } = await params;
  return <PublicDocumentPageContent token={token} />;
}
