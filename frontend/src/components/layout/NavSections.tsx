'use client';

import { usePathname } from 'next/navigation';

import { UbLink, UbStack, UbText } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { cn } from 'src/utils/cn';

import { useNavigation } from 'modules/DigiKhaato/features/navigation/useNavigation';

/**
 * The entitlement-driven navigation list, shared by the rail and the drawer.
 *
 * It was inlined in `UbSidebar`, which was fine while the rail was the only
 * navigation there was. It stopped being fine the moment a drawer needed the
 * same list: two copies of "which sections, which items, which one is current,
 * what does current look like" drift, and the accent-edge trick below is exactly
 * the sort of detail that gets copied once and then fixed in only one place.
 *
 * Both callers paint on `--surface-nav`, which stays dark in BOTH themes
 * (Zoho-style), which is why this uses the on-nav text tokens rather than
 * `--text-primary`.
 *
 * `onNavigate` exists for the drawer: a rail stays open when you follow a link,
 * a drawer must close. The rail passes nothing.
 */
export function NavSections({
  onNavigate,
}: Readonly<{ onNavigate?: () => void }>): React.JSX.Element {
  const pathname = usePathname();
  const { t } = useTranslation();
  const { sections } = useNavigation();

  return (
    <UbStack gap={0} as="div" className="min-h-0 flex-1">
      {sections.map((section) => (
        /* Figma "menu": 12 px padding, a 10 px section label, rows 2 px apart. */
        <UbStack key={section.key} gap={0} className="gap-0.5 p-3">
          <UbText
            as="span"
            variant="inherit"
            className="ds-nav-caption-medium px-2 pb-0.5 text-text-muted"
          >
            {t(section.labelId)}
          </UbText>
          {section.items.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

            const inner = (
              <>
                {/* The accent edge, outside the row's own box so the label does
                    not move when the row becomes current. */}
                <Icon
                  aria-hidden
                  strokeWidth={active ? 2 : 1.75}
                  className={cn(
                    'h-4 w-4 shrink-0',
                    active ? 'text-text-onNav' : 'text-text-onNavMuted'
                  )}
                />
                <UbText
                  as="span"
                  variant="inherit"
                  truncate
                  className={cn('flex-1', active ? 'ds-nav-label-medium' : 'ds-nav-label-regular')}
                >
                  {t(item.labelId)}
                </UbText>
              </>
            );

            /* 32 px rows (8 px padding around a 16 px line), 4 px radius, a
               12 px icon — Figma "menu item". The current row is the tinted
               one with a hairline edge rather than an accent bar. */
            /* BrandHubSidebarItem: 4 px radius, 8 px padding, a 16 px icon and a
               12/16 label; the current row is neutral-grey-200 with a
               neutral-grey-300 edge. */
            const row =
              'relative flex w-full items-center gap-2 rounded-xs border p-2 ' +
              'transition-colors duration-fast ease-standard';

            // Rows whose page does not exist yet never reach here:
            // `useNavigation` leaves them out (owner rule — unbuilt features
            // are not shown), so every row is a link.
            return (
              <UbLink
                key={item.key}
                href={item.href}
                variant="inherit"
                tone="inherit"
                underline={false}
                aria-current={active ? 'page' : undefined}
                onClick={onNavigate}
                className={cn(
                  row,
                  active
                    ? 'border-border-navActive bg-surface-navActive text-text-onNav'
                    : 'border-transparent text-text-onNavMuted hover:bg-surface-navHover hover:text-text-onNav'
                )}
              >
                {inner}
              </UbLink>
            );
          })}
        </UbStack>
      ))}
    </UbStack>
  );
}
