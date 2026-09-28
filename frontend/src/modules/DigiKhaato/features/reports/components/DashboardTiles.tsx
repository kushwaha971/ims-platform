'use client';

import { useMemo } from 'react';

import { useRouter } from 'next/navigation';

import {
  AlarmClock,
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  PackageMinus,
  Receipt,
  TrendingUp,
  Wallet,
} from 'lucide-react';

import { UbStatCard, UbStatGrid, type UbStatCardDelta } from 'src/design-system';
import type { TranslateFn } from 'src/hooks/useTranslation';
import { formatInr } from 'src/utils/money';

import {
  salesDelta,
  shortInr,
  tileHref,
  TILE_ORDER,
  tileTone,
  type TileKey,
} from '../view-model/dashboardDisplay';

import type { DashboardTiles as Tiles } from '../types/reports.types';

const ICON: Readonly<Record<TileKey, React.JSX.Element>> = {
  toCollect: <ArrowDownLeft className="h-4 w-4" aria-hidden />,
  toPay: <ArrowUpRight className="h-4 w-4" aria-hidden />,
  dueToday: <CalendarClock className="h-4 w-4" aria-hidden />,
  overdue: <AlarmClock className="h-4 w-4" aria-hidden />,
  todaySales: <Receipt className="h-4 w-4" aria-hidden />,
  cashInHand: <Wallet className="h-4 w-4" aria-hidden />,
  lowStock: <PackageMinus className="h-4 w-4" aria-hidden />,
  upcoming7d: <TrendingUp className="h-4 w-4" aria-hidden />,
};

interface TileView {
  readonly key: TileKey;
  readonly label: string;
  readonly value: string;
  readonly full: string;
  readonly subtext: string;
  readonly delta?: UbStatCardDelta;
}

/**
 * RPT-01 FR-2 — the tiles the server sent, in FR-2's order, each a tap into
 * the list it counts. A tile the reader may not see never arrives, so it is
 * never drawn — not as ₹0, not greyed (FR-6, §10).
 *
 * Every tile carries a line under its figure (UX §8, "never a naked number"),
 * and a figure above a lakh is shortened to "₹1.2 L" with the exact amount in
 * the tile's accessible name (NFR §5).
 */
export function DashboardTiles({
  tiles,
  t,
}: Readonly<{ tiles: Tiles; t: TranslateFn }>): React.JSX.Element {
  const router = useRouter();
  const units = useMemo(
    () => ({
      lakh: t('reports.dashboard.short.lakh'),
      crore: t('reports.dashboard.short.crore'),
    }),
    [t]
  );

  const views = useMemo(() => {
    const out: TileView[] = [];
    const money = (value: string) => shortInr(value, units);
    for (const key of TILE_ORDER) {
      const label = t(`reports.dashboard.tile.${key}`);
      switch (key) {
        case 'toCollect':
        case 'toPay':
        case 'cashInHand': {
          const tile = tiles[key];
          if (!tile) break;
          const figure = money(tile.amount);
          out.push({
            key,
            label,
            value: figure.text,
            full: figure.full,
            subtext: t(`reports.dashboard.tile.${key}.baseline`),
          });
          break;
        }
        case 'dueToday':
        case 'upcoming7d': {
          const tile = tiles[key];
          if (!tile) break;
          const figure = money(tile.amount);
          out.push({
            key,
            label,
            value: figure.text,
            full: figure.full,
            subtext: t('reports.dashboard.tile.parties', { count: tile.count }),
          });
          break;
        }
        case 'overdue': {
          const tile = tiles.overdue;
          if (!tile) break;
          const figure = money(tile.amount);
          const parties = t('reports.dashboard.tile.parties', { count: tile.count });
          out.push({
            key,
            label,
            value: figure.text,
            full: figure.full,
            // BR-6 — the party-level figure first, the bills as the second line.
            subtext:
              tile.invoices && tile.invoices.count > 0
                ? `${parties} · ${t('reports.dashboard.tile.overdue.bills', {
                    amount: formatInr(tile.invoices.amount),
                    count: tile.invoices.count,
                  })}`
                : parties,
          });
          break;
        }
        case 'todaySales': {
          const tile = tiles.todaySales;
          if (!tile) break;
          const figure = money(tile.amount);
          const change = salesDelta(tile.amount, tile.yesterdayAmount);
          out.push({
            key,
            label,
            value: figure.text,
            full: figure.full,
            subtext: t('reports.dashboard.tile.todaySales.bills', { count: tile.count }),
            delta: change
              ? {
                  value: `${change.percent > 0 ? '+' : ''}${change.percent}%`,
                  direction: change.direction,
                  baseline: t('reports.dashboard.tile.todaySales.vsYesterday'),
                  tone:
                    change.direction === 'up'
                      ? 'good'
                      : change.direction === 'down'
                        ? 'bad'
                        : 'neutral',
                }
              : undefined,
          });
          break;
        }
        case 'lowStock': {
          const tile = tiles.lowStock;
          if (!tile) break;
          const value = t('reports.dashboard.tile.lowStock.value', { count: tile.count });
          out.push({
            key,
            label,
            value,
            full: value,
            subtext:
              tile.outCount > 0
                ? t('reports.dashboard.tile.lowStock.out', { count: tile.outCount })
                : t('reports.dashboard.tile.lowStock.noneOut'),
          });
          break;
        }
        default:
          break;
      }
    }
    return out;
  }, [tiles, t, units]);

  return (
    <UbStatGrid>
      {views.map((view) => (
        <UbStatCard
          key={view.key}
          icon={ICON[view.key]}
          label={view.label}
          value={view.value}
          subtext={view.subtext}
          delta={view.delta}
          tone={tileTone(view.key, tiles)}
          onClick={() => router.push(tileHref(view.key, tiles))}
          actionLabel={t('reports.dashboard.tile.open', { label: view.label, amount: view.full })}
        />
      ))}
    </UbStatGrid>
  );
}
