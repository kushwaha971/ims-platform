'use client';

import { memo } from 'react';
import type { ReactNode } from 'react';

import { Lock } from 'lucide-react';

import { UbEmptyState } from 'src/design-system';
import { usePermissions } from 'src/hooks/usePermissions';
import { useTranslation } from 'src/hooks/useTranslation';
import type { ModuleCode } from 'src/types/domain.types';

/**
 * PLT-15 AC-4 / Part 19 §19.6.4 rule 3 — a module outside the tenant's
 * effective entitlement is ABSENT from navigation (that is `useNavigation()`'s
 * job), but a DEEP LINK into it must produce an explanation rather than a
 * silent redirect to the dashboard.
 *
 * "A shared link produces an explanation, not a mysterious dashboard" is the
 * whole reason this component exists: the merchant who was sent the link did
 * nothing wrong and needs to be told which business feature is switched off and
 * who can switch it on.
 *
 * §7's `LockedModuleHint` on a sidebar item is deliberately NOT built: the
 * sidebar hides what is not entitled (R-SEC-2, §19.7.5), and a greyed row with
 * a padlock is an upsell surface, which §8 says MVP does not have ("Tone:
 * factual; no upsell copy at MVP").
 */
export interface ModuleGateProps {
  readonly module: ModuleCode;
  readonly children: ReactNode;
}

function ModuleGateBase({ module, children }: Readonly<ModuleGateProps>) {
  const { t } = useTranslation();
  const { hasModule } = usePermissions();

  if (hasModule(module)) return <>{children}</>;

  return (
    <UbEmptyState
      variant="filtered"
      title={t('plan.module.locked.title')}
      description={t('plan.module.locked.body', { module: t(`nav.module.${module}`) })}
      action={<Lock aria-hidden className="h-5 w-5 text-text-tertiary" />}
    />
  );
}

ModuleGateBase.displayName = 'ModuleGate';
export const ModuleGate = memo(ModuleGateBase);
