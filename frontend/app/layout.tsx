import { cookies } from 'next/headers';

import { AppProviders } from 'src/components/providers/AppProviders';
import { APP_NAME } from 'src/constants';
import { LOCALE_COOKIE, THEME_COOKIE } from 'src/utils/cookieUtils';

import { SessionBootstrap } from 'modules/UdhaarBook/features/auth/components/SessionBootstrap';

import type { Metadata, Viewport } from 'next';

import './globals.css';

/**
 * Part 19 §19.1.4 — a static shell: providers and children, no data fetching.
 * `<html lang>` and `data-theme` are read from the readable cookies so the
 * server-rendered shell matches the client and there is no flash of English or
 * of the wrong theme (§19.11.2, §19.8.4).
 */
export const metadata: Metadata = {
  title: APP_NAME,
  description: "Your shop's khata, bills and stock in one book.",
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#2B6BE0',
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
    <html lang={locale} data-theme={theme}>
      <body>
        <AppProviders>
          <SessionBootstrap>{children}</SessionBootstrap>
        </AppProviders>
      </body>
    </html>
  );
}
