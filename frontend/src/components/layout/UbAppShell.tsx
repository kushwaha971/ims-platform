'use client';

import { type ReactNode } from 'react';

import { NetworkStrip } from 'src/components/layout/NetworkStrip';
import { SnackbarHost } from 'src/components/layout/SnackbarHost';
import { UbSidebar } from 'src/components/layout/UbSidebar';

/**
 * Part 19 §19.6.1 — the `(app)` shell: the dark rail at ≥ 1024 px, the content
 * column, the network strip of §19.10.3 above the content (it PUSHES content
 * down, it never overlays) and the single snackbar host.
 *
 * `UbBottomNav` and the header's tenant switcher are Sprint 1's S0-64; the
 * shell is shaped for them so adding them is a child, not a rewrite.
 */
export function UbAppShell({ children }: Readonly<{ children: ReactNode }>): React.JSX.Element {
  return (
    <div className="flex min-h-dvh w-full bg-canvas">
      <UbSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <NetworkStrip />
        <div className="flex-1">{children}</div>
      </div>
      <SnackbarHost />
    </div>
  );
}
