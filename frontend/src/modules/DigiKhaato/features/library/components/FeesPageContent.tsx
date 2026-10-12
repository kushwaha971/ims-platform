'use client';

import { useEffect, useState } from 'react';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

import { Plus } from 'lucide-react';

import { SummaryStatGrid } from 'src/components/stats/SummaryStatGrid';
import {
  UbAmount,
  UbButton,
  UbCard,
  UbEmptyState,
  UbListItemText,
  UbPageHeader,
  UbPageShell,
  UbPageSkeleton,
  UbPressable,
  UbStatCard,
  UbStack,
  UbStatusBadge,
  UbText,
} from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { useTranslation } from 'src/hooks/useTranslation';
import { ROUTES } from 'src/routes';
import { formatBusinessDate } from 'src/utils/dates';
import { formatInr } from 'src/utils/money';

import { selectLibraryHome } from '../redux/libraryHomeSlice';
import { fetchLibraryFeesBoard } from '../redux/libraryHomeThunk';
import { selectLibraryMemberList } from '../redux/libraryMemberListSlice';
import { fetchLibraryMembershipTypes } from '../redux/libraryMemberThunk';
import { isNonZero } from '../view-model/memberDisplay';

import type { FeesBoardUnpaid } from '../types/home.types';
import type { MembershipType } from '../types/member.types';

/** The plan form loads with the tap that opens it (CLAUDE.md). */
const PlanDialogLazy = dynamic(() => import('./PlanDialog').then((m) => m.PlanDialog), {
  ssr: false,
});

/** Take fee is the core payment drawer, loaded with the tap (CLAUDE.md). */
const PaymentFormDrawerLazy = dynamic(
  () =>
    import('modules/DigiKhaato/features/payments/components/PaymentFormDrawer').then(
      (m) => m.PaymentFormDrawer
    ),
  { ssr: false }
);

const MODES = new Set(['cash', 'upi', 'bank', 'cheque', 'card']);

/**
 * W03 (owner, 4 Oct 2026) — `/library/fees`: a reading room runs on monthly
 * fees, so its money screen says who has to pay — the plan ran out, a fee is
 * charged and not paid, or the plan ends this week — and holds the fee plans a
 * student joins on (Monthly ₹900, Quarterly ₹2,400…). No khata, no "owed".
 */
export function FeesPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { types } = useAppSelector(selectLibraryMemberList);
  const { can, hasModule } = usePermissions();
  const canRead = hasModule('library') && can('library.member.read');
  const canManage = hasModule('library') && can('library.settings.manage');
  const [editing, setEditing] = useState<MembershipType | 'new' | null>(null);
  const router = useRouter();
  const { board, boardStatus, stale } = useAppSelector(selectLibraryHome);
  // The member page's own rule: a library-only business runs no Payments app.
  const canCollect = can('payments.payment.write');
  const [taking, setTaking] = useState<FeesBoardUnpaid | null>(null);

  useEffect(() => {
    if (!canRead) return undefined;
    const promise = dispatch(fetchLibraryMembershipTypes());
    return () => promise.abort();
  }, [dispatch, canRead]);
  useEffect(() => {
    if (!canRead) return undefined;
    const promise = dispatch(fetchLibraryFeesBoard());
    return () => promise.abort();
  }, [dispatch, canRead]);
  // A fee taken here (or anywhere) marks the board stale: read it again.
  useEffect(() => {
    if (canRead && stale && board) void dispatch(fetchLibraryFeesBoard());
  }, [canRead, stale, board, dispatch]);

  if (!canRead) {
    return (
      <UbPageShell>
        <UbEmptyState
          variant="firstUse"
          title={t('library.noAccess.title')}
          description={t('library.noAccess.body')}
        />
      </UbPageShell>
    );
  }

  return (
    <UbPageShell width="measure">
      <UbPageHeader title={t('library.fees.title')} />
      <UbStack gap={5}>
        {/* The approved design (12 Oct 2026): the desk's list — what is left
            to collect and what came in, then Not paid with Take fee on each
            row, then Paid this month. A library with no student yet sees one
            sentence, not three "See students" shortcuts to nobody. */}
        {!board ? (
          boardStatus === 'failed' ? (
            <UbEmptyState variant="error" title={t('library.fees.error')} />
          ) : (
            <UbPageSkeleton variant="card" />
          )
        ) : board.students === 0 ? (
          /* Owner, 12 Oct 2026: with the fee plans right below, a tall empty
             box only pushed them down a screen. One short note instead. */
          <UbCard padded data-testid="library-fees-empty">
            <UbText variant="body-sm-medium">{t('library.fees.empty.title')}</UbText>
            <UbText variant="body-sm" tone="tertiary">
              {t('library.fees.empty.body')}
            </UbText>
          </UbCard>
        ) : (
          <UbStack gap={4} data-testid="library-fees-board">
            <SummaryStatGrid storageKey="libraryFees">
              <UbStatCard
                label={t('library.fees.board.toCollect')}
                value={formatInr(board.toCollect)}
                tone={isNonZero(board.toCollect) ? 'danger' : undefined}
              />
              <UbStatCard
                label={t('library.home.collected')}
                value={formatInr(board.collectedThisMonth)}
                tone="success"
              />
            </SummaryStatGrid>
            <UbStack gap={2}>
              <UbText variant="label">{t('library.fees.board.notPaid')}</UbText>
              {board.notPaid.length === 0 ? (
                <UbText variant="body-sm" tone="tertiary">
                  {t('library.home.allPaid')}
                </UbText>
              ) : (
                <UbCard padded>
                  <UbStack as="ul" gap={0} aria-label={t('library.fees.board.notPaid')}>
                    {board.notPaid.map((row) => (
                      <UbStack
                        as="li"
                        key={row.membershipId}
                        direction="row"
                        justify="between"
                        align="center"
                        gap={3}
                        className="border-b border-border-hairline py-2.5 last:border-b-0"
                      >
                        <UbPressable
                          className="min-w-0 flex-1 text-left"
                          onClick={() =>
                            router.push(`${ROUTES.LIBRARY_MEMBERS}/${row.membershipId}`)
                          }
                        >
                          <UbListItemText
                            primary={row.name}
                            secondary={[
                              row.plan,
                              t('library.fees.board.since', {
                                date: formatBusinessDate(row.since),
                              }),
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          />
                        </UbPressable>
                        <UbStack direction="row" align="center" gap={2} className="shrink-0">
                          <UbAmount
                            value={row.owes}
                            tone="receivable"
                            label={t('library.member.owes')}
                            labelHidden
                          />
                          {canCollect && (
                            <UbButton
                              size="sm"
                              onClick={() => setTaking(row)}
                              data-testid="library-take-fee"
                            >
                              {t('library.fees.board.take')}
                            </UbButton>
                          )}
                        </UbStack>
                      </UbStack>
                    ))}
                  </UbStack>
                </UbCard>
              )}
            </UbStack>
            {board.paid.length > 0 && (
              <UbStack gap={2}>
                <UbText variant="label">{t('library.fees.board.paid')}</UbText>
                <UbCard padded>
                  <UbStack as="ul" gap={0} aria-label={t('library.fees.board.paid')}>
                    {board.paid.map((row) => (
                      <UbStack
                        as="li"
                        key={row.paymentId}
                        direction="row"
                        justify="between"
                        align="center"
                        gap={3}
                        className="border-b border-border-hairline py-2.5 last:border-b-0"
                      >
                        <UbListItemText
                          primary={row.name}
                          secondary={[
                            formatBusinessDate(row.on),
                            MODES.has(row.mode) ? t(`library.fees.mode.${row.mode}`) : '',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        />
                        <UbAmount
                          value={row.amount}
                          tone="payable"
                          label={t('library.fees.board.paid')}
                          labelHidden
                          className="shrink-0"
                        />
                      </UbStack>
                    ))}
                  </UbStack>
                </UbCard>
              </UbStack>
            )}
          </UbStack>
        )}

        <UbStack gap={2} data-testid="library-fees-plans">
          <UbStack direction="row" justify="between" align="center" gap={2}>
            <UbText variant="label">{t('library.plans.title')}</UbText>
            {canManage && (
              <UbButton
                size="sm"
                variant="secondary"
                icon={<Plus className="h-4 w-4" aria-hidden />}
                onClick={() => setEditing('new')}
                data-testid="library-plan-add"
              >
                {t('library.plans.add')}
              </UbButton>
            )}
          </UbStack>
          {types.length === 0 ? (
            <UbText variant="body-sm" tone="tertiary">
              {t('library.plans.none')}
            </UbText>
          ) : (
            <UbCard padded>
              <UbStack as="ul" gap={0} aria-label={t('library.plans.title')}>
                {types.map((plan) => (
                  <UbStack as="li" key={plan.id} gap={0}>
                    <UbPressable
                      className="w-full rounded-control px-1 py-2 text-left"
                      disabled={!canManage}
                      onClick={() => setEditing(plan)}
                    >
                      <UbStack direction="row" justify="between" align="center" gap={3}>
                        <UbListItemText
                          primary={plan.name}
                          secondary={[
                            plan.validityMonths
                              ? t('library.plans.length', { months: plan.validityMonths })
                              : t('library.member.noExpiry'),
                            isNonZero(plan.admissionFee)
                              ? t('library.plans.admission', {
                                  amount: formatInr(plan.admissionFee),
                                })
                              : '',
                            isNonZero(plan.depositAmount)
                              ? t('library.plans.deposit', {
                                  amount: formatInr(plan.depositAmount),
                                })
                              : '',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        />
                        <UbStack direction="row" gap={2} align="center">
                          {!plan.isActive && (
                            <UbStatusBadge tone="neutral" label={t('library.plans.notInUse')} />
                          )}
                          <UbText variant="body-sm-medium">{formatInr(plan.feeAmount)}</UbText>
                        </UbStack>
                      </UbStack>
                    </UbPressable>
                  </UbStack>
                ))}
              </UbStack>
            </UbCard>
          )}
        </UbStack>
      </UbStack>
      {taking && (
        <PaymentFormDrawerLazy
          context={{
            direction: 'in',
            partyId: taking.partyId,
            partyName: taking.name,
            receivable: taking.owes,
            documentId: taking.charge.id,
            documentNumber: taking.charge.number,
            documentDue: taking.charge.amountDue,
            entry: 'party',
            // DEC-019 — the library's fees, and an advance that stays the library's.
            bucket: 'library',
          }}
          onClose={() => {
            setTaking(null);
            void dispatch(fetchLibraryFeesBoard());
          }}
        />
      )}
      {editing && (
        <PlanDialogLazy
          plan={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </UbPageShell>
  );
}
