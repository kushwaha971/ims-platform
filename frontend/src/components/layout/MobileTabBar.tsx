'use client';

import { LayoutGrid } from 'lucide-react';

import { UbBottomNav, type UbBottomNavItem } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { ROUTES } from 'src/routes';

import { MORE_TAB } from 'modules/DigiKhaato/features/navigation/mobileNav';
import { useMobileNav } from 'modules/DigiKhaato/features/navigation/useMobileNav';

/**
 * docs/mobile-redesign/03 — the phone's bottom navigation, from the open
 * app's manifest: its `bottomNav` rows (at most four) and More.
 *
 * It replaced the ☰ drawer (audit finding A1). The drawer held all 25 Shop
 * rows behind one button; here the four a merchant opens fifty times a day are
 * always in view and in reach of the thumb, and More holds the rest in words.
 *
 * Shown on top-level screens only (`mobileNavState`): a khata, a bill or a
 * form has its own back arrow and its own actions docked at the bottom.
 * `UbBottomNav` is `lg:hidden`, so desktop renders nothing visible.
 */
export function MobileTabBar(): React.JSX.Element | null {
  const { t } = useTranslation();
  const { visible, active, tabs: bottomNav } = useMobileNav();

  if (!visible || bottomNav.length === 0) return null;

  const items: UbBottomNavItem[] = [
    ...bottomNav.map((tab) => {
      const Icon = tab.icon;
      return {
        key: tab.key,
        href: tab.href,
        label: t(tab.tabLabelId ?? tab.labelId),
        icon: <Icon aria-hidden strokeWidth={active === tab.key ? 2 : 1.75} className="h-6 w-6" />,
        active: active === tab.key,
      };
    }),
    {
      key: MORE_TAB,
      href: ROUTES.MORE,
      label: t('nav.more'),
      icon: (
        <LayoutGrid aria-hidden strokeWidth={active === MORE_TAB ? 2 : 1.75} className="h-6 w-6" />
      ),
      active: active === MORE_TAB,
    },
  ];

  return <UbBottomNav label={t('nav.primary')} items={items} />;
}
