import { NOINDEX_ROBOTS } from 'src/utils/seo';

import type { Metadata } from 'next';

/**
 * CR-2026-09-29-PLATFORM-C — `/accept-invite` is a step in a flow, not a page
 * anybody searches for, so it says `noindex` (robots.txt also disallows it).
 * The page itself is a client component and cannot export metadata; this
 * layout exists only to carry it, and renders nothing of its own.
 */
export const metadata: Metadata = { robots: NOINDEX_ROBOTS };

export default function AcceptInviteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.ReactNode {
  return children;
}
