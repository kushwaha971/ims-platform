import { SelfCheckInPageContent } from 'modules/DigiKhaato/features/self-checkin/components/SelfCheckInPageContent';

import type { Metadata } from 'next';

/**
 * Library P0 — the page the door's QR opens: a student checks themself in. No session;
 * the library's page, so nothing of the product's name, manifest or icons (BRAND-A).
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

export default async function SelfCheckInPage({
  params,
}: Readonly<{ params: Promise<{ token: string }> }>): Promise<React.JSX.Element> {
  const { token } = await params;
  return <SelfCheckInPageContent token={token} />;
}
