'use client';

import { useEffect, useState } from 'react';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

import { MessageCircle, Plus } from 'lucide-react';

import { SummaryStatGrid } from 'src/components/stats/SummaryStatGrid';
import {
  UbActionLink,
  UbAmount,
  UbButton,
  UbCard,
  UbEmptyState,
  UbListItemText,
  UbPageHeader,
  UbPageShell,
  UbPageSkeleton,
  UbPressable,
  UbStack,
  UbStatCard,
  UbStatusBadge,
  UbText,
  UbFilterSelect,
} from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { useTranslation } from 'src/hooks/useTranslation';
import { ROUTES } from 'src/routes';
import { formatBusinessDate } from 'src/utils/dates';
import { formatInr } from 'src/utils/money';

import { fetchLendingRoutes, fetchLendingToday } from '../redux/lendingThunk';
import { selectLendingToday } from '../redux/lendingTodaySlice';
import { askedToday, caption, isNonZero, STOP_TONE, stopState } from '../view-model/lendingDisplay';

import type { TodayStop } from '../types/lending.types';

/** The sheets load with the tap that opens them (CLAUDE.md). */
const CollectDialogLazy = dynamic(() => import('./CollectDialog').then((m) => m.CollectDialog), {
  ssr: false,
});
const NotPaidDialogLazy = dynamic(() => import('./NotPaidDialog').then((m) => m.NotPaidDialog), {
  ssr: false,
});
const MessageDialogLazy = dynamic(() => import('./MessageDialog').then((m) => m.MessageDialog), {
  ssr: false,
});

const ALL = '';

/**
 * `/lending` — today's collection round (FRD LEN-08; the approved designs,
 * 12 Oct 2026).
 *
 * A lender who has never given a loan sees ONE thing: "Give your first loan",
 * with a line saying routes and collectors come later — no row of ₹0.00 tiles
 * and no checklist whose first step is routes. The setup card (docs/platform/14
 * step 5) is not drawn here at all: its first step is that panel, and the two
 * left after it are optional and already said under it, while on a phone the
 * card pushed the day's two figures below the fold (QA, 12 Oct 2026). That needs the server's
 * `hasLoans`, because an empty round on day one and an empty round for a lender
 * with a book look the same as a list.
 *
 * With loans: two big figures (to collect today, collected), then every stop in
 * route order with Collect on each. A person with two loans is two rows, each
 * named by its loan number. A stop paid or visited stays on the list, counted
 * done, so the agent sees the round they walked.
 */
export function TodayPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const state = useAppSelector(selectLendingToday);
  const { can, hasModule } = usePermissions();
  const canRead = hasModule('lending') && can('lending.today.read');
  const canCollect = hasModule('lending') && can('lending.collection.create');
  const canLend = hasModule('lending') && can('lending.loan.create');
  const [route, setRoute] = useState(ALL);
  const [collecting, setCollecting] = useState<TodayStop | null>(null);
  const [notPaid, setNotPaid] = useState<TodayStop | null>(null);
  const canRemind = hasModule('lending') && can('lending.reminder.send');
  const [messaging, setMessaging] = useState<{
    stop: TodayStop;
    kind: 'reminder' | 'receipt';
  } | null>(null);

  useEffect(() => {
    if (!canRead) return undefined;
    const promise = dispatch(fetchLendingRoutes());
    return () => promise.abort();
  }, [canRead, dispatch]);
  useEffect(() => {
    if (!canRead) return undefined;
    const promise = dispatch(fetchLendingToday(route));
    return () => promise.abort();
  }, [canRead, dispatch, route]);
  const staleNow = state.stale && state.staleUrgency === 'now';
  useEffect(() => {
    if (canRead && staleNow) void dispatch(fetchLendingToday(route));
  }, [canRead, staleNow, dispatch, route]);

  if (!canRead) {
    return (
      <UbPageShell>
        <UbEmptyState
          variant="firstUse"
          title={t('lending.noAccess.title')}
          description={t('lending.noAccess.body')}
        />
      </UbPageShell>
    );
  }
  const round = state.round;
  const routes = state.routes.filter((r) => r.isActive);

  return (
    <UbPageShell>
      <UbPageHeader
        title={
          round
            ? t('lending.today.titleOn', { date: formatBusinessDate(round.on) })
            : t('lending.today.title')
        }
        actions={
          canLend ? (
            <UbActionLink
              href={ROUTES.LENDING_NEW_LOAN}
              icon={<Plus className="h-4 w-4" aria-hidden />}
              iconOnly="mobile"
            >
              {t('lending.loan.new')}
            </UbActionLink>
          ) : undefined
        }
      />
      {!round ? (
        state.status === 'failed' ? (
          <UbEmptyState
            variant="error"
            title={t('lending.today.error')}
            description={state.error?.message}
          />
        ) : (
          <UbPageSkeleton variant="card" />
        )
      ) : !round.hasLoans ? (
        <UbStack gap={3} data-testid="lending-first-use">
          <UbEmptyState
            variant="firstUse"
            title={t('lending.today.first.title')}
            description={t('lending.today.first.body')}
            action={
              canLend ? (
                <UbActionLink
                  href={ROUTES.LENDING_NEW_LOAN}
                  icon={<Plus className="h-4 w-4" aria-hidden />}
                >
                  {t('lending.loan.new')}
                </UbActionLink>
              ) : undefined
            }
          />
          <UbText variant="body-sm" tone="tertiary" align="center">
            {t('lending.today.first.later')}
          </UbText>
        </UbStack>
      ) : (
        <UbStack gap={4} data-testid="lending-today">
          <SummaryStatGrid storageKey="lendingToday">
            <UbStatCard
              label={t('lending.today.due')}
              value={formatInr(round.due)}
              subtext={t('lending.today.stops', { count: round.stopsCount })}
              tone={isNonZero(round.short) ? 'danger' : undefined}
            />
            <UbStatCard
              label={t('lending.today.collected')}
              value={formatInr(round.collected)}
              subtext={t('lending.today.doneCount', { count: round.done })}
              tone="success"
            />
          </SummaryStatGrid>
          {routes.length > 0 && (
            <UbStack direction="row" gap={2}>
              <UbFilterSelect
                spec={{
                  kind: 'single',
                  key: 'route',
                  label: t('lending.route.label'),
                  options: [
                    { value: ALL, label: t('lending.route.all') },
                    ...routes.map((r) => ({ value: r.id, label: r.name })),
                  ],
                }}
                value={route}
                onChange={setRoute}
                closeLabel={t('common.action.close')}
              />
            </UbStack>
          )}
          {round.stops.length === 0 ? (
            <UbEmptyState
              variant="firstUse"
              title={t('lending.today.empty.title')}
              description={t('lending.today.empty.body')}
              action={
                canLend ? (
                  <UbActionLink href={ROUTES.LENDING_NEW_LOAN} variant="secondary">
                    {t('lending.loan.new')}
                  </UbActionLink>
                ) : undefined
              }
            />
          ) : (
            <UbCard padded>
              <UbStack as="ul" gap={0} aria-label={t('lending.today.title')}>
                {round.stops.map((stop) => {
                  const state = stopState(stop);
                  // Found by using it: a stop marked "not paid" lost its Collect
                  // button, and the borrower who comes round at six could not pay.
                  const open = isNonZero(askedToday(stop));
                  return (
                    <UbStack
                      as="li"
                      key={stop.loanId}
                      gap={2}
                      className="border-b border-border-hairline py-3 last:border-b-0"
                      data-testid={`lending-stop-${stop.number}`}
                    >
                      <UbStack direction="row" justify="between" align="start" gap={3}>
                        <UbPressable
                          className="min-w-0 flex-1 text-left"
                          onClick={() => router.push(`${ROUTES.LENDING_LOANS}/${stop.loanId}`)}
                        >
                          {/* Named by the LOAN as well as the person: Geeta with two
                              loans is two rows, and the number tells them apart. */}
                          <UbListItemText
                            primary={stop.name}
                            secondary={caption([
                              t('lending.today.loanEach', {
                                number: stop.number,
                                each: t(`lending.frequency.each.${stop.frequency}`, {
                                  amount: formatInr(stop.instalmentAmount),
                                }),
                              }),
                              stop.area,
                            ])}
                          />
                        </UbPressable>
                        <UbStack gap={1} align="end" className="shrink-0">
                          <UbAmount
                            value={askedToday(stop)}
                            tone={isNonZero(stop.arrears) ? 'receivable' : undefined}
                            label={t('lending.today.asked')}
                          />
                          <UbStatusBadge
                            tone={STOP_TONE[state]}
                            label={t(`lending.stop.${state}`, {
                              amount: formatInr(stop.collectedToday),
                              days: stop.daysPastDue,
                            })}
                          />
                        </UbStack>
                      </UbStack>
                      {isNonZero(stop.arrears) && state !== 'paid' && (
                        <UbText variant="caption" tone="error">
                          {t('lending.today.late', {
                            amount: formatInr(stop.arrears),
                            days: stop.daysPastDue,
                          })}
                        </UbText>
                      )}
                      {stop.visit && (
                        <UbText variant="caption" tone="tertiary">
                          {[
                            t(`lending.visit.outcome.${stop.visit.outcome}`),
                            stop.visit.promisedOn ? formatBusinessDate(stop.visit.promisedOn) : '',
                            stop.visit.reason,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </UbText>
                      )}
                      {((canCollect && open) || canRemind) && (
                        <UbStack direction="row" gap={2} align="center" wrap>
                          {canCollect && open && (
                            <UbButton
                              size="sm"
                              onClick={() => setCollecting(stop)}
                              data-testid="lending-stop-collect"
                            >
                              {t('lending.collect.button', { amount: formatInr(askedToday(stop)) })}
                            </UbButton>
                          )}
                          {canCollect && open && !stop.visit && state !== 'part' && (
                            <UbButton
                              size="sm"
                              variant="secondary"
                              onClick={() => setNotPaid(stop)}
                            >
                              {t('lending.visit.button')}
                            </UbButton>
                          )}
                          {/* L03 — money in: the receipt; nothing in yet: a reminder,
                              once a day (the sheet says when the next can go). */}
                          {canRemind && isNonZero(stop.collectedToday) && (
                            <UbButton
                              size="sm"
                              variant="ghost"
                              icon={<MessageCircle className="h-4 w-4" aria-hidden />}
                              onClick={() => setMessaging({ stop, kind: 'receipt' })}
                            >
                              {t('lending.messages.sendReceipt')}
                            </UbButton>
                          )}
                          {canRemind && open && !isNonZero(stop.collectedToday) && (
                            <UbButton
                              size="sm"
                              variant="ghost"
                              icon={<MessageCircle className="h-4 w-4" aria-hidden />}
                              onClick={() => setMessaging({ stop, kind: 'reminder' })}
                              data-testid="lending-stop-remind"
                            >
                              {stop.remindedToday
                                ? t('lending.messages.reminded')
                                : t('lending.messages.remind')}
                            </UbButton>
                          )}
                        </UbStack>
                      )}
                    </UbStack>
                  );
                })}
              </UbStack>
            </UbCard>
          )}
        </UbStack>
      )}
      {collecting && (
        <CollectDialogLazy
          loanId={collecting.loanId}
          name={collecting.name}
          number={collecting.number}
          suggested={
            isNonZero(askedToday(collecting)) ? askedToday(collecting) : collecting.instalmentAmount
          }
          onClose={() => setCollecting(null)}
        />
      )}
      {messaging && (
        <MessageDialogLazy
          loanId={messaging.stop.loanId}
          name={messaging.stop.name}
          kind={messaging.kind}
          onClose={() => setMessaging(null)}
        />
      )}
      {notPaid && round && (
        <NotPaidDialogLazy
          loanId={notPaid.loanId}
          name={notPaid.name}
          today={round.on}
          onClose={() => setNotPaid(null)}
        />
      )}
    </UbPageShell>
  );
}
