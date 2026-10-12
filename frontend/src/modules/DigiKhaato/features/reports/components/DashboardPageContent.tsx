'use client';

import { useEffect } from 'react';

import dynamic from 'next/dynamic';
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
  useIsMobileLayer,
} from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { useTranslation, type TranslateFn } from 'src/hooks/useTranslation';
import { selectSessionUser } from 'src/redux/slice/sessionSlice';
import { ROUTES } from 'src/routes';

import { LANDING_FALLBACK } from '../../navigation/landing';
import { useLandingPath } from '../../navigation/useLandingPath';
import { appForPath, useNavigation } from '../../navigation/useNavigation';
import { useDashboard } from '../hooks/useDashboard';
import { isFirstUse } from '../view-model/dashboardDisplay';

import {
  FirstUseChecklist,
  LowStockCard,
  RecentActivityList,
  TopDebtorsCard,
} from './DashboardLists';
import { DashboardMobileSummary } from './DashboardMobileSummary';
import { DashboardModuleSections } from './DashboardModuleSections';
import { DashboardTiles } from './DashboardTiles';
import { ReportStateBody } from './ReportStateBody';

/* The graphs arrive after the tiles: a landing screen waits for nothing it
   does not need to answer "what do I collect today". */
const DashboardChartsLazy = dynamic(
  () => import('./DashboardCharts').then((module) => module.DashboardCharts),
  { ssr: false }
);

/**
 * RPT-01 — `/dashboard`, the landing screen: "what do I have to collect, what
 * do I owe, who is due today, what did I sell today, what am I running out
 * of" (§1), each a tap from the list that answers it.
 *
 * ── Who lands here ────────────────────────────────────────────────────────
 * Every member with `reports.basic.read` and the reports module on (§12 —
 * staff included, with the tiles their permissions allow). Anyone else is
 * sent on to the first navigation item they can see (R49, A16 —
 * `navigation/landing.ts`); the route is the post-login address either way.
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
  const isMobileLayer = useIsMobileLayer();
  const landing = useLandingPath();
  const { app } = useNavigation();
  const user = useAppSelector(selectSessionUser);

  // docs/platform/14 §4.2 — this page belongs to the app that declares it. A
  // person who cannot open that app here (a library's staff, a lender) is
  // sent on to the first page of the app they are in.
  const elsewhere = !!app && app !== appForPath(ROUTES.DASHBOARD);

  useEffect(() => {
    // Never back to this page: were the two gates ever to disagree, a loop on
    // the first screen after signing in is the worst place to find out.
    if (!dash.canRead) router.replace(landing === ROUTES.DASHBOARD ? LANDING_FALLBACK : landing);
    else if (elsewhere) router.replace(landing);
  }, [dash.canRead, elsewhere, landing, router]);

  if (!dash.canRead || elsewhere) return <UbPageSkeleton variant="card" />;

  const { data } = dash;
  const state = data ? 'ready' : dash.status === 'failed' ? 'error' : 'loading';

  const canBill = hasModule('sales') && can('sales.invoice.write');
  const canBuy = hasModule('purchases') && can('purchases.bill.write');
  // "Send reminders" to nobody was noise on day one (review §1.1): it shows
  // only when somebody has something to give.
  const owed = Number(data?.tiles.toCollect?.amount ?? 0) > 0;
  const canRemind = hasModule('ledger') && can('ledger.reminder.write') && owed;
  // The approved design (12 Oct 2026): a book with nothing in it is the three
  // steps and nothing else — no actions, no refresh, no empty cards.
  const dayOne = !!data && isFirstUse(data.firstUse);
  const firstName = (user?.name ?? '').trim().split(/\s+/)[0] ?? '';

  return (
    <UbPageShell>
      <UbPageHeader
        title={
          dayOne
            ? firstName
              ? t('reports.dashboard.welcome', { name: firstName })
              : t('reports.dashboard.welcomeNoName')
            : t('reports.dashboard.title')
        }
        /* FR-8 — "Updated 30 s ago": under the title at every width, so a
           phone shows it too, and it ages as the figures do. */
        subtitle={data && !dayOne ? updatedLabel(t, dash.secondsAgo) : undefined}
        actions={
          dayOne ? undefined : (
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
          )
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
              {/* docs/mobile-redesign (A7, A8) — the phone's top of Home. */}
              {isMobileLayer && !isFirstUse(data.firstUse) && (
                <DashboardMobileSummary
                  tiles={data.tiles}
                  t={t}
                  canBill={canBill}
                  canBuy={canBuy}
                  canRemind={canRemind}
                />
              )}
              {(canBill || canBuy || canRemind) && !dayOne && !isMobileLayer && (
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
                  }}
                  t={t}
                />
              ) : (
                <>
                  {!isMobileLayer && <DashboardTiles tiles={data.tiles} t={t} />}
                  <DashboardChartsLazy refreshKey={data.generatedAt} />
                </>
              )}

              {/* Each card only when it has something in it (approved design):
                  an empty box headed "Running low" says nothing a merchant can
                  act on. */}
              {(() => {
                const activity = data.recentActivity.length > 0;
                const debtors = !!data.tiles.toCollect && data.topDebtors.length > 0;
                const low = !!data.tiles.lowStock && data.lowStockItems.length > 0;
                if (dayOne || !(activity || debtors || low)) return null;
                return (
                  <UbGrid columns={{ base: 1, lg: activity && (debtors || low) ? 2 : 1 }} gap={4}>
                    {activity && <RecentActivityList items={data.recentActivity} t={t} />}
                    {(debtors || low) && (
                      <UbStack gap={4}>
                        {debtors && <TopDebtorsCard debtors={data.topDebtors} t={t} />}
                        {low && <LowStockCard items={data.lowStockItems} t={t} />}
                      </UbStack>
                    )}
                  </UbGrid>
                );
              })()}

              {/* A10 — the modules' sections, below the core tiles and lists. */}
              <DashboardModuleSections sections={data.sections} onRetry={dash.refresh} t={t} />
            </UbStack>
          )}
        </ReportStateBody>
      </UbStack>
    </UbPageShell>
  );
}
