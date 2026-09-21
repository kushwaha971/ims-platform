'use client';

import { NavSections } from 'src/components/layout/NavSections';
import { UbBox, UbLink, UbLogo } from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectAppName } from 'src/redux/slice/whiteLabelSlice';
import { ROUTES } from 'src/routes';
import { cn } from 'src/utils/cn';


import { TenantSwitcherMenu } from 'modules/DigiKhaato/features/tenant-switcher/components/TenantSwitcherMenu';

/**
 * Part 23 §23.3 — the entitlement-driven rail: three-to-four groups, one level,
 * active = accent edge + raised surface. `--surface-nav` stays dark in BOTH
 * themes (Zoho-style), which is why this component paints on `bg-surface-nav`
 * and uses the dark-theme text token rather than `--text-primary`.
 *
 * Hidden below 1024 px, where navigation is the drawer + `UbBottomNav`
 * (§19.6.3, Sprint 1).
 *
 * ── CR-2026-09-19-D ─────────────────────────────────────────────────────────
 *  · **The brand is here.** The rail opened with the product's name set in
 *    `ds-h4` — a heading tier, on a graphic-free dark panel, which is what an
 *    admin console looks like. It is the mark plus the wordmark now, and it is
 *    a link to the dashboard, which is what every one of the three reference
 *    products does with its logo.
 *  · **The active row no longer moves.** `border-l-2` on the active item added
 *    2 px of border inside the same padding, so selecting a row shifted its
 *    label two pixels right. The accent edge is an absolutely-positioned bar
 *    now: it marks the row without being part of its box.
 *  · **Rows are 44 px.** They were `py-2` around a 20 px line — about 36 px,
 *    under R-A-3's floor, on the one surface a user hits most often.
 *  · **The landmark is named correctly.** `aria-label` was `nav.section.daily`
 *    — "Daily" — so a screen reader announced the whole menu as the name of its
 *    first group.
 *  · **Sections are separated by space and a hairline**, not by nothing: four
 *    groups of links at one gap read as sixteen links.
 */
export function UbSidebar(): React.JSX.Element {
  const { t } = useTranslation();
  const appName = useAppSelector(selectAppName);

  return (
    <UbBox
      as="nav"
      aria-label={t('nav.primary')}
      className={cn(
        'hidden w-sidebar shrink-0 flex-col gap-5 overflow-y-auto',
        'border-r border-surface-navHover bg-surface-nav px-3 py-5 text-text-onNav lg:flex'
      )}
    >
      <UbLink
        href={ROUTES.DASHBOARD}
        tone="inherit"
        underline={false}
        aria-label={t('nav.brandHome', { appName })}
        className="flex min-h-11 items-center rounded-control px-2"
      >
        {/* `label` is on the link, not the lockup, so the destination is
            announced once rather than as "DigiKhaato, DigiKhaato link". */}
        <UbLogo variant="full" size="sm" wordmark={appName} tone="inherit" />
      </UbLink>

      {/* PLT-04 §7 — the switcher sits at the top-left of the rail, on the dark
          `--surface-nav`, above the navigation it changes the contents of. */}
      <TenantSwitcherMenu className="px-1" />

      <NavSections />
    </UbBox>
  );
}
