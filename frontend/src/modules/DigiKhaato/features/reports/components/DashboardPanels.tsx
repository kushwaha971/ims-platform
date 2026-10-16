'use client';

import { useRouter } from 'next/navigation';

import { AlarmClock, PackageX, Package, Truck } from 'lucide-react';

import {
  UbAmount,
  UbAttentionList,
  UbDivider,
  UbLink,
  UbListItemText,
  UbPanel,
  UbStack,
  UbStatCard,
  UbStatGrid,
  UbText,
  type UbAttentionItem,
} from 'src/design-system';
import type { TranslateFn } from 'src/hooks/useTranslation';
import { partyPath, ROUTES } from 'src/routes';
import { formatInr } from 'src/utils/money';

import { advancesLine, overdueHref, shortInr, tileHref, tileTone } from '../view-model/dashboardDisplay';

import { TopDebtorsList } from './DashboardLists';

import type { AgedCountAmount, DashboardData, TopCreditor } from '../types/reports.types';

/**
 * WP-06 — the owner's layout A (16 Oct 2026), "two books side by side":
 * a Today row, a Customers panel and a Suppliers panel, and Needs attention,
 * in that order at every width (one column on a phone). Every figure opens the
 * list that reproduces it (DASH-01), and each panel reads only its own role's
 * money (DASH-02): the customers who owe you, the suppliers you owe, with the
 * money held the other way round named under each.
 */

const UNPAID_PURCHASES = `${ROUTES.PURCHASE_BILLS}?tab=unpaid`;
const RECEIVED_TODAY = `${ROUTES.PAYMENTS}?period=today&tab=in`;

const oldestLine = (bills: AgedCountAmount, t: TranslateFn): string | undefined =>
  bills.oldestDays === undefined
    ? undefined
    : t('reports.dashboard.oldest', { days: bills.oldestDays });

/** Net sales, money received and cash in hand — each says "today" and opens its records. */
export function DashboardTodayRow({
  data,
  t,
}: Readonly<{ data: DashboardData; t: TranslateFn }>): React.JSX.Element | null {
  const router = useRouter();
  const { tiles } = data;
  const units = {
    lakh: t('reports.dashboard.short.lakh'),
    crore: t('reports.dashboard.short.crore'),
  };
  if (!tiles.todaySales && !tiles.todayReceived && !tiles.cashInHand) return null;
  return (
    <UbStatGrid live label={t('reports.dashboard.today.title')}>
      {tiles.todaySales && (
        <UbStatCard
          key="sales"
          label={t('reports.dashboard.today.sales')}
          value={shortInr(tiles.todaySales.amount, units).text}
          subtext={t('reports.dashboard.today.salesCaption', { count: tiles.todaySales.count })}
          tone={tileTone('todaySales', tiles) === 'danger' ? 'danger' : 'default'}
          onClick={() => router.push(tileHref('todaySales', tiles))}
        />
      )}
      {tiles.todayReceived && (
        <UbStatCard
          key="received"
          label={t('reports.dashboard.today.received')}
          value={shortInr(tiles.todayReceived.amount, units).text}
          subtext={t('reports.dashboard.today.receivedCaption', {
            count: tiles.todayReceived.count,
          })}
          onClick={() => router.push(RECEIVED_TODAY)}
        />
      )}
      {tiles.cashInHand && (
        <UbStatCard
          key="cash"
          label={t('reports.dashboard.tile.cashInHand')}
          value={shortInr(tiles.cashInHand.amount, units).text}
          subtext={t('reports.dashboard.tile.cashInHand.baseline')}
          onClick={() => router.push(tileHref('cashInHand', tiles))}
        />
      )}
    </UbStatGrid>
  );
}

/** The panel's lead figure: "To collect ₹7,000.00", a link to the list that adds up to it. */
function LeadFigure({
  href,
  label,
  amount,
  tone,
  note,
}: Readonly<{
  href: string;
  label: string;
  amount: string;
  tone: 'receivable' | 'payable';
  note: string | null;
}>): React.JSX.Element {
  return (
    <UbStack gap={1} className="p-4">
      <UbLink
        href={href}
        variant="body-sm-medium"
        underline={false}
        className="flex flex-col gap-1"
      >
        <UbText as="span" variant="body-sm" tone="tertiary">
          {label}
        </UbText>
        <UbAmount value={amount} tone={tone} label={label} labelHidden size="lg" />
      </UbLink>
      {note && (
        <UbText variant="caption" tone="tertiary">
          {note}
        </UbText>
      )}
    </UbStack>
  );
}

/** One bills line under a lead figure: "2 bills overdue · ₹900.00", and its age. */
function BillsLine({
  href,
  text,
  caption,
}: Readonly<{ href: string; text: string; caption?: string }>): React.JSX.Element {
  return (
    <UbStack gap={0} className="px-4 py-2.5">
      <UbLink href={href} variant="body-sm-medium" className="whitespace-normal break-words">
        {text}
      </UbLink>
      {caption && (
        <UbText variant="caption" tone="tertiary">
          {caption}
        </UbText>
      )}
    </UbStack>
  );
}

function PanelHeading({
  title,
  href,
  viewAll,
}: Readonly<{ title: string; href: string; viewAll: string }>): React.JSX.Element {
  return (
    <UbStack direction="row" justify="between" align="center" className="gap-3 px-4 pt-4">
      <UbText as="h2" variant="h3">
        {title}
      </UbText>
      <UbLink href={href} variant="body-sm-medium">
        {viewAll}
      </UbLink>
    </UbStack>
  );
}

/** Customers: what they owe you, their overdue bills, and who owes most. */
export function CustomersPanel({
  data,
  t,
}: Readonly<{ data: DashboardData; t: TranslateFn }>): React.JSX.Element | null {
  const { tiles } = data;
  if (!tiles.toCollect) return null;
  const list = tileHref('toCollect', tiles);
  const overdue = tiles.overdue?.invoices;
  return (
    <UbPanel as="section" aria-label={t('reports.dashboard.customers.title')}>
      <UbStack gap={0}>
        <PanelHeading
          title={t('reports.dashboard.customers.title')}
          href={list}
          viewAll={t('reports.dashboard.customers.viewAll')}
        />
        <LeadFigure
          href={list}
          label={t('reports.dashboard.tile.toCollect')}
          amount={tiles.toCollect.amount}
          tone="receivable"
          note={advancesLine('toCollect', tiles, t)}
        />
      </UbStack>
      {overdue && overdue.count > 0 && (
        <BillsLine
          href={overdueHref(ROUTES.SALES_INVOICES, overdue, data.asOf)}
          text={t('reports.dashboard.customers.overdue', {
            count: overdue.count,
            amount: formatInr(overdue.amount),
          })}
          caption={oldestLine(overdue, t)}
        />
      )}
      <UbStack gap={0} className="px-4 pb-2">
        <TopDebtorsList debtors={data.topDebtors} t={t} />
      </UbStack>
    </UbPanel>
  );
}

function CreditorRows({
  creditors,
  t,
}: Readonly<{ creditors: readonly TopCreditor[]; t: TranslateFn }>): React.JSX.Element {
  if (creditors.length === 0)
    return (
      <UbText variant="body-sm" tone="tertiary" className="py-2.5">
        {t('reports.dashboard.suppliers.none')}
      </UbText>
    );
  return (
    <UbStack as="ul" gap={0} aria-label={t('reports.dashboard.suppliers.top')}>
      {creditors.map((row, index) => (
        <UbStack as="li" key={row.id} gap={0}>
          {index > 0 && <UbDivider />}
          <UbStack direction="row" align="center" justify="between" className="gap-3 py-2.5">
            <UbListItemText
              className="min-w-0"
              primary={
                <UbLink href={partyPath(row.id)} variant="body-sm-medium" className="line-clamp-2">
                  {row.name}
                </UbLink>
              }
              primaryVariant="body-sm-medium"
            />
            <UbAmount
              value={row.balance}
              tone="payable"
              label={t('reports.dashboard.tile.toPay')}
              labelHidden
              size="sm"
            />
          </UbStack>
        </UbStack>
      ))}
    </UbStack>
  );
}

/** Suppliers: what you owe them, their bills overdue or due this week, and whom you owe most. */
export function SuppliersPanel({
  data,
  t,
}: Readonly<{ data: DashboardData; t: TranslateFn }>): React.JSX.Element | null {
  const { tiles } = data;
  if (!tiles.toPay) return null;
  const list = tileHref('toPay', tiles);
  const bills = tiles.supplierBills;
  return (
    <UbPanel as="section" aria-label={t('reports.dashboard.suppliers.title')}>
      <UbStack gap={0}>
        <PanelHeading
          title={t('reports.dashboard.suppliers.title')}
          href={list}
          viewAll={t('reports.dashboard.suppliers.viewAll')}
        />
        <LeadFigure
          href={list}
          label={t('reports.dashboard.tile.toPay')}
          amount={tiles.toPay.amount}
          tone="payable"
          note={advancesLine('toPay', tiles, t)}
        />
      </UbStack>
      {bills && (bills.overdue.count > 0 || bills.dueWeek.count > 0) && (
        <UbStack gap={0}>
          {bills.overdue.count > 0 && (
            <BillsLine
              href={overdueHref(ROUTES.PURCHASE_BILLS, bills.overdue, data.asOf)}
              text={t('reports.dashboard.suppliers.overdue', {
                count: bills.overdue.count,
                amount: formatInr(bills.overdue.amount),
              })}
              caption={oldestLine(bills.overdue, t)}
            />
          )}
          {bills.dueWeek.count > 0 && (
            <BillsLine
              href={UNPAID_PURCHASES}
              text={t('reports.dashboard.suppliers.dueWeek', {
                count: bills.dueWeek.count,
                amount: formatInr(bills.dueWeek.amount),
              })}
            />
          )}
        </UbStack>
      )}
      <UbStack gap={0} className="px-4 pb-2">
        <CreditorRows creditors={data.topCreditors} t={t} />
      </UbStack>
    </UbPanel>
  );
}

/**
 * Spec order 4 — what needs doing, always on the page (it was a collapsed
 * "Details" strip on a laptop): each row says how much, how many, how old,
 * and the next step, and opens the list to do it from. Nothing to do is said
 * in words rather than by leaving the section out.
 */
export function NeedsAttention({
  data,
  t,
}: Readonly<{ data: DashboardData; t: TranslateFn }>): React.JSX.Element {
  const { tiles } = data;
  const items: UbAttentionItem[] = [];
  const overdue = tiles.overdue?.invoices;
  if (overdue && overdue.count > 0)
    items.push({
      key: 'collect',
      title: t('reports.dashboard.attention.collect', {
        count: overdue.count,
        amount: formatInr(overdue.amount),
      }),
      caption: oldestLine(overdue, t),
      icon: <AlarmClock />,
      href: overdueHref(ROUTES.SALES_INVOICES, overdue, data.asOf),
      tone: 'danger',
    });
  const payable = tiles.supplierBills?.overdue;
  if (payable && payable.count > 0)
    items.push({
      key: 'pay',
      title: t('reports.dashboard.attention.pay', {
        count: payable.count,
        amount: formatInr(payable.amount),
      }),
      caption: oldestLine(payable, t),
      icon: <Truck />,
      href: overdueHref(ROUTES.PURCHASE_BILLS, payable, data.asOf),
      tone: 'warning',
    });
  const stock = tiles.lowStock;
  if (stock && stock.outCount > 0)
    items.push({
      key: 'out',
      title: t('reports.dashboard.attention.out', { count: stock.outCount }),
      caption: t('reports.dashboard.attention.reorder'),
      icon: <PackageX />,
      href: ROUTES.STOCK_LOW,
      tone: 'danger',
    });
  if (stock && stock.count - stock.outCount > 0)
    items.push({
      key: 'low',
      title: t('reports.dashboard.attention.low', { count: stock.count - stock.outCount }),
      caption: t('reports.dashboard.attention.reorder'),
      icon: <Package />,
      href: ROUTES.STOCK_LOW,
      tone: 'warning',
    });
  return (
    <UbPanel as="section" aria-label={t('reports.dashboard.attention.title')}>
      <UbStack gap={0}>
        <UbText as="h2" variant="h3" className="px-4 pt-4">
          {t('reports.dashboard.attention.title')}
        </UbText>
        {items.length === 0 ? (
          <UbText variant="body-sm" tone="tertiary" className="p-4">
            {t('reports.dashboard.attention.none')}
          </UbText>
        ) : (
          <UbAttentionList items={items} className="mx-0 py-1" />
        )}
      </UbStack>
    </UbPanel>
  );
}
