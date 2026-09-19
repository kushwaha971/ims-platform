import { cookies } from 'next/headers';

import { AppProviders } from 'src/components/providers/AppProviders';
import { APP_NAME } from 'src/constants';
import { LOCALE_COOKIE, THEME_COOKIE } from 'src/utils/cookieUtils';

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

const THEME_INIT = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]*)/);var t=m&&decodeURIComponent(m[1]);if(t!=='dark'&&t!=='light'){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export const metadata: Metadata = {
  /**
   * CR-2026-09-19-D — a template rather than a bare name, so every route can
   * set its own title and still carry the product's. A browser with fifteen
   * tabs open shows about eighteen characters of each one, and every screen in
   * this product used to render exactly the same eighteen.
   */
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  applicationName: APP_NAME,
  description: "Your shop's khata, bills and stock in one book.",
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
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
  const theme = store.get(THEME_COOKIE)?.value === 'dark' ? 'dark' : 'light';

  return (
    <html lang={locale} data-theme={theme} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body>
        <AppProviders>
          <SessionBootstrap>{children}</SessionBootstrap>
        </AppProviders>
      </body>
    </html>
  );
}
