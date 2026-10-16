'use client';

import { useState } from 'react';

import dynamic from 'next/dynamic';

import { BellRing, CircleCheck, Circle } from 'lucide-react';

import {
  UbActionLink,
  UbAmount,
  UbButton,
  UbCard,
  UbDivider,
  UbLink,
  UbListItemText,
  UbStack,
  UbStatusBadge,
  UbText,
} from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import type { TranslateFn } from 'src/hooks/useTranslation';
import { selectTenantTimezone } from 'src/redux/slice/sessionSlice';
import { itemPath, partyPath, ROUTES } from 'src/routes';
import { formatBusinessDate } from 'src/utils/dates';
import { formatInr } from 'src/utils/money';

import { usePartyReminder } from 'modules/DigiKhaato/features/ledger/hooks/usePartyReminder';

import { activityTitle, activityWhen } from '../view-model/dashboardDisplay';
import { sourceHref } from '../view-model/drillThrough';

import type { ActivityItem, FirstUse, LowStockRow, TopDebtor } from '../types/reports.types';

/* The sheet loads with the tap that opens it (CLAUDE.md, three times over). */
const PartyReminderSheetLazy = /* @__PURE__ */ dynamic(() =>
  import('modules/DigiKhaato/features/reminders/components/PartyReminderSheet').then(
    (m) => m.PartyReminderSheet
  )
);

/**
 * RPT-01 FR-3 — the last ten things that happened, newest first, each opening
 * its source (a bill, a receipt, the khata for a khata line). A stock count
 * has no page of its own, so its row is text.
 */
export function RecentActivityList({
  items,
  t,
}: Readonly<{ items: readonly ActivityItem[]; t: TranslateFn }>): React.JSX.Element {
  const timeZone = useAppSelector(selectTenantTimezone);
  return (
    <UbCard title={t('reports.dashboard.activity.title')} padded>
      {items.length === 0 ? (
        <UbText variant="body-sm" tone="tertiary">
          {t('reports.dashboard.activity.empty')}
        </UbText>
      ) : (
        <UbStack as="ul" gap={0} aria-label={t('reports.dashboard.activity.title')}>
          {items.map((item, index) => {
            const title = activityTitle(item, t);
            const href = sourceHref(item.source, item.number, item.type);
            return (
              <UbStack as="li" key={item.id} gap={0}>
                {index > 0 && <UbDivider />}
                <UbStack direction="row" justify="between" align="center" className="gap-3 py-2.5">
                  <UbListItemText
                    className="min-w-0"
                    primary={
                      href ? (
                        <UbLink
                          href={href}
                          variant="body-sm-medium"
                          className="line-clamp-2 whitespace-normal break-words"
                        >
                          {title}
                        </UbLink>
                      ) : (
                        title
                      )
                    }
                    primaryVariant="body-sm-medium"
                    secondary={activityWhen(item, t, timeZone ?? undefined)}
                    secondaryVariant="caption"
                    secondaryTone="tertiary"
                  />
                  {item.amount && (
                    <UbText
                      as="span"
                      variant="body-sm"
                      className={`ds-num shrink-0 ${item.type.endsWith('_void') ? 'line-through' : ''}`}
                    >
                      {formatInr(item.amount)}
                    </UbText>
                  )}
                </UbStack>
              </UbStack>
            );
          })}
        </UbStack>
      )}
    </UbCard>
  );
}

/**
 * RPT-01 FR-4 — the five customers who owe most, each with Remind: the khata's own
 * reminder sheet (LED-06), with the server's message, opened here. The
 * number is masked in the list (§19); the sheet gets the real one only when
 * the server sent it, which it does for a reader who may send reminders.
 */
export function TopDebtorsList({
  debtors,
  t,
}: Readonly<{ debtors: readonly TopDebtor[]; t: TranslateFn }>): React.JSX.Element {
  const [selected, setSelected] = useState<TopDebtor | null>(null);
  const reminder = usePartyReminder(
    selected
      ? {
          id: selected.id,
          name: selected.name,
          balance: selected.balance,
          mobile: selected.mobile,
          isArchived: false,
        }
      : null
  );
  const { openSheet } = reminder;

  return (
    <>
      {debtors.length === 0 ? (
        <UbText variant="body-sm" tone="tertiary">
          {t('reports.dashboard.customers.none')}
        </UbText>
      ) : (
        <UbStack as="ul" gap={0} aria-label={t('reports.dashboard.debtors.title')}>
          {debtors.map((debtor, index) => (
            <UbStack as="li" key={debtor.id} gap={0}>
              {index > 0 && <UbDivider />}
              <UbStack direction="row" align="center" justify="between" className="gap-3 py-2.5">
                <UbListItemText
                  className="min-w-0"
                  primary={
                    <UbLink
                      href={partyPath(debtor.id)}
                      variant="body-sm-medium"
                      className="line-clamp-2"
                    >
                      {debtor.name}
                    </UbLink>
                  }
                  primaryVariant="body-sm-medium"
                  secondary={[
                    debtor.mobileMasked,
                    debtor.collectionDate
                      ? t('reports.dashboard.debtors.collectOn', {
                          date: formatBusinessDate(debtor.collectionDate),
                        })
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  secondaryVariant="caption"
                  secondaryTone="tertiary"
                />
                <UbStack direction="row" align="center" className="shrink-0 gap-2">
                  <UbAmount
                    value={debtor.balance}
                    tone="receivable"
                    label={t('reports.dashboard.debtors.owes')}
                    labelHidden
                    size="sm"
                  />
                  {debtor.mobile && (
                    <UbButton
                      variant="ghost"
                      size="sm"
                      icon={<BellRing className="h-4 w-4" aria-hidden />}
                      iconOnly
                      aria-label={t('reports.dashboard.debtors.remind', { name: debtor.name })}
                      onClick={() => {
                        setSelected(debtor);
                        openSheet();
                      }}
                    >
                      {t('reports.dashboard.debtors.remind', { name: debtor.name })}
                    </UbButton>
                  )}
                </UbStack>
              </UbStack>
            </UbStack>
          ))}
        </UbStack>
      )}
      {selected && reminder.canRemind && reminder.open && (
        <PartyReminderSheetLazy
          partyId={reminder.partyId}
          open={reminder.open}
          onOpenChange={reminder.setOpen}
          title={reminder.title}
          description={reminder.description}
          phone={reminder.phone}
          labels={reminder.labels}
        />
      )}
    </>
  );
}

/** RPT-01 FR-5 — the five items nearest to running out, out-of-stock first. */
export function LowStockCard({
  items,
  t,
}: Readonly<{ items: readonly LowStockRow[]; t: TranslateFn }>): React.JSX.Element {
  return (
    <UbCard
      title={t('reports.dashboard.lowStock.title')}
      action={
        <UbLink href={ROUTES.STOCK_LOW} variant="body-sm-medium">
          {t('reports.dashboard.viewAll')}
        </UbLink>
      }
      padded
    >
      {items.length === 0 ? (
        <UbText variant="body-sm" tone="tertiary">
          {t('reports.dashboard.lowStock.empty')}
        </UbText>
      ) : (
        <UbStack as="ul" gap={0} aria-label={t('reports.dashboard.lowStock.title')}>
          {items.map((item, index) => (
            <UbStack as="li" key={item.id} gap={0}>
              {index > 0 && <UbDivider />}
              <UbStack direction="row" align="center" justify="between" className="gap-3 py-2.5">
                <UbListItemText
                  className="min-w-0"
                  primary={
                    <UbLink
                      href={itemPath(item.id)}
                      variant="body-sm-medium"
                      className="line-clamp-2"
                    >
                      {item.name}
                    </UbLink>
                  }
                  primaryVariant="body-sm-medium"
                  secondary={
                    item.reorderPoint
                      ? t('reports.dashboard.lowStock.reorderAt', {
                          qty: item.reorderPoint,
                          unit: item.unit,
                        })
                      : undefined
                  }
                  secondaryVariant="caption"
                  secondaryTone="tertiary"
                />
                <UbStack direction="row" align="center" className="shrink-0 gap-2">
                  <UbText as="span" variant="body-sm" className="ds-num">
                    {`${item.onHand} ${item.unit}`}
                  </UbText>
                  <UbStatusBadge
                    tone={item.stockStatus === 'out' ? 'error' : 'warning'}
                    label={t(`reports.dashboard.lowStock.status.${item.stockStatus}`)}
                  />
                </UbStack>
              </UbStack>
            </UbStack>
          ))}
        </UbStack>
      )}
    </UbCard>
  );
}

/**
 * RPT-01 FR-9 and the approved design (12 Oct 2026) — a new book's whole home
 * screen: three steps, each with Start, in place of tiles that would all read
 * ₹0 and cards with nothing in them. A done step is struck through; only the
 * steps this reader can take are listed (a step they cannot take is a dead
 * end). The UPI ID is not one of them: it is a setting, asked for where a bill
 * needs it, and four steps read as a form rather than a start.
 */
export function FirstUseChecklist({
  firstUse,
  steps,
  t,
}: Readonly<{
  firstUse: FirstUse;
  steps: {
    readonly party: boolean;
    readonly item: boolean;
    readonly bill: boolean;
  };
  t: TranslateFn;
}>): React.JSX.Element {
  const rows = [
    { key: 'party', show: steps.party, done: firstUse.hasParty, href: ROUTES.CUSTOMERS },
    { key: 'item', show: steps.item, done: firstUse.hasItem, href: ROUTES.ITEMS },
    {
      key: 'bill',
      show: steps.bill,
      done: firstUse.hasDocument,
      href: `${ROUTES.SALES_INVOICES}/new`,
    },
  ].filter((row) => row.show);
  return (
    <UbStack gap={4} data-testid="dashboard-first-use">
      <UbText variant="body-sm" tone="secondary">
        {t('reports.dashboard.firstUse.body')}
      </UbText>
      <UbCard padded>
        <UbStack as="ol" gap={0} aria-label={t('reports.dashboard.firstUse.title')}>
          {rows.map((row, index) => (
            <UbStack as="li" key={row.key} gap={0}>
              {index > 0 && <UbDivider />}
              <UbStack direction="row" align="center" className="gap-3 py-3">
                {row.done ? (
                  <CircleCheck className="h-5 w-5 shrink-0 text-success" aria-hidden />
                ) : (
                  <Circle className="h-5 w-5 shrink-0 text-text-tertiary" aria-hidden />
                )}
                <UbText
                  as="span"
                  variant="body-medium"
                  tone={row.done ? 'tertiary' : undefined}
                  className={`min-w-0 flex-1 ${row.done ? 'line-through' : ''}`}
                >
                  {t(`reports.dashboard.firstUse.${row.key}`)}
                </UbText>
                {!row.done && (
                  <UbActionLink
                    href={row.href}
                    variant="secondary"
                    size="sm"
                    aria-label={t('reports.dashboard.firstUse.startStep', {
                      step: t(`reports.dashboard.firstUse.${row.key}`),
                    })}
                  >
                    {t('reports.dashboard.firstUse.start')}
                  </UbActionLink>
                )}
              </UbStack>
            </UbStack>
          ))}
        </UbStack>
      </UbCard>
      <UbText variant="body-sm" tone="tertiary">
        {t('reports.dashboard.firstUse.later')}
      </UbText>
    </UbStack>
  );
}
