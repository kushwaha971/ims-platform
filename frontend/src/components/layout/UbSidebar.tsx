'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectAppName } from 'src/redux/slice/whiteLabelSlice';
import { cn } from 'src/utils/cn';

import { useNavigation } from 'modules/UdhaarBook/features/navigation/useNavigation';

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
    <nav
      aria-label={t('nav.section.daily')}
      className="hidden w-sidebar shrink-0 flex-col gap-6 bg-surface-nav px-3 py-5 text-text-onNav lg:flex"
    >
      <span className="ds-h4 px-2">{appName}</span>

      {sections.map((section) => (
        <div key={section.key} className="flex flex-col gap-1">
          <span className="ds-label px-2 text-text-onNavMuted">{t(section.labelId)}</span>
          {section.items.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'ds-body-sm flex items-center gap-3 rounded-control px-2 py-2',
                  'transition-colors duration-fast ease-standard',
                  active
                    ? 'border-l-2 border-accent bg-surface-navHover'
                    : 'hover:bg-surface-navHover'
                )}
              >
                <Icon aria-hidden className="h-4 w-4 shrink-0" />
                {t(item.labelId)}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
