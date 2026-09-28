'use client';

import { useMemo } from 'react';

import {
  BookOpen,
  BookOpenText,
  ChevronRight,
  Hourglass,
  PackageMinus,
  PackageSearch,
  type LucideIcon,
  Landmark,
  ReceiptText,
  ShoppingCart,
} from 'lucide-react';

import {
  UbCard,
  UbEmptyState,
  UbGrid,
  UbLink,
  UbPageHeader,
  UbPageShell,
  UbSectionHeading,
  UbStack,
  UbText,
} from 'src/design-system';
import { usePermissions } from 'src/hooks/usePermissions';
import { useTranslation } from 'src/hooks/useTranslation';

import {
  REPORT_CATALOGUE,
  REPORT_GROUPS,
  visibleReports,
  type ReportCatalogueEntry,
} from '../constants/reportCatalogue';

const ICONS: Readonly<Record<ReportCatalogueEntry['icon'], LucideIcon>> = {
  dayBook: BookOpenText,
  cashbook: BookOpen,
  receivable: Hourglass,
  payable: Hourglass,
  stock: PackageSearch,
  lowStock: PackageMinus,
  salesRegister: ReceiptText,
  purchaseRegister: ShoppingCart,
  gst: Landmark,
};

/**
 * `/reports` — the index of reports this reader can open (RPT-common:
 * "index of reports by permission"), grouped as a merchant thinks about them:
 * money, parties, stock. Every row is a built screen; a report its reader may
 * not open is not listed at all, rather than listed and refused.
 */
export function ReportsHubPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const { can, hasModule } = usePermissions();
  const visible = useMemo(() => visibleReports(REPORT_CATALOGUE, can, hasModule), [can, hasModule]);

  return (
    <UbPageShell>
      <UbPageHeader
        title={t('reports.shell.hub.title')}
        subtitle={t('reports.shell.hub.description')}
      />
      {visible.length === 0 ? (
        <UbEmptyState
          variant="firstUse"
          title={t('reports.shell.noAccess.title')}
          description={t('reports.shell.noAccess.body')}
        />
      ) : (
        <UbStack gap={4} data-testid="reports-hub">
          {REPORT_GROUPS.map((group) => {
            const entries = visible.filter((entry) => entry.group === group);
            if (entries.length === 0) return null;
            return (
              <UbStack
                key={group}
                gap={2}
                as="section"
                aria-label={t(`reports.shell.hub.group.${group}`)}
              >
                <UbSectionHeading title={t(`reports.shell.hub.group.${group}`)} />
                <UbGrid columns={{ base: 1, md: 2, lg: 3 }} gap={3}>
                  {entries.map((entry) => {
                    const Icon = ICONS[entry.icon];
                    return (
                      // The card carries a chevron and reads as one target, so it
                      // is one: the title link's `::after` covers the card (a
                      // stretched link). It was an 18 px line of text inside a
                      // 90 px card that did nothing when tapped (Sprint 12, R-A-3).
                      <UbCard key={entry.key} padded className="relative">
                        <UbStack direction="row" align="start" className="gap-3">
                          <Icon className="mt-0.5 h-5 w-5 shrink-0 text-text-accent" aria-hidden />
                          <UbStack gap={1} className="min-w-0 flex-1">
                            <UbLink
                              href={entry.href}
                              variant="body-medium"
                              className="after:absolute after:inset-0 after:rounded-card after:content-['']"
                            >
                              {t(`reports.shell.hub.${entry.key}.title`)}
                            </UbLink>
                            <UbText variant="body-sm" tone="tertiary">
                              {t(`reports.shell.hub.${entry.key}.description`)}
                            </UbText>
                          </UbStack>
                          <ChevronRight
                            className="h-4 w-4 shrink-0 text-text-tertiary"
                            aria-hidden
                          />
                        </UbStack>
                      </UbCard>
                    );
                  })}
                </UbGrid>
              </UbStack>
            );
          })}
        </UbStack>
      )}
    </UbPageShell>
  );
}
