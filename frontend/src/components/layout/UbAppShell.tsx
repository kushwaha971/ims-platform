'use client';

import { type ReactNode } from 'react';

import { NetworkStrip } from 'src/components/layout/NetworkStrip';
import { SnackbarHost } from 'src/components/layout/SnackbarHost';
import { UbSidebar } from 'src/components/layout/UbSidebar';
import { UbBox, UbStack } from 'src/design-system';

import { PlanLimitDialog } from 'modules/UdhaarBook/features/plan/components/PlanLimitDialog';
import { TenantSwitcherMenu } from 'modules/UdhaarBook/features/tenant-switcher/components/TenantSwitcherMenu';

/**
 * Part 19 §19.6.1 — the `(app)` shell: the dark rail at ≥ 1024 px, the content
 * column, the network strip of §19.10.3 above the content (it PUSHES content
 * down, it never overlays) and the single snackbar host.
 *
 * Sprint 1 adds two things, both of which belong to the shell rather than to a
 * screen because both answer for the whole application:
 *
 *  - **The tenant switcher** (PLT-04 §7). Desktop: top of the sidebar rail —
 *    rendered inside `UbSidebar`. Below `lg` there is no rail, so it is a
 *    compact bar above the content; PLT-04 §7 puts it in the "More" tab, and
 *    `UbBottomNav` is not a Sprint 1 component, so this bar is where it lives
 *    until the bottom nav arrives.
 *  - **`PlanLimitDialog`** (PLT-15 FR-6). One dialog for every module's plan
 *    limit, opened by the transport layer. Mounting it here rather than in each
 *    form is what lets the originating form keep its data: the dialog is a
 *    sibling of the screen, not a replacement for it.
 */
export function UbAppShell({ children }: Readonly<{ children: ReactNode }>): React.JSX.Element {
  return (
    <UbStack direction="row" className="min-h-dvh w-full bg-canvas">
      <UbSidebar />
      <UbStack className="min-w-0 flex-1">
        {/* The mobile tenant bar. Hidden from `lg`, where the rail carries it,
            so the switcher is never rendered twice into the same tab order. */}
        <UbStack
          direction="row"
          align="center"
          gap={2}
          className="border-b border-border-hairline bg-surface-card px-2 py-1 lg:hidden"
        >
          <TenantSwitcherMenu className="min-w-0 flex-1" />
        </UbStack>
        <NetworkStrip />
        <UbBox className="flex-1">{children}</UbBox>
      </UbStack>
      <SnackbarHost />
      <PlanLimitDialog />
    </UbStack>
  );
}
