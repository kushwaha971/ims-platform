'use client';

import { useEffect } from 'react';

import { useRouter } from 'next/navigation';

import { BellRing, FilePlus, RefreshCw, ShoppingCart } from 'lucide-react';

import {
  UbActionLink,
  UbButton,
  UbGrid,
  UbPageHeader,
  UbPageShell,
  UbPageSkeleton,
  UbStack,
} from 'src/design-system';
import { usePermissions } from 'src/hooks/usePermissions';
import { useTranslation, type TranslateFn } from 'src/hooks/useTranslation';
import { ROUTES } from 'src/routes';

import { useDashboard } from '../hooks/useDashboard';
import { isFirstUse } from '../view-model/dashboardDisplay';

import {
  FirstUseChecklist,
  LowStockCard,
  RecentActivityList,
  TopDebtorsCard,
} from './DashboardLists';
import { DashboardTiles } from './DashboardTiles';
import { ReportStateBody } from './ReportStateBody';

/**
 * RPT-01 — `/dashboard`, the landing screen: "what do I have to collect, what
 * do I owe, who is due today, what did I sell today, what am I running out
 * of" (§1), each a tap from the list that answers it.
 *
 * ── Who lands here ────────────────────────────────────────────────────────
 * Every member with `reports.basic.read` and the reports module on (§12 —
 * staff included, with the tiles their permissions allow). Anyone else is
 * sent on to the customer list, which is where the product landed before
 * the dashboard existed; the route is the post-login address either way.
 *
 * ── What is deliberately not here ─────────────────────────────────────────
 * FR-7's quick actions are the ones that DO something from this screen: a new
 * bill, a new purchase bill, the reminders round. You gave / You got need a
 * party and Add item needs the item drawer, and none of the three can open
 * from here yet — a button that lands on a list is a link pretending to be an
 * action. A debtor's Remind is on its row (FR-4); "Bill" per debtor waits for
 * the bill editor to accept a party.
 */
const updatedLabel = (t: TranslateFn, seconds: number): string =>
  seconds < 60
    ? t('reports.dashboard.updated.seconds', { seconds })
    : t('reports.dashboard.updated.minutes', { minutes: Math.floor(seconds / 60) });

export function DashboardPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const { can, hasModule } = usePermissions();
  const dash = useDashboard();

  useEffect(() => {
    if (!dash.canRead) router.replace(ROUTES.PARTIES);
  }, [dash.canRead, router]);

  if (!dash.canRead) return <UbPageSkeleton variant="card" />;

  const { data } = dash;
  const state = data ? 'ready' : dash.status === 'failed' ? 'error' : 'loading';

  const canBill = hasModule('sales') && can('sales.invoice.write');
  const canBuy = hasModule('purchases') && can('purchases.bill.write');
  const canRemind = hasModule('ledger') && can('ledger.reminder.write');

  return (
    <UbPageShell>
      <UbPageHeader
        title={t('reports.dashboard.title')}
        /* FR-8 — "Updated 30 s ago": under the title at every width, so a
           phone shows it too, and it ages as the figures do. */
        subtitle={data ? updatedLabel(t, dash.secondsAgo) : undefined}
        actions={
          <UbButton
            variant="secondary"
            icon={<RefreshCw className="h-4 w-4" aria-hidden />}
            iconOnly="mobile"
            busy={dash.refreshing}
            busyLabel={t('reports.dashboard.refreshing')}
            onClick={dash.refresh}
          >
            {t('reports.dashboard.refresh')}
          </UbButton>
        }
      />
      <UbStack gap={4} data-testid="dashboard-screen">
        {/* The state half of the report shell only: the landing page must not
            download the period picker's calendar to draw its skeleton. */}
        <ReportStateBody
          state={state}
          error={dash.error}
          onRetry={dash.retry}
          loadingLabel={t('reports.dashboard.loading')}
          skeletonTiles={8}
        >
          {data && (
            <UbStack gap={4}>
              {(canBill || canBuy || canRemind) && (
                <UbStack
                  direction="row"
                  // QA R-D4 — the chips wrap on a phone rather than scrolling
                  // "Send reminders" half off the edge of a 390 px screen.
                  // 16 px between wrapped rows on a phone: each 28 px action's
                  // 44 px hit area (`.ub-hit`) overhangs 8 px above and below,
                  // and at 8 px the second row covered the first (Sprint 12).
                  className="flex-wrap gap-2 max-sm:gap-y-4"
                  aria-label={t('reports.dashboard.quick.label')}
                  role="group"
                >
                  {canBill && (
                    <UbActionLink
                      href={`${ROUTES.SALES_INVOICES}/new`}
                      variant="primary"
                      size="sm"
                      icon={<FilePlus className="h-4 w-4" aria-hidden />}
                    >
                      {t('reports.dashboard.quick.newBill')}
                    </UbActionLink>
                  )}
                  {canBuy && (
                    <UbActionLink
                      href={`${ROUTES.PURCHASE_BILLS}/new`}
                      variant="secondary"
                      size="sm"
                      icon={<ShoppingCart className="h-4 w-4" aria-hidden />}
                    >
                      {t('reports.dashboard.quick.newPurchase')}
                    </UbActionLink>
                  )}
                  {canRemind && (
                    <UbActionLink
                      href={ROUTES.LEDGER_REMINDERS}
                      variant="secondary"
                      size="sm"
                      icon={<BellRing className="h-4 w-4" aria-hidden />}
                    >
                      {t('reports.dashboard.quick.remind')}
                    </UbActionLink>
                  )}
                </UbStack>
              )}

              {isFirstUse(data.firstUse) ? (
                <FirstUseChecklist
                  firstUse={data.firstUse}
                  steps={{
                    party: hasModule('parties') && can('parties.party.write'),
                    item: hasModule('inventory') && can('inventory.item.write'),
                    bill: canBill,
                    upi: can('platform.tenant.manage'),
                  }}
                  t={t}
                />
              ) : (
                <DashboardTiles tiles={data.tiles} t={t} />
              )}

              <UbGrid columns={{ base: 1, lg: 2 }} gap={4}>
                <RecentActivityList items={data.recentActivity} t={t} />
                <UbStack gap={4}>
                  {data.tiles.toCollect && <TopDebtorsCard debtors={data.topDebtors} t={t} />}
                  {data.tiles.lowStock && <LowStockCard items={data.lowStockItems} t={t} />}
                </UbStack>
              </UbGrid>
            </UbStack>
          )}
        </ReportStateBody>
      </UbStack>
    </UbPageShell>
  );
}
