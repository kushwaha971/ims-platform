import { cookies } from 'next/headers';

import { AppProviders } from 'src/components/providers/AppProviders';
import { APP_NAME } from 'src/constants';
import { dmSans, epilogue, fraunces, inter, notoDevanagari } from 'src/fonts';
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
 * Resolve the theme before first paint.
 *
 * The fallback is `light`, not `prefers-color-scheme`. It used to be the media
 * query, which is why a merchant on a Mac set to Dark got a dark khata: the OS
 * decided, the specification said light, and the specification lost. §19.8.4's
 * reason for light is that the product is used in bright shops on cheap screens
 * — the operating system of the phone or laptop knows nothing about that.
 *
 * Only an explicit choice is read, and `ub_theme_choice` only ever holds one —
 * see `cookieUtils` for why it is not the old `ub_theme`.
 */
const THEME_INIT = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_CHOICE_COOKIE}=([^;]*)/);var t=m&&decodeURIComponent(m[1]);document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light');}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

/**
 * WLB-01 FR-4 — the tenant's brand ramp, before first paint.
 *
 * `WhiteLabelSync` writes the ramp it applied to `localStorage` (`ub.theme_cache`,
 * `{tenantId, vars}`); this replays it before React exists, so a teal shop does
 * not open in indigo and turn teal a moment later. The session that loads next
 * corrects it if the active business changed (EC-6) — at worst one frame of the
 * previous brand, never the previous business's data. Only `--primary-*` and
 * the two accent aliases are ever in the cache; anything else is ignored.
 */
const BRAND_INIT = `(function(){try{var c=JSON.parse(localStorage.getItem('ub.theme_cache')||'null');if(!c||!c.vars)return;var s=document.documentElement.style;for(var k in c.vars){if(/^--(primary-[0-9]+|accent-quiet|accent-line)$/.test(k))s.setProperty(k,String(c.vars[k]));}}catch(e){}})();`;

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
