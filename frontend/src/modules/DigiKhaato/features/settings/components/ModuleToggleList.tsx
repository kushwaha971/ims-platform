'use client';

import { memo, useCallback } from 'react';

import { Lock } from 'lucide-react';

import { UbBox, UbPanel, UbPanelSection, UbStack, UbSwitch, UbText } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';

import type { SettingsModules } from '../types/settings.types';

/**
 * The switches a merchant sees. `platform`, `parties` and `ledger` are the
 * product itself and are never offered (the server refuses to turn them off),
 * and `team` is part of Settings rather than a feature a shop opts into.
 */
const HIDDEN: readonly string[] = ['platform', 'parties', 'ledger', 'team', 'help'];

export interface ModuleToggleListProps {
  readonly modules: SettingsModules;
  readonly canEdit: boolean;
  readonly busy: boolean;
  readonly onChange: (modules: readonly string[]) => void;
}

/**
 * PLT-06 §7 `ModuleToggleList` (FR-4, T-PLT-06-8) — one switch per module the
 * plan and partner allow, and a LOCKED row, with the reason, for each one they
 * do not. A locked module is shown rather than hidden: a shopkeeper looking
 * for "Stock" needs to learn it is not in the plan, not conclude the product
 * has no stock at all.
 *
 * A switch fires the PATCH at once; there is no Save for this section, because
 * a switch that does nothing until a button elsewhere is pressed is a switch
 * that lies about its state.
 */
function ModuleToggleListInner({
  modules,
  canEdit,
  busy,
  onChange,
}: Readonly<ModuleToggleListProps>): React.JSX.Element {
  const { t } = useTranslation();

  const toggle = useCallback(
    (module: string, next: boolean) => {
      const enabled = new Set(modules.enabled);
      if (next) enabled.add(module);
      else enabled.delete(module);
      onChange(Array.from(enabled));
    },
    [modules.enabled, onChange]
  );

  const available = modules.available.filter((module) => !HIDDEN.includes(module));
  const locked = modules.locked.filter((module) => !HIDDEN.includes(module));

  return (
    <UbPanel as="section">
      <UbPanelSection
        title={t('settings.section.modules')}
        badge={canEdit ? undefined : t('settings.viewOnly')}
      >
        <UbStack gap={3}>
          <UbText variant="body-sm" tone="secondary">
            {t('settings.module.intro')}
          </UbText>
          {available.map((module) => (
            <UbSwitch
              key={module}
              checked={modules.enabled.includes(module)}
              onCheckedChange={(next) => toggle(module, next)}
              label={t(`nav.module.${module}`)}
              description={t(`settings.module.${module}.description`)}
              disabled={!canEdit || busy}
            />
          ))}
          {locked.map((module) => (
            <UbStack key={module} direction="row" gap={3} align="start">
              <UbBox className="mt-0.5 text-text-tertiary">
                <Lock aria-hidden className="h-4 w-4" />
              </UbBox>
              <UbStack gap={0.5}>
                <UbText variant="body-medium" tone="secondary">
                  {t(`nav.module.${module}`)}
                </UbText>
                <UbText variant="caption" tone="tertiary">
                  {t('settings.module.locked')}
                </UbText>
              </UbStack>
            </UbStack>
          ))}
        </UbStack>
      </UbPanelSection>
    </UbPanel>
  );
}

export const ModuleToggleList = memo(ModuleToggleListInner);
