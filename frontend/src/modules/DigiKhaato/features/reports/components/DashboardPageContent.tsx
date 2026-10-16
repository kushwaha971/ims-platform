'use client';

import { useEffect } from 'react';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

import { FilePlus, RefreshCw } from 'lucide-react';

import {
  UbActionLink,
  UbButton,
  UbGrid,
  UbMoreActions,
  UbPageHeader,
  UbPageShell,
  UbPageSkeleton,
  UbStack,
  type UbMenuListRow,
} from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { useTranslation, type TranslateFn } from 'src/hooks/useTranslation';
import { selectActiveTenant, selectSessionUser } from 'src/redux/slice/sessionSlice';
import { ROUTES } from 'src/routes';
import { formatBusinessDate } from 'src/utils/dates';

import { LANDING_FALLBACK } from '../../navigation/landing';
import { useLandingPath } from '../../navigation/useLandingPath';
import { appForPath, useNavigation } from '../../navigation/useNavigation';
import { useDashboard } from '../hooks/useDashboard';
import { isFirstUse } from '../view-model/dashboardDisplay';

import { FirstUseChecklist } from './DashboardLists';
import { DashboardModuleSections } from './DashboardModuleSections';
import {
  ActivityAndLowStock,
  CustomersPanel,
  DashboardTodayRow,
  failed,
  NeedsAttention,
  SuppliersPanel,
} from './DashboardPanels';
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
 * ── Layout A (owner, 16 Oct 2026) ─────────────────────────────────────────
 * WP-06, "two books side by side": the header names the business, the Shop
 * and the day; New bill is always shown and the rest (a purchase, a payment,
 * an expense) are under More, each opening its form, not a list. Then the
 * Today row, the Customers and Suppliers panels, Needs attention, recent
 * activity, and the charts — the same order on a phone, in one column
 * (docs/shop-ims-readiness/13-shop-dashboard-design-review.md).
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
  const landing = useLandingPath();
  const { app } = useNavigation();
  const user = useAppSelector(selectSessionUser);
  const tenant = useAppSelector(selectActiveTenant);

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
  const canPay = hasModule('payments') && can('payments.payment.write');
  const canSpend = hasModule('expenses') && can('expenses.expense.write');
  const more: UbMenuListRow[] = [
    ...(canBuy
      ? [
          {
            key: 'purchase',
            label: t('reports.dashboard.quick.newPurchase'),
            href: `${ROUTES.PURCHASE_BILLS}/new`,
          },
        ]
      : []),
    ...(canPay
      ? [
          {
            key: 'payment',
            label: t('reports.dashboard.quick.recordPayment'),
            href: `${ROUTES.PAYMENTS}?add=1`,
          },
        ]
      : []),
    ...(canSpend
      ? [
          {
            key: 'expense',
            label: t('reports.dashboard.quick.addExpense'),
            href: `${ROUTES.EXPENSES}?add=1`,
          },
        ]
      : []),
  ];
  // The approved design (12 Oct 2026): a book with nothing in it is the three
  // steps and nothing else — no actions, no refresh, no empty cards.
  const dayOne = !!data && isFirstUse(data.firstUse);
  const firstName = (user?.name ?? '').trim().split(/\s+/)[0] ?? '';

  return (
    <UbPageShell>
      <UbPageHeader
        /* The title is the business's name, and a name is not cut: "Shree
           Ganesh Kirana Stores" read "Shree Ganesh Ki…" on a 360 px phone. */
        wrapTitle
        title={
          dayOne
            ? firstName
              ? t('reports.dashboard.welcome', { name: firstName })
              : t('reports.dashboard.welcomeNoName')
            : tenant?.name || t('reports.dashboard.title')
        }
        /* WP-06 DASH-01 — whose Shop, which day, and how fresh: "Shop · Today,
           16/10/2026 · Updated 30 s ago". FR-8's age is kept at every width. */
        subtitle={
          data && !dayOne
            ? t('reports.dashboard.header.subtitle', {
                date: formatBusinessDate(data.asOf),
                updated: updatedLabel(t, dash.secondsAgo),
              })
            : undefined
        }
        actions={
          dayOne ? undefined : (
            <UbStack direction="row" align="center" className="gap-2">
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
              <UbMoreActions
                label={t('reports.dashboard.quick.more')}
                title={t('reports.dashboard.quick.moreTitle')}
                closeLabel={t('common.action.close')}
                rows={more}
                size="sm"
              />
              <UbButton
                variant="secondary"
                size="sm"
                icon={<RefreshCw className="h-4 w-4" aria-hidden />}
                iconOnly
                busy={dash.refreshing}
                busyLabel={t('reports.dashboard.refreshing')}
                onClick={dash.refresh}
              >
                {t('reports.dashboard.refresh')}
              </UbButton>
            </UbStack>
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
                  <DashboardTodayRow data={data} onRetry={dash.refresh} t={t} />
                  {(data.tiles.toCollect || data.tiles.toPay || failed(data, ['party_tiles'])) && (
                    <UbGrid columns={{ base: 1, lg: 2 }} gap={4}>
                      <CustomersPanel data={data} onRetry={dash.refresh} t={t} />
                      <SuppliersPanel data={data} onRetry={dash.refresh} t={t} />
                    </UbGrid>
                  )}
                  <NeedsAttention data={data} onRetry={dash.refresh} t={t} />
                  <ActivityAndLowStock data={data} onRetry={dash.refresh} t={t} />
                </>
              )}

              {/* The charts, below the figures and the lists rather than above
                  them (approved design, 12 Oct 2026): useful when there is time
                  to look, not the first thing on the screen. */}
              {!dayOne && <DashboardChartsLazy refreshKey={data.generatedAt} />}

              {/* A10 — the modules' sections, below the core tiles and lists. */}
              <DashboardModuleSections sections={data.sections} onRetry={dash.refresh} t={t} />
            </UbStack>
          )}
        </ReportStateBody>
      </UbStack>
    </UbPageShell>
  );
}
