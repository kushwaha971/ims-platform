'use client';

import { UbButton, UbCard, UbStack, UbText } from 'src/design-system';
import type { TranslateFn } from 'src/hooks/useTranslation';

import { dashboardSectionComponent } from '../dashboardSections';

import type { DashboardSection } from '../types/reports.types';

/**
 * A10 / FRD 00 PLT-X13 §8 — the modules' blocks below the core dashboard.
 *
 * Only a section the SERVER returned (module on, codename held) AND a module
 * registered a component for is drawn. Each section draws its own `UbCard`,
 * titled in the module's words; an `unavailable` one — its server selector
 * failed — is a card with one line and a retry, never a blank. Headings group
 * sections by module only when two or more modules contribute, which is the
 * navigation's rule (10-architecture §6 item 2): one vertical, no headings,
 * today's look.
 */
export interface DashboardModuleSectionsProps {
  readonly sections: readonly DashboardSection[];
  readonly onRetry: () => void;
  readonly t: TranslateFn;
}

export function DashboardModuleSections({
  sections,
  onRetry,
  t,
}: DashboardModuleSectionsProps): React.JSX.Element | null {
  const drawn = sections.filter((section) => dashboardSectionComponent(section.key) !== null);
  if (drawn.length === 0) return null;

  const modules = [...new Set(drawn.map((section) => section.module))];
  const grouped = modules.length >= 2;

  const renderSection = (section: DashboardSection): React.JSX.Element => {
    const Section = dashboardSectionComponent(section.key);
    if (section.unavailable || !Section) {
      return (
        <UbCard key={section.key}>
          <UbStack direction="row" gap={3} className="items-center justify-between">
            <UbText variant="body-sm">{t('reports.dashboard.section.unavailable')}</UbText>
            <UbButton variant="secondary" size="sm" onClick={onRetry}>
              {t('common.action.retry')}
            </UbButton>
          </UbStack>
        </UbCard>
      );
    }
    return <Section key={section.key} data={section.data} />;
  };

  return (
    <UbStack gap={4} data-testid="dashboard-module-sections">
      {grouped
        ? modules.map((module) => (
            <UbStack key={module} gap={3}>
              <UbText as="h2" variant="h3">
                {t(`nav.module.${module}`)}
              </UbText>
              {drawn.filter((section) => section.module === module).map(renderSection)}
            </UbStack>
          ))
        : drawn.map(renderSection)}
    </UbStack>
  );
}
