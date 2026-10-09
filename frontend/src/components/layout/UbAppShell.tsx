'use client';

import { type ReactNode } from 'react';

import { MobileBackButton } from 'src/components/layout/MobileBackButton';
import { MobileQuickSearch } from 'src/components/layout/MobileQuickSearch';
import { MobileTabBar } from 'src/components/layout/MobileTabBar';
import { NetworkStrip } from 'src/components/layout/NetworkStrip';
import { ShellNotices } from 'src/components/layout/ShellNotices';
import { UbAppTopBar } from 'src/components/layout/UbAppTopBar';
import { UbSidebar } from 'src/components/layout/UbSidebar';
import { UbBox, UbLink, UbLogo, UbStack, UbViewOnlyProvider } from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectImpersonation } from 'src/redux/slice/sessionSlice';
import { selectAppName } from 'src/redux/slice/whiteLabelSlice';

import { useLandingPath } from 'modules/DigiKhaato/features/navigation/useLandingPath';
import { useMobileNav } from 'modules/DigiKhaato/features/navigation/useMobileNav';
import { NotificationBell } from 'modules/DigiKhaato/features/notifications/components/NotificationBell';
import { useNotificationPoll } from 'modules/DigiKhaato/features/notifications/hooks/useNotificationPoll';
import { PlanLimitDialog } from 'modules/DigiKhaato/features/plan/components/PlanLimitDialog';
import { TenantSwitcherMenu } from 'modules/DigiKhaato/features/tenant-switcher/components/TenantSwitcherMenu';

/** The skip link's target, and the id of the content region it skips to. */
export const APP_CONTENT_ID = 'app-content';

/**
 * Part 19 §19.6.1 — the `(app)` shell: the dark rail at ≥ 1024 px, the content
 * column and the network strip of §19.10.3 above the content (it PUSHES
 * content down, it never overlays).
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
  // NTF-01 FR-8 — one poll for the two bells (phone header, desktop bar).
  useNotificationPoll();
  const appName = useAppSelector(selectAppName);
  // The logo opens this workspace's first page — a library's, not the shop's.
  const landing = useLandingPath();
  const impersonating = useAppSelector(selectImpersonation) !== null;
  const mobileNav = useMobileNav();

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
        {/* UAT D3 — `data-print="hide"`: this header printed at the top of
            every statement a phone user printed. */}
        <UbStack
          as="header"
          direction="row"
          align="center"
          gap={2}
          data-print="hide"
          className="h-14 shrink-0 border-b border-border-hairline bg-surface-card px-4 lg:hidden"
        >
          {/* A top-level screen shows the brand; a detail or task screen shows
              Back in its place, because the bottom nav is not there to leave by. */}
          {mobileNav.visible ? (
            <UbLink
              href={landing}
              tone="inherit"
              underline={false}
              aria-label={t('nav.brandHome', { appName })}
              // A 24 px mark with a 44 px hit area (R-A-3): 10 px of overhang a
              // side, so `mx-0.5` opens the 8 px gaps to the menu button and the
              // switcher to exactly 10 — the overhang fills the gap and never
              // covers a neighbour, at a cost of 4 px of the switcher's width on
              // a 360 px phone (Sprint 12 sweep).
              className="ub-hit mx-0.5 flex shrink-0 items-center rounded-control"
            >
              <UbLogo size="sm" />
            </UbLink>
          ) : (
            <MobileBackButton upHref={mobileNav.upHref} />
          )}
          <TenantSwitcherMenu className="min-w-0 flex-1" />
          {/* UAT D2 — below `lg` the top bar does not render, and it held the
              only party search. It is here as a 44 px icon, reusing the same
              component. The account (and Sign out) moved to the More tab with
              the mobile redesign, which also took the ☰ drawer's place. */}
          <MobileQuickSearch />
          {/* NTF-01 FR-4 — the bell sits beside search. */}
          <NotificationBell />
        </UbStack>

        <UbAppTopBar />

        <NetworkStrip />

        {/* PLT-14 / PLT-10 — the support-session and pending-deletion banners. */}
        <ShellNotices />

        {/* CR-2026-09-29-SEC-A — a support session is VIEW ONLY (the owner
            consented to exactly that, and the server refuses every write). The
            content region's primary/destructive buttons, submits and FABs
            disable themselves with this reason as their title. The banner and
            the account menu sit outside it, so End session and Sign out stay. */}
        <UbViewOnlyProvider reason={impersonating ? t('common.viewOnly.reason') : null}>
          {/* `--ub-nav-offset` is the phone nav's height while it is on screen
              and 0 everywhere else, desktop included: the content's last row
              never hides under the bar. */}
          <UbBox
            as="main"
            id={APP_CONTENT_ID}
            tabIndex={-1}
            className="flex-1 pb-[var(--ub-nav-offset)] outline-none"
          >
            {children}
          </UbBox>
        </UbViewOnlyProvider>
      </UbStack>

      {/* docs/mobile-redesign/03 — four tabs and More, below `lg`, on the
          screens that are destinations rather than details. */}
      <MobileTabBar />

      {/* CR-2026-09-19-E — `SnackbarHost` used to be mounted here. It is in
          `AppProviders` now, so the one toast channel also covers the auth,
          public and internal route groups. `PlanLimitDialog` stays: a plan
          limit can only be hit from inside the app. */}
      <PlanLimitDialog />
    </UbStack>
  );
}
