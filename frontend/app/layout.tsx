import { cookies } from 'next/headers';

import { AppProviders } from 'src/components/providers/AppProviders';
import { APP_NAME, SITE_URL } from 'src/constants';
import { dmSans, epilogue, fraunces, inter, notoDevanagari } from 'src/fonts';
import { BRAND_INIT, THEME_INIT } from 'src/utils/bootScripts';
import { LOCALE_COOKIE, THEME_CHOICE_COOKIE } from 'src/utils/cookieUtils';

import { SessionBootstrap } from 'modules/DigiKhaato/features/auth/components/SessionBootstrap';

import type { Metadata, Viewport } from 'next';

import './globals.css';

/**
 * Part 19 §19.1.4 — a static shell: providers and children, no data fetching.
 *
 * `<html lang>` and `data-theme` are read from the readable cookies so the
 * server-rendered shell matches the client and there is no flash of English or
 * of the wrong theme (§19.11.2, §19.8.4).
 *
 * On a FIRST visit there is no theme cookie, so the server has to guess `light`
 * while the client may resolve `dark` from `prefers-color-scheme`. Two things
 * handle that, and both are needed:
 *
 *   1. THEME_INIT runs before first paint and sets the attribute from the
 *      cookie, or from the media query when the cookie is absent. This is what
 *      prevents the white flash; `ThemeProvider` only owns the state afterwards.
 *   2. `suppressHydrationWarning` on <html>, because THEME_INIT has by then
 *      legitimately changed an attribute React rendered on the server. It
 *      suppresses the mismatch on this element ONLY — one level deep, never on
 *      <body> or below — which is the standard contract for a theme attribute.
 *
 * `app/layout.tsx` is the one file exempt from R-S-10 (no raw host elements):
 * <html>, <head>, <body> and the boot script have no design-system equivalent.
 */

/**
 * THEME_INIT and BRAND_INIT — the theme and the tenant's brand ramp, resolved
 * before first paint. Built in `src/utils/bootScripts.ts` from the same cookie
 * name and storage key their writers use, and executed by a test there.
 */
export const metadata: Metadata = {
  /**
   * CR-2026-09-19-D — a template rather than a bare name, so every route can
   * set its own title and still carry the product's. A browser with fifteen
   * tabs open shows about eighteen characters of each one, and every screen in
   * this product used to render exactly the same eighteen.
   */
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  applicationName: APP_NAME,
  /**
   * CR-2026-09-29-PLATFORM-C — relative metadata URLs (a canonical, an
   * og:image) resolve against the public origin, not the request's Host, so a
   * preview fetched from any address points at yourkhata.com. The default
   * description is what /login, /signup and the legal pages inherit; it is the
   * platform line, with none of the old shop-only jargon (vision §4).
   */
  metadataBase: new URL(SITE_URL),
  description:
    'Customers, money in and out, GST bills, stock and payments for your business, in one place.',
  manifest: '/manifest.webmanifest',
  /**
   * CR-2026-09-29-BRAND-C — K-c "Bandhan", the tied bahi cover. The PNGs are
   * rendered from `public/brand/` by `scripts/render-brand.mjs`. The SVG
   * favicon is the hand-cut 16 px file, not the master: a browser paints the
   * SVG at tab size whatever the master was drawn for, and the master's hem
   * and knot strings are sub-pixel noise there. The 16 px cut is on the pixel
   * grid and stays sharp at 2x.
   */
  icons: {
    icon: [
      { url: '/brand/yourkhata-mark-16.svg', type: 'image/svg+xml' },
      { url: '/icons/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#4A47D6',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): Promise<React.JSX.Element> {
  const store = await cookies();
  const locale = store.get(LOCALE_COOKIE)?.value === 'hi' ? 'hi' : 'en';
  // Same source as THEME_INIT, so the server-rendered attribute and the one
  // the blocking script writes agree and there is nothing to correct.
  const theme = store.get(THEME_CHOICE_COOKIE)?.value === 'dark' ? 'dark' : 'light';

  return (
    <html
      lang={locale}
      data-theme={theme}
      className={`${dmSans.variable} ${inter.variable} ${fraunces.variable} ${epilogue.variable} ${notoDevanagari.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <script dangerouslySetInnerHTML={{ __html: BRAND_INIT }} />
      </head>
      <body>
        <AppProviders>
          <SessionBootstrap>{children}</SessionBootstrap>
        </AppProviders>
      </body>
    </html>
  );
}
