'use client';

import { NavSections } from 'src/components/layout/NavSections';
import { UbBox } from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectAppName } from 'src/redux/slice/whiteLabelSlice';
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
    /* BrandHub's sidebar contents (business block, divider, 12 px sections of
       32 px rows), DOCKED rather than floating: full height, flush to the
       left edge, a hairline on the right — the owner's call over the Figma's
       floating card. Sticky so it stays put while the page scrolls. */
    /* UAT D3 — `data-print="hide"` as well as being a `nav`: the print sheet
       must not depend on which element this happens to be rendered as. */
    <UbBox
      as="nav"
      data-print="hide"
      aria-label={t('nav.primary')}
      className={cn(
        'sticky top-0 hidden h-dvh w-sidebar shrink-0 flex-col overflow-y-auto lg:flex',
        'border-r border-border-hairline bg-surface-nav text-text-onNav'
      )}
    >
      <TenantSwitcherMenu rail caption={appName} />
      <UbBox aria-hidden className="h-px w-full shrink-0 bg-border-hairline" />
      <NavSections />
    </UbBox>
  );
}
