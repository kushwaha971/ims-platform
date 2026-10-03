'use client';

import { useState } from 'react';

import dynamic from 'next/dynamic';

import { Ban, Undo2, Wrench } from 'lucide-react';

import {
  UbActionLink,
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
  UbText,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { ROUTES } from 'src/routes';
import { formatBusinessDate } from 'src/utils/dates';
import { formatInr } from 'src/utils/money';

import { useCopyDetail } from '../hooks/useCatalogueDetail';
import { canRepair, canShelve, canWithdraw, copyPlace } from '../view-model/copyDisplay';

import { CatalogueActionsMenu } from './CatalogueActionsMenu';
import { CopyStatusBadge } from './CopyStatusBadge';

/** The reason dialog loads with the tap that opens it (CLAUDE.md). */
const WithdrawCopyDialogLazy = dynamic(
  () => import('./WithdrawCopyDialog').then((m) => m.WithdrawCopyDialog),
  { ssr: false }
);

/**
 * F03 (LIB-02 FR-6, FR-7, FR-11) — `/library/copies/[copyId]`: one physical
 * book, where it is, what it cost, and every status it has had. The history is
 * the `library_copy_event` rows, newest first, and is never edited — a copy is
 * never deleted, only withdrawn, and its number is never reused.
 *
 * Withdraw needs `library.copy.withdraw` (owner and admin) and is offered only
 * from a status the server allows it from (BR-7). Loans are absent until
 * LIB-06 gives them a table.
 */
export function CopyDetailPageContent({ id }: Readonly<{ id: string }>): React.JSX.Element {
  const { t } = useTranslation();
  const detail = useCopyDetail(id);
  const [withdrawing, setWithdrawing] = useState(false);
  const { copy } = detail;

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
  if (detail.status === 'failed' && !copy) {
    const notFound = detail.error?.status === 404;
    return (
      <UbPageShell>
        <UbEmptyState
          variant={notFound ? 'firstUse' : 'error'}
          title={t(notFound ? 'library.copy.notFound' : 'library.copy.error.title')}
          description={notFound ? undefined : detail.error?.message}
          requestId={notFound ? null : (detail.error?.requestId ?? null)}
          requestIdLabel={t('common.error.reference')}
          action={
            notFound ? (
              <UbActionLink href={ROUTES.LIBRARY_COPIES} variant="secondary">
                {t('library.copies.title')}
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
  if (!copy) return <UbPageSkeleton variant="card" />;

  const busy = detail.actionStatus === 'loading';
  const facts: readonly [string, string][] = [
    [t('library.copy.place'), copyPlace(copy)],
    [t('library.copy.barcode'), copy.barcode ?? ''],
    [t('library.copy.volume'), copy.volumeLabel],
    [t('library.copy.price'), copy.price ? formatInr(copy.price) : ''],
    [t('library.copy.condition'), t(`library.copy.condition.${copy.condition}`)],
    [t('library.copy.acquiredOn'), copy.acquiredOn ? formatBusinessDate(copy.acquiredOn) : ''],
    [
      t('library.copy.source'),
      [t(`library.copy.source.${copy.source}`), copy.sourceNote].filter(Boolean).join(' · '),
    ],
    [t('library.copy.lastSeen'), copy.lastSeenOn ? formatBusinessDate(copy.lastSeenOn) : ''],
  ].filter((fact): fact is [string, string] => fact[1] !== '');

  return (
    <UbPageShell>
      <UbPageHeader
        title={t('library.copy.heading', { number: copy.accessionNumber })}
        actions={
          <CatalogueActionsMenu
            t={t}
            items={[
              {
                key: 'repair',
                label: t('library.copy.toRepair'),
                icon: Wrench,
                action:
                  detail.canWrite && canRepair(copy.status) && !busy
                    ? () => void detail.move('repair')
                    : undefined,
              },
              {
                key: 'shelf',
                label: t('library.copy.toShelf'),
                icon: Undo2,
                action:
                  detail.canWrite && canShelve(copy.status) && !busy
                    ? () => void detail.move('back-to-shelf')
                    : undefined,
              },
              {
                key: 'withdraw',
                label: t('library.copy.withdrawAction'),
                icon: Ban,
                action:
                  detail.canWithdraw && canWithdraw(copy.status)
                    ? () => setWithdrawing(true)
                    : undefined,
              },
            ]}
          />
        }
      />
      <UbStack gap={4} data-testid="library-copy-screen">
        <UbStack gap={1}>
          <UbLink href={`${ROUTES.LIBRARY_CATALOGUE}/${copy.title.id}`} variant="body">
            {copy.title.title}
          </UbLink>
          <UbStack direction="row" gap={2} wrap align="center">
            <CopyStatusBadge status={copy.status} t={t} />
            {copy.isReference && (
              <UbStatusBadge tone="neutral" label={t('library.copy.reference')} />
            )}
          </UbStack>
        </UbStack>

        {copy.status === 'withdrawn' && copy.withdrawnReason && (
          <UbCard>
            <UbStack gap={1}>
              <UbText variant="body-sm">
                {t('library.copy.withdrawnLine', {
                  date: formatBusinessDate(copy.withdrawnOn),
                  reason: t(`library.withdraw.reason.${copy.withdrawnReason}`),
                })}
              </UbText>
              {copy.withdrawnNote && (
                <UbText variant="caption" tone="tertiary">
                  {copy.withdrawnNote}
                </UbText>
              )}
            </UbStack>
          </UbCard>
        )}

        <UbCard>
          <UbStack gap={1}>
            {facts.map(([label, value]) => (
              <UbInfoRow key={label} label={label} value={value} />
            ))}
          </UbStack>
        </UbCard>

        <UbCard title={t('library.copy.history')}>
          <UbStack gap={3} data-testid="library-copy-history">
            {copy.events.map((event) => (
              <UbStack key={event.id} gap={0}>
                <UbText variant="body-sm">{t(`library.event.${event.reasonCode}`)}</UbText>
                <UbText variant="caption" tone="tertiary">
                  {[formatBusinessDate(event.onDate), t(`library.copy.status.${event.toStatus}`)]
                    .filter(Boolean)
                    .join(' · ')}
                </UbText>
                {event.note && (
                  <UbText variant="caption" tone="secondary">
                    {event.note}
                  </UbText>
                )}
              </UbStack>
            ))}
          </UbStack>
        </UbCard>
      </UbStack>

      {withdrawing && (
        <WithdrawCopyDialogLazy
          number={copy.accessionNumber}
          busy={busy}
          onClose={() => setWithdrawing(false)}
          onSubmit={async (values) => {
            if (await detail.withdraw(values)) setWithdrawing(false);
          }}
        />
      )}
    </UbPageShell>
  );
}
