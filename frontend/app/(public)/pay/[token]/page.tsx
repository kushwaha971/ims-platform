import { PublicPayPageContent } from 'modules/DigiKhaato/features/payments/pay-link/components/PublicPayPageContent';

import type { Metadata } from 'next';

/**
 * Shop P0 — the page a UPI pay link opens: the business's name, the amount, the QR
 * and "Pay by UPI", with no session. Fetched in the browser for the reason the share
 * page is (`/d/[token]`): the API's budgets are per client IP. The customer's page
 * carries nothing of the product (CR-2026-09-29-BRAND-A), so the layout's title,
 * manifest and icons are switched off here as they are there.
 */
export const metadata: Metadata = {
  title: { absolute: '' },
  applicationName: null,
  description: null,
  manifest: null,
  icons: null,
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

export default async function PublicPayPage({
  params,
}: Readonly<{ params: Promise<{ token: string }> }>): Promise<React.JSX.Element> {
  const { token } = await params;
  return <PublicPayPageContent token={token} />;
}
