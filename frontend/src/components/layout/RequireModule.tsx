'use client';

import type { ReactNode } from 'react';

import { UbActionLink, UbEmptyState, UbPageShell } from 'src/design-system';
import { usePermissions } from 'src/hooks/usePermissions';
import { useTranslation } from 'src/hooks/useTranslation';
import type { ModuleCode } from 'src/types/domain.types';

import { useLandingPath } from 'modules/DigiKhaato/features/navigation/useLandingPath';

/**
 * F01 (G1) — a module's route gate: the module's pages render only while the
 * module is in the tenant's `enabled_modules`; otherwise the page is NOT FOUND.
 *
 * Before it, a typed `/library/...` address for a tenant without the module
 * drew the page shell and then a 403 snackbar from its first request — an
 * unbuilt or unbought feature shown (vision §4). Not found is the truthful
 * answer: for this business the page does not exist. An unreleased module is
 * never in `enabled_modules` (the server hides it), so this is also the
 * release gate on the client.
 *
 * Mounted by the module's route-group layout (`app/(app)/library/layout.tsx`),
 * inside `RequireSession`, so the session is loaded when it decides.
 */
export function RequireModule({
  module,
  children,
}: Readonly<{ module: ModuleCode; children: ReactNode }>): React.JSX.Element {
  const { t } = useTranslation();
  const { hasModule } = usePermissions();
  // The first page of the app the person is in, not the Shop's dashboard.
  const home = useLandingPath();
  if (hasModule(module)) return <>{children}</>;
  return (
    <UbPageShell>
      <UbEmptyState
        variant="firstUse"
        title={t('common.notFound.title')}
        description={t('common.notFound.body')}
        action={
          <UbActionLink href={home} variant="secondary">
            {t('common.action.goHome')}
          </UbActionLink>
        }
      />
    </UbPageShell>
  );
}
