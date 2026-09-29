import { frauncesItalic } from 'src/fonts/landing';

import { LandingPage } from 'modules/DigiKhaato/features/landing/components/LandingPage';

import type { Metadata } from 'next';

/**
 * The front door, `/`: the public landing page.
 *
 * It renders for a visitor with NO session cookie only. A browser carrying one
 * is redirected to the dashboard by `proxy.ts` before this file runs, which is
 * where that rule lives — beside the session guard, in one place (Part 19
 * §19.7.3) — so this page knows nothing about sessions and reads none.
 *
 * It is outside every route group on purpose. `(public)` is the SHOP's space —
 * the `/d/<token>` share page and the legal pages a customer may open — and its
 * layout promises that nothing on it names the product
 * (`customerDocumentsCarryNoProductName.test.tsx`); this page is the product
 * naming itself.
 *
 * `frauncesItalic.variable` is applied here so the italic face is preloaded on
 * this route alone (src/fonts/landing.ts).
 */
export const metadata: Metadata = {
  title: { absolute: 'YourKhata — khata, GST bills and stock for your shop' },
  description:
    'Record udhaar, make GST invoices with CGST and SGST worked out, and keep stock — for kirana, wholesale and retail shops. Works in any browser, on phone or computer, in Hindi or English.',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'YourKhata',
    title: 'YourKhata — one khata for your whole shop',
    description:
      'Udhaar, GST bills, stock and payments for Indian shops. In Hindi or English, on phone or computer.',
    images: [{ url: '/media/landing/hero-desktop-poster.jpg', width: 1280, height: 800 }],
  },
};

export default function HomePage(): React.JSX.Element {
  return <LandingPage className={frauncesItalic.variable} />;
}
