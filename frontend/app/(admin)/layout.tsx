import { NOINDEX_ROBOTS } from 'src/utils/seo';

import { AdminShell } from 'modules/DigiKhaato/features/admin/components/AdminShell';

import type { Metadata } from 'next';

/**
 * PLT-14 FR-1 — the `(admin)` group: the operator console's own chrome and its
 * super-admin guard. A group of its own rather than a corner of `(app)`, so
 * nothing of the console joins the merchant shell's chunks and nothing of the
 * merchant shell (tenant switcher, inbox poll) runs for an operator with no
 * business.
 *
 * A server component (CR-2026-09-29-PLATFORM-C) so the console says `noindex`
 * on every page, beside robots.txt's disallow; `AdminShell` is the client part.
 */
export const metadata: Metadata = { robots: NOINDEX_ROBOTS };

export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  return <AdminShell>{children}</AdminShell>;
}
