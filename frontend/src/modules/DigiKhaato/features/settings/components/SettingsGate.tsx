'use client';

import type { ReactNode } from 'react';

import { UbActionLink, UbEmptyState, UbPageShell } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { ROUTES } from 'src/routes';

import { useSettingsAccess, type SettingsAccess } from '../hooks/useSettingsAccess';

/** Which `useSettingsAccess` flag a settings section needs. */
export type SettingsGateNeed = keyof Pick<
  SettingsAccess,
  'canView' | 'canReadAudit' | 'canManageTeam' | 'isOwner'
>;

/**
 * QA D4 — a Settings section opened directly by someone whose role cannot use
 * it. The hub already hides those links, but the address still works: staff
 * who typed /settings/activity got the whole page drawn, its request sent, and
 * THEN a permission error from the server. The section is now never mounted —
 * so it fetches nothing — and the merchant gets one calm "not available" with
 * a way back, as the bills, expenses and aging pages already do.
 *
 * The gate uses the same flags as the hub's links, so a section is reachable
 * exactly when the hub offers it. The server's check still stands behind it.
 */
export function SettingsGate({
  need,
  children,
}: Readonly<{ need: SettingsGateNeed; children: ReactNode }>): React.JSX.Element {
  const { t } = useTranslation();
  const access = useSettingsAccess();
  if (access[need]) return <>{children}</>;
  return (
    <UbPageShell>
      <UbEmptyState
        variant="firstUse"
        title={t('settings.noAccess.title')}
        description={t('settings.noAccess.body')}
        action={
          <UbActionLink href={ROUTES.SETTINGS} variant="secondary">
            {t('settings.noAccess.back')}
          </UbActionLink>
        }
      />
    </UbPageShell>
  );
}
