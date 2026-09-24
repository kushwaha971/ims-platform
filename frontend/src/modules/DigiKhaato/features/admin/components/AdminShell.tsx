'use client';

import type { ReactNode } from 'react';

import { usePathname } from 'next/navigation';

import { UbBox, UbLink, UbLogo, UbStack, UbText } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { ROUTES } from 'src/routes';
import { cn } from 'src/utils/cn';

import { RequireSuperAdmin } from './RequireSuperAdmin';

const NAV = [
  { key: 'tenants', href: ROUTES.ADMIN_TENANTS },
  { key: 'partners', href: ROUTES.ADMIN_PARTNERS },
  { key: 'health', href: ROUTES.ADMIN_HEALTH },
] as const;

/**
 * PLT-14 FR-1 — the console's own chrome: the product mark, three sections and
 * a way back to the app. Deliberately NOT the merchant shell — an operator
 * usually belongs to no business, so the tenant switcher, the inbox poll and
 * the plan dialog would each be asking questions this screen has no answer to.
 * Same design system, dense desktop layout first (NFR), usable on a phone.
 */
export function AdminShell({ children }: Readonly<{ children: ReactNode }>): React.JSX.Element {
  const { t } = useTranslation();
  const pathname = usePathname();
  return (
    <UbStack className="min-h-dvh bg-canvas">
      <UbStack
        as="header"
        direction="row"
        align="center"
        gap={4}
        wrap
        className="min-h-14 border-b border-border-hairline bg-surface-card px-4 py-2 lg:px-6"
      >
        <UbStack direction="row" align="center" gap={2}>
          <UbLogo size="sm" />
          <UbText as="span" variant="body-sm-medium" tone="secondary">
            {t('admin.shell.title')}
          </UbText>
        </UbStack>
        <UbStack as="nav" direction="row" gap={1} aria-label={t('admin.shell.nav')}>
          {NAV.map((item) => {
            const active = pathname?.startsWith(item.href) ?? false;
            return (
              <UbLink
                key={item.key}
                href={item.href}
                underline={false}
                tone="inherit"
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'ds-body-s-medium rounded-control px-3 py-1.5',
                  active ? 'bg-primary-50 text-primary-700' : 'text-text-secondary'
                )}
              >
                {t(`admin.nav.${item.key}`)}
              </UbLink>
            );
          })}
        </UbStack>
        <UbBox className="ml-auto">
          <UbLink href={ROUTES.DASHBOARD} variant="body-sm-medium" underline={false}>
            {t('admin.shell.back')}
          </UbLink>
        </UbBox>
      </UbStack>
      <UbBox as="main" className="flex-1">
        <RequireSuperAdmin>{children}</RequireSuperAdmin>
      </UbBox>
    </UbStack>
  );
}
