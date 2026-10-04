'use client';

import { useEffect, useState } from 'react';

import dynamic from 'next/dynamic';

import { Ban, CirclePlay, DoorClosed, RefreshCw, UserRoundPlus } from 'lucide-react';

import {
  UbActionLink,
  UbAmount,
  UbButton,
  UbCard,
  UbEmptyState,
  UbInfoRow,
  UbLink,
  UbPageHeader,
  UbPageShell,
  UbPageSkeleton,
  UbStack,
  UbStatusBadge,
  UbStatusBanner,
  UbText,
} from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectTenantTimezone } from 'src/redux/slice/sessionSlice';
import { ROUTES } from 'src/routes';
import { formatBusinessDate, todayInTenantTz } from 'src/utils/dates';
import { formatInr } from 'src/utils/money';

import { useMemberDetail } from '../hooks/useMemberDetail';
import { selectLibraryMemberList } from '../redux/libraryMemberListSlice';
import { fetchLibraryMembershipTypes } from '../redux/libraryMemberThunk';
import { blockParams, isNonZero, STATUS_TONE, validityLine } from '../view-model/memberDisplay';

import { CatalogueActionsMenu } from './CatalogueActionsMenu';
import { MemberChargesSection } from './MemberChargesSection';

import type { MemberDialogKind } from './MemberActionDialog';

/** Each act's dialog loads with the tap that opens it (CLAUDE.md). */
const MemberActionDialogLazy = dynamic(
  () => import('./MemberActionDialog').then((m) => m.MemberActionDialog),
  { ssr: false }
);

/**
 * F04 (LIB-04 §7, §8) — `/library/members/[membershipId]`: who the member is,
 * how long they may borrow, what they have out and what they owe. The header
 * follows the khata header: the name owns its line, badges sit on the caption
 * line, the number is monospace. Renew is the one primary action; the rest are
 * behind ⋯ (the LED-02 lesson — five buttons made a page wider than a phone).
 */
export function MemberDetailPageContent({ id }: Readonly<{ id: string }>): React.JSX.Element {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const detail = useMemberDetail(id);
  const { types } = useAppSelector(selectLibraryMemberList);
  const timezone = useAppSelector(selectTenantTimezone);
  const today = todayInTenantTz(timezone ?? undefined);
  const [dialog, setDialog] = useState<MemberDialogKind | null>(null);
  const { member } = detail;

  useEffect(() => {
    if (!detail.canRead || types.length > 0) return undefined;
    const promise = dispatch(fetchLibraryMembershipTypes());
    return () => promise.abort();
  }, [dispatch, detail.canRead, types.length]);

  if (!detail.canRead) {
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
  if (detail.status === 'failed' && !member) {
    const notFound = detail.error?.status === 404;
    return (
      <UbPageShell>
        <UbEmptyState
          variant={notFound ? 'firstUse' : 'error'}
          title={t(notFound ? 'library.member.notFound' : 'library.member.error.title')}
          description={notFound ? undefined : detail.error?.message}
          requestId={notFound ? null : (detail.error?.requestId ?? null)}
          requestIdLabel={t('common.error.reference')}
          action={
            notFound ? (
              <UbActionLink href={ROUTES.LIBRARY_MEMBERS} variant="secondary">
                {t('library.member.title')}
              </UbActionLink>
            ) : (
              <UbButton variant="secondary" onClick={detail.refetch}>
                {t('common.action.retry')}
              </UbButton>
            )
          }
        />
      </UbPageShell>
    );
  }
  if (!member) return <UbPageSkeleton variant="card" />;

  const closed = member.effectiveStatus === 'closed';
  const suspended = member.effectiveStatus === 'suspended';
  const busy = detail.actionStatus === 'loading';
  const validity = validityLine(member, today);
  const validityText = t(
    validity.id,
    validity.params && 'date' in validity.params
      ? { date: formatBusinessDate(String(validity.params.date)) }
      : validity.params
  );

  const facts: readonly [string, string][] = [
    [t('library.member.type'), member.type.name],
    // QA-F04-2 — under the label "Valid until", the value is the date alone;
    // the sentence form ("Expires in 3 days") is for when the date is near.
    [
      t('library.member.validUntil'),
      validity.id === 'library.member.validUntilOn' && member.validUntil
        ? formatBusinessDate(member.validUntil)
        : validityText,
    ],
    [t('library.member.group'), member.groupLabel],
    [t('library.member.guardian'), member.guardian?.name ?? ''],
    [t('library.member.mobile'), member.party.mobile ?? ''],
    [t('library.member.since'), formatBusinessDate(member.startsOn)],
  ].filter((fact): fact is [string, string] => fact[1] !== '');

  return (
    <UbPageShell>
      <UbPageHeader
        title={member.name}
        actions={
          <UbStack direction="row" gap={2}>
            {!closed && detail.canWrite && (
              <UbButton
                icon={<RefreshCw className="h-4 w-4" aria-hidden />}
                onClick={() => setDialog('renew')}
                data-testid="library-member-renew"
              >
                {t('library.member.renew')}
              </UbButton>
            )}
            <CatalogueActionsMenu
              t={t}
              items={[
                {
                  key: 'suspend',
                  label: t('library.member.suspend'),
                  icon: Ban,
                  action:
                    detail.canClose && !closed && !suspended
                      ? () => setDialog('suspend')
                      : undefined,
                },
                {
                  key: 'reactivate',
                  label: t('library.member.reactivate'),
                  icon: CirclePlay,
                  action: detail.canClose && suspended ? () => setDialog('reactivate') : undefined,
                },
                {
                  key: 'close',
                  label: t('library.member.closeMembership'),
                  icon: DoorClosed,
                  action: detail.canClose && !closed ? () => setDialog('close') : undefined,
                },
                {
                  key: 'rejoin',
                  label: t('library.member.rejoin'),
                  icon: UserRoundPlus,
                  action: detail.canWrite && closed ? () => setDialog('rejoin') : undefined,
                },
              ]}
            />
          </UbStack>
        }
      />
      <UbStack gap={4}>
        <UbStack direction="row" gap={2} align="center" wrap>
          <UbText variant="body-sm" className="ds-mono" data-testid="library-member-number">
            {member.memberNumber}
          </UbText>
          <UbStatusBadge
            tone={STATUS_TONE[member.effectiveStatus]}
            label={t(`library.member.status.${member.effectiveStatus}`)}
          />
          <UbLink href={`${ROUTES.PARTIES}/${member.party.id}`}>{t('library.member.khata')}</UbLink>
        </UbStack>

        {closed && (
          <UbStatusBanner
            tone="info"
            title={t('library.member.closedOn', {
              date: member.closedOn ? formatBusinessDate(member.closedOn) : '',
            })}
            description={member.closedReason || undefined}
          />
        )}
        {suspended && (
          <UbStatusBanner
            tone="warning"
            title={
              member.suspendedUntil
                ? t('library.member.suspendedUntil', {
                    date: formatBusinessDate(member.suspendedUntil),
                  })
                : t('library.member.suspendedOpen')
            }
            description={member.suspensionReason || undefined}
          />
        )}

        <UbCard padded>
          <UbStack gap={3}>
            <UbStack direction="row" gap={4} wrap>
              <UbStack gap={0} className="min-w-28">
                <UbText variant="caption" tone="tertiary">
                  {t('library.member.booksOut')}
                </UbText>
                <UbText variant="metric-sm">
                  {t('library.member.booksOf', {
                    count: member.loansOpen,
                    max: member.type.maxCopies,
                  })}
                </UbText>
                {member.loansOverdue > 0 && (
                  <UbText variant="caption" tone="error">
                    {t('library.member.overdueCount', { count: member.loansOverdue })}
                  </UbText>
                )}
              </UbStack>
              <UbStack gap={0} className="min-w-28">
                <UbText variant="caption" tone="tertiary">
                  {t('library.member.owes')}
                </UbText>
                {isNonZero(member.duesAmount) ? (
                  <UbAmount
                    value={member.duesAmount}
                    size="lg"
                    tone="receivable"
                    label={t('library.member.owes')}
                    labelHidden
                  />
                ) : (
                  <UbText variant="metric-sm">{t('library.member.noDues')}</UbText>
                )}
              </UbStack>
              {member.deposit && (
                <UbStack gap={0} className="min-w-28">
                  <UbText variant="caption" tone="tertiary">
                    {t('library.member.depositHeld')}
                  </UbText>
                  <UbText variant="metric-sm">{formatInr(member.deposit.held)}</UbText>
                  <UbText variant="caption" tone="tertiary">
                    {t('library.member.depositReturned')}
                  </UbText>
                </UbStack>
              )}
            </UbStack>
            {member.blocks.length > 0 && !closed && (
              <UbStack gap={1} data-testid="library-member-blocks">
                {member.blocks.map((block) => (
                  <UbText key={block.code} variant="body-sm" tone="warning">
                    {t(`library.member.block.${block.code}`, blockParams(block))}
                  </UbText>
                ))}
              </UbStack>
            )}
          </UbStack>
        </UbCard>

        <UbCard padded>
          <UbStack gap={2}>
            {facts.map(([label, value]) => (
              <UbInfoRow key={label} label={label} value={value} />
            ))}
          </UbStack>
        </UbCard>

        <MemberChargesSection member={member} t={t} />

        {member.periods.length > 0 && (
          <UbCard padded>
            <UbStack gap={2}>
              <UbText variant="label">{t('library.member.history')}</UbText>
              {member.periods.map((period, index) => (
                <UbStack key={`${period.onDate}-${index}`} gap={0}>
                  <UbText variant="body-sm">{t(`library.member.period.${period.kind}`)}</UbText>
                  <UbText variant="caption" tone="tertiary">
                    {[
                      formatBusinessDate(period.onDate),
                      period.validUntil
                        ? t('library.member.validUntilOn', {
                            date: formatBusinessDate(period.validUntil),
                          })
                        : t('library.member.noExpiry'),
                      period.reason,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </UbText>
                </UbStack>
              ))}
            </UbStack>
          </UbCard>
        )}
      </UbStack>

      {dialog && (
        <MemberActionDialogLazy
          kind={dialog}
          member={member}
          types={types}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(body) => detail.act(dialog, body)}
        />
      )}
    </UbPageShell>
  );
}
