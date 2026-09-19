'use client';

import { UbAppShell } from 'src/components/layout/UbAppShell';

import { RequireSession } from 'modules/UdhaarBook/features/auth/components/RequireSession';

/** Part 19 §19.6.1 — the app shell plus one guard. Nothing else. */
export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  return (
    <RequireSession>
      <UbAppShell>{children}</UbAppShell>
    </RequireSession>
  );
}
