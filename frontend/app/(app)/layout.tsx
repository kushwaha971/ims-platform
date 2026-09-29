import { AppGroupShell } from 'src/components/layout/AppGroupShell';
import { NOINDEX_ROBOTS } from 'src/utils/seo';

import type { Metadata } from 'next';

/**
 * Part 19 §19.6.1 — the `(app)` group: every signed-in screen.
 *
 * A server component for one reason (CR-2026-09-29-PLATFORM-C): to say
 * `noindex, nofollow, noarchive` on every screen in the group. It is defence in
 * depth — robots.txt disallows these prefixes and `proxy.ts` sends a visitor
 * with no session to /login before any of them renders — but a signed-in
 * screen reached by some other road (a browser extension's crawler, a
 * mis-configured proxy that forwards cookies) must still never be indexed.
 * The shell, the guard and the warm-up are `AppGroupShell`, unchanged.
 */
export const metadata: Metadata = { robots: NOINDEX_ROBOTS };

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  return <AppGroupShell>{children}</AppGroupShell>;
}
