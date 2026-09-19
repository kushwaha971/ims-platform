'use client';

import { type ReactNode } from 'react';

import { NetworkStrip } from 'src/components/layout/NetworkStrip';
import { SnackbarHost } from 'src/components/layout/SnackbarHost';
import { UbSidebar } from 'src/components/layout/UbSidebar';
import { UbBox, UbLink, UbLogo, UbStack } from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectAppName } from 'src/redux/slice/whiteLabelSlice';
import { ROUTES } from 'src/routes';

import { PlanLimitDialog } from 'modules/DigiKhaato/features/plan/components/PlanLimitDialog';
import { TenantSwitcherMenu } from 'modules/DigiKhaato/features/tenant-switcher/components/TenantSwitcherMenu';

/** The skip link's target, and the id of the content region it skips to. */
export const APP_CONTENT_ID = 'app-content';

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
 *
 * ── CR-2026-09-19-D ─────────────────────────────────────────────────────────
 *  · **A skip link.** The rail is the first thing in the tab order and holds a
 *    dozen links; every keyboard user was walking through all of them on every
 *    page. It is the first focusable element on the page and visible only when
 *    focused, which is the standard shape.
 *  · **The mobile bar is a header, and it carries the brand.** It was an
 *    unlabelled `<div>` holding the tenant switcher and 4 px of vertical
 *    padding — below 1024 px, which is where these merchants actually are, the
 *    product's name and mark appeared nowhere at all. It is a `<header>`
 *    landmark now, 56 px tall, with the mark on the left and the switcher
 *    beside it.
 *  · **The content region is a named landmark** with an id, so the skip link
 *    has somewhere to land and a screen reader can jump to it.
 */
export function UbAppShell({ children }: Readonly<{ children: ReactNode }>): React.JSX.Element {
  const { t } = useTranslation();
  const appName = useAppSelector(selectAppName);

  return (
    <UbStack direction="row" className="min-h-dvh w-full bg-canvas">
      {/* Off-screen until focused (R-A-5). It is deliberately the first node in
          the shell: a skip link that is not first skips nothing. */}
      <UbLink
        href={`#${APP_CONTENT_ID}`}
        variant="body-sm-medium"
        underline={false}
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-surface-raised focus:px-4 focus:py-3 focus:shadow-3"
      >
        {t('nav.skipToContent')}
      </UbLink>

      <UbSidebar />

      <UbStack className="min-w-0 flex-1">
        {/* The mobile header. Hidden from `lg`, where the rail carries both the
            brand and the switcher, so neither is ever in the tab order twice. */}
        <UbStack
          as="header"
          direction="row"
          align="center"
          gap={3}
          className="h-14 shrink-0 border-b border-border-hairline bg-surface-card px-4 lg:hidden"
        >
          <UbLink
            href={ROUTES.DASHBOARD}
            tone="inherit"
            underline={false}
            aria-label={t('nav.brandHome', { appName })}
            className="flex shrink-0 items-center rounded-control"
          >
            <UbLogo size="sm" />
          </UbLink>
          <TenantSwitcherMenu className="min-w-0 flex-1" />
        </UbStack>

        <NetworkStrip />

        <UbBox as="main" id={APP_CONTENT_ID} tabIndex={-1} className="flex-1 outline-none">
          {children}
        </UbBox>
      </UbStack>

      <SnackbarHost />
      <PlanLimitDialog />
    </UbStack>
  );
}
