'use client';

import {
  AlarmClock,
  BellRing,
  CalendarClock,
  FilePlus,
  PackageMinus,
  ShoppingCart,
} from 'lucide-react';

import {
  UbAttentionList,
  UbHeroPair,
  UbMiniStatStrip,
  UbQuickActions,
  UbStack,
  UbText,
  type UbAttentionItem,
  type UbHeroFigure,
  type UbMiniStat,
  type UbQuickAction,
} from 'src/design-system';
import type { TranslateFn } from 'src/hooks/useTranslation';
import { ROUTES } from 'src/routes';

import { shortInr, tileHref } from '../view-model/dashboardDisplay';

import type { DashboardTiles } from '../types/reports.types';

/**
 * docs/mobile-redesign/05 (Home, audit A7/A8) — the dashboard's top on a
 * phone: the two numbers asked every morning, today's figures in one row, the
 * shortcuts in the thumb's reach, and what needs doing as a list.
 *
 * It is the SAME data the desktop tiles draw (`data.tiles`, `tileHref`), laid
 * out for a thumb; the charts, recent activity and module sections follow it
 * unchanged. Rendered only on the phone layer, so a desktop dashboard is
 * exactly what it was.
 */
export function DashboardMobileSummary({
  tiles,
  t,
  canBill,
  canBuy,
  canRemind,
}: Readonly<{
  tiles: DashboardTiles;
  t: TranslateFn;
  canBill: boolean;
  canBuy: boolean;
  canRemind: boolean;
}>): React.JSX.Element {
  const units = {
    lakh: t('reports.dashboard.short.lakh'),
    crore: t('reports.dashboard.short.crore'),
  };
  const money = (value: string | undefined) => shortInr(value ?? '0.00', units).text;

  const hero: UbHeroFigure[] = [];
  if (tiles.toCollect)
    hero.push({
      key: 'toCollect',
      label: t('reports.dashboard.tile.toCollect'),
      value: money(tiles.toCollect.amount),
      href: tileHref('toCollect', tiles),
      tone: 'danger',
    });
  if (tiles.toPay)
    hero.push({
      key: 'toPay',
      label: t('reports.dashboard.tile.toPay'),
      value: money(tiles.toPay.amount),
      href: tileHref('toPay', tiles),
      tone: 'success',
    });

  const strip: UbMiniStat[] = [];
  if (tiles.todaySales)
    strip.push({
      key: 'todaySales',
      label: t('reports.dashboard.tile.todaySales'),
      value: money(tiles.todaySales.amount),
    });
  if (tiles.cashInHand)
    strip.push({
      key: 'cashInHand',
      label: t('reports.dashboard.tile.cashInHand'),
      value: money(tiles.cashInHand.amount),
    });
  if (tiles.upcoming7d)
    strip.push({
      key: 'upcoming7d',
      label: t('reports.dashboard.tile.upcoming7d'),
      value: money(tiles.upcoming7d.amount),
      href: tileHref('upcoming7d', tiles),
    });

  const quick: UbQuickAction[] = [];
  if (canBill)
    quick.push({
      key: 'bill',
      label: t('reports.dashboard.quick.newBill'),
      icon: <FilePlus aria-hidden />,
      href: `${ROUTES.SALES_INVOICES}/new`,
    });
  if (canBuy)
    quick.push({
      key: 'purchase',
      label: t('reports.dashboard.quick.newPurchase'),
      icon: <ShoppingCart aria-hidden />,
      href: `${ROUTES.PURCHASE_BILLS}/new`,
    });
  if (canRemind)
    quick.push({
      key: 'remind',
      label: t('reports.dashboard.quick.remind'),
      icon: <BellRing aria-hidden />,
      href: ROUTES.LEDGER_REMINDERS,
    });

  const attention: UbAttentionItem[] = [];
  const overdueCount = (tiles.overdue?.count ?? 0) || (tiles.overdue?.invoices?.count ?? 0);
  if (tiles.overdue && overdueCount > 0)
    attention.push({
      key: 'overdue',
      title: `${t('reports.dashboard.tile.overdue')} · ${money(tiles.overdue.amount)}`,
      caption: tiles.overdue.count
        ? t('reports.dashboard.tile.parties', { count: tiles.overdue.count })
        : t('reports.dashboard.tile.overdue.bills', {
            amount: money(tiles.overdue.invoices?.amount),
            count: tiles.overdue.invoices?.count ?? 0,
          }),
      icon: <AlarmClock />,
      href: tileHref('overdue', tiles),
      tone: 'danger',
    });
  if (tiles.dueToday && tiles.dueToday.count > 0)
    attention.push({
      key: 'dueToday',
      title: `${t('reports.dashboard.tile.dueToday')} · ${money(tiles.dueToday.amount)}`,
      caption: t('reports.dashboard.tile.parties', { count: tiles.dueToday.count }),
      icon: <CalendarClock />,
      href: tileHref('dueToday', tiles),
      tone: 'warning',
    });
  if (tiles.lowStock && tiles.lowStock.count > 0)
    attention.push({
      key: 'lowStock',
      title: t('reports.dashboard.tile.lowStock'),
      caption: t('reports.dashboard.tile.lowStock.value', { count: tiles.lowStock.count }),
      icon: <PackageMinus />,
      href: tileHref('lowStock', tiles),
      tone: 'info',
    });

  return (
    <UbStack gap={4} data-testid="dashboard-mobile-summary">
      {hero.length > 0 && <UbHeroPair figures={hero} />}
      {strip.length > 0 && (
        <UbMiniStatStrip stats={strip} label={t('reports.dashboard.mobile.today')} />
      )}
      {quick.length > 0 && (
        <UbQuickActions actions={quick} label={t('reports.dashboard.quick.label')} />
      )}
      {attention.length > 0 && (
        <UbStack gap={1}>
          <UbText as="h2" variant="body-medium">
            {t('reports.dashboard.mobile.attention')}
          </UbText>
          <UbAttentionList items={attention} />
        </UbStack>
      )}
    </UbStack>
  );
}
