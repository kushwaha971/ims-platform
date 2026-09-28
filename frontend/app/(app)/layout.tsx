'use client';

import { AppRouteWarmup } from 'src/components/layout/AppRouteWarmup';
import { UbAppShell } from 'src/components/layout/UbAppShell';

import { RequireSession } from 'modules/DigiKhaato/features/auth/components/RequireSession';

// The inbox, the business switcher and the plan dialog are the signed-in
// shell's own words: every `(app)` screen needs them and /login needs none of
// them, so they load here rather than in the shell catalogue
// (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/notifications';
import 'src/i18n/catalogues/plan';
import 'src/i18n/catalogues/tenant';

/**
 * Part 19 §19.6.1 — the app shell plus one guard, and one thing that paints
 * nothing.
 *
 * `AppRouteWarmup` is a SIBLING of the guard rather than a child of it, which
 * is the entire point of it: the guard decides what is painted, and the screen
 * that is about to be painted gets to start its own fetch in parallel with
 * `GET /auth/me` instead of after it. It renders `null`, so nothing a
 * signed-out visitor could see has changed. See that file.
 */
export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  return (
    <>
      <AppRouteWarmup />
      <RequireSession>
        <UbAppShell>{children}</UbAppShell>
      </RequireSession>
    </>
  );
}
