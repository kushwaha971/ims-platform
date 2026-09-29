'use client';

import { useCallback, useMemo } from 'react';

import {
  Building2,
  CalendarDays,
  ChevronRight,
  CreditCard,
  DatabaseBackup,
  History,
  MonitorSmartphone,
  Palette,
  Users,
  type LucideIcon,
} from 'lucide-react';

import {
  UbBox,
  UbButton,
  UbConfirmDialog,
  UbEmptyState,
  UbLink,
  UbPageHeader,
  UbPageShell,
  UbPanel,
  UbPanelSection,
  UbSkeleton,
  UbStack,
  UbText,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { ROUTES } from 'src/routes';

import { useSettingsAccess } from '../hooks/useSettingsAccess';
import { useTenantSettings } from '../hooks/useTenantSettings';

import { LedgerSettingsSection } from './LedgerSettingsSection';
import { ModuleToggleList } from './ModuleToggleList';

interface HubLink {
  readonly key: string;
  readonly href: string;
  readonly icon: LucideIcon;
  readonly show: boolean;
}

/**
 * PLT-06 — Settings. The page is two things: the doors to the business's own
 * records (profile, branding, team, plan, activity, devices), and the tenant
 * settings that have a consumer in the product today.
 *
 * ── What is NOT on this page yet, and why ───────────────────────────────────
 * FR-1 also lists Documents (numbering, due days, bill terms, the UPI QR),
 * Stock and Party labels. The server stores and validates every one of them
 * (`GET/PUT /tenants/current/settings` round-trips the whole object, numbering
 * included), but nothing in the product READS them yet — there are no bills,
 * no stock screens and no party-label copy. A switch whose effect nobody can
 * see teaches a merchant the product is broken (docs/DESIGN-SYSTEM.md §5), so
 * those sections join this page with the features that consume them.
 */
export function SettingsPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const access = useSettingsAccess();
  const settings = useTenantSettings(access.canView);
  const { data, status, error, refetch } = settings;

  const links = useMemo<readonly HubLink[]>(
    () => [
      { key: 'profile', href: ROUTES.SETTINGS_PROFILE, icon: Building2, show: access.canView },
      { key: 'branding', href: ROUTES.SETTINGS_BRANDING, icon: Palette, show: access.canView },
      { key: 'team', href: ROUTES.SETTINGS_TEAM, icon: Users, show: access.canManageTeam },
      { key: 'plan', href: ROUTES.SETTINGS_PLAN, icon: CreditCard, show: access.canView },
      { key: 'activity', href: ROUTES.SETTINGS_ACTIVITY, icon: History, show: access.canReadAudit },
      { key: 'devices', href: ROUTES.SETTINGS_DEVICES, icon: MonitorSmartphone, show: true },
      { key: 'data', href: ROUTES.SETTINGS_DATA, icon: DatabaseBackup, show: access.isOwner },
      // A9b (PLT-X08 §7) — only while an enabled feature reads the calendar:
      // business days for a shop with nothing that counts days would be a
      // setting whose effect nobody can see.
      {
        key: 'businessDays',
        href: ROUTES.SETTINGS_BUSINESS_DAYS,
        icon: CalendarDays,
        show: access.canView && (data?.calendarReaders.length ?? 0) > 0,
      },
    ],
    [access, data?.calendarReaders]
  );

  const handleConflictOpenChange = useCallback(
    (next: boolean) => {
      if (!next) settings.reloadAfterConflict();
    },
    [settings]
  );
  const handleModules = useCallback(
    (modules: readonly string[]) => void settings.setModules(modules),
    [settings]
  );

  const header = <UbPageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />;

  let sections: React.ReactNode = null;
  if (!access.canView) {
    sections = null;
  } else if (status === 'failed') {
    sections = (
      <UbEmptyState
        variant="error"
        title={t('settings.error.title')}
        description={error?.message ?? t('settings.error.body')}
        requestId={error?.requestId ?? null}
        requestIdLabel={t('common.error.reference')}
        action={
          <UbButton variant="secondary" onClick={refetch}>
            {t('common.action.retry')}
          </UbButton>
        }
      />
    );
  } else if (!data) {
    sections = <UbSkeleton variant="form" count={4} />;
  } else {
    sections = (
      <UbStack gap={4}>
        <LedgerSettingsSection settings={settings} canEdit={access.canEdit} />
        <ModuleToggleList
          modules={data.modules}
          canEdit={access.canEdit}
          busy={settings.isTogglingModules || !settings.canWrite}
          onChange={handleModules}
          refusal={settings.moduleRefusal}
        />
      </UbStack>
    );
  }

  return (
    <UbPageShell header={header} width="measure">
      <UbStack gap={4}>
        <UbPanel as="section">
          <UbPanelSection title={t('settings.hub.title')}>
            <UbStack as="ul" gap={0}>
              {links
                .filter((link) => link.show)
                .map((link) => (
                  <UbBox
                    as="li"
                    key={link.key}
                    className="border-b border-border-subtle last:border-0"
                  >
                    <UbLink
                      href={link.href}
                      variant="inherit"
                      tone="primary"
                      underline={false}
                      className="flex min-h-14 items-center gap-3 py-2"
                    >
                      <link.icon aria-hidden className="h-5 w-5 shrink-0 text-text-secondary" />
                      <UbStack gap={0.5} className="min-w-0 flex-1">
                        <UbText as="span" variant="body-medium">
                          {t(`settings.hub.${link.key}`)}
                        </UbText>
                        <UbText as="span" variant="caption" tone="tertiary">
                          {t(`settings.hub.${link.key}.description`)}
                        </UbText>
                      </UbStack>
                      <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-text-tertiary" />
                    </UbLink>
                  </UbBox>
                ))}
            </UbStack>
          </UbPanelSection>
        </UbPanel>
        {sections}
      </UbStack>

      <UbConfirmDialog
        open={settings.conflict}
        onOpenChange={handleConflictOpenChange}
        title={t('settings.conflict.title')}
        description={t('settings.conflict')}
        confirmLabel={t('settings.conflict.reload')}
        cancelLabel={t('common.action.cancel')}
        closeLabel={t('common.action.close')}
        onConfirm={settings.reloadAfterConflict}
      />
    </UbPageShell>
  );
}
