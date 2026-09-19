'use client';

import { usePathname } from 'next/navigation';

import { UbBox, UbLink, UbStack, UbText } from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectAppName } from 'src/redux/slice/whiteLabelSlice';
import { cn } from 'src/utils/cn';

import { useNavigation } from 'modules/UdhaarBook/features/navigation/useNavigation';
import { TenantSwitcherMenu } from 'modules/UdhaarBook/features/tenant-switcher/components/TenantSwitcherMenu';

/**
 * Part 23 §23.3 — the entitlement-driven rail: three-to-four groups, one level,
 * active = accent edge + raised surface. `--surface-nav` stays dark in BOTH
 * themes (Zoho-style), which is why this component paints on `bg-surface-nav`
 * and uses the dark-theme text token rather than `--text-primary`.
 *
 * Hidden below 1024 px, where navigation is the drawer + `UbBottomNav`
 * (§19.6.3, Sprint 1).
 */
export function UbSidebar(): React.JSX.Element {
  const { sections } = useNavigation();
  const { t } = useTranslation();
  const pathname = usePathname();
  const appName = useAppSelector(selectAppName);

  return (
    <UbBox
      as="nav"
      aria-label={t('nav.section.daily')}
      className="hidden w-sidebar shrink-0 flex-col gap-6 bg-surface-nav px-3 py-5 text-text-onNav lg:flex"
    >
      <UbText as="span" variant="h4" tone="inherit" className="px-2">
        {appName}
      </UbText>

      {/* PLT-04 §7 — the switcher sits at the top-left of the rail, on the dark
          `--surface-nav`, above the navigation it changes the contents of. */}
      <TenantSwitcherMenu className="px-1" />

      {sections.map((section) => (
        <UbStack key={section.key} gap={1}>
          <UbText as="span" variant="label" tone="onNavMuted" className="px-2">
            {t(section.labelId)}
          </UbText>
          {section.items.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <UbLink
                key={item.key}
                href={item.href}
                tone="inherit"
                underline={false}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-control px-2 py-2',
                  'transition-colors duration-fast ease-standard',
                  active
                    ? 'border-l-2 border-accent bg-surface-navHover'
                    : 'hover:bg-surface-navHover'
                )}
              >
                <Icon aria-hidden className="h-4 w-4 shrink-0" />
                {t(item.labelId)}
              </UbLink>
            );
          })}
        </UbStack>
      ))}
    </UbBox>
  );
}
