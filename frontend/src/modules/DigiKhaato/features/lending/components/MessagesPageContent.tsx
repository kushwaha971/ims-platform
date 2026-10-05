'use client';

import { useEffect, useState } from 'react';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

import { MessageCircle } from 'lucide-react';

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
  UbStack,
  UbStatusBadge,
  UbText,
} from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { useTranslation } from 'src/hooks/useTranslation';
import { ROUTES } from 'src/routes';

import { selectLendingMessages } from '../redux/lendingMessagesSlice';
import { fetchLendingReminders } from '../redux/lendingMessageThunk';
import { localClock } from '../view-model/lendingDisplay';

import type { LendingReminderRow } from '../types/lending.types';

/** The message loads with the tap that opens it (CLAUDE.md). */
const MessageDialogLazy = dynamic(() => import('./MessageDialog').then((m) => m.MessageDialog), {
  ssr: false,
});

const BUCKET_TONE = { overdue: 'error', due_today: 'warning', due_tomorrow: 'info' } as const;

/**
 * L03 — `/lending/messages`: today's reminders, the way Reminders work. Every
 * running loan with something late, something due today or its next instalment
 * tomorrow, late first. Each opens the borrower's sheet; one a day per loan, so
 * a row told today says when and on what, and opens to say when it can go next.
 */
export function MessagesPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const state = useAppSelector(selectLendingMessages);
  const { can, hasModule } = usePermissions();
  const canSend = hasModule('lending') && can('lending.reminder.send');
  const [open, setOpen] = useState<LendingReminderRow | null>(null);

  useEffect(() => {
    if (!canSend) return undefined;
    const promise = dispatch(fetchLendingReminders());
    return () => promise.abort();
  }, [canSend, dispatch]);
  const staleNow = state.stale && state.staleUrgency === 'now';
  useEffect(() => {
    if (canSend && staleNow) void dispatch(fetchLendingReminders());
  }, [canSend, staleNow, dispatch]);

  if (!canSend) {
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

  return (
    <UbPageShell width="measure">
      <UbPageHeader title={t('lending.messages.pageTitle')} />
      {state.status === 'idle' || state.status === 'loading' ? (
        <UbPageSkeleton variant="card" />
      ) : state.status === 'failed' ? (
        <UbEmptyState
          variant="error"
          title={t('lending.messages.error.title')}
          description={state.error?.message}
          requestId={state.error?.requestId ?? null}
          requestIdLabel={t('common.error.reference')}
        />
      ) : (
        <UbStack gap={3} data-testid="lending-messages">
          <UbText variant="body-sm" tone="secondary">
            {t('lending.messages.rule')}
          </UbText>
          {state.rows.length === 0 ? (
            <UbCard padded>
              <UbText variant="body-sm" tone="tertiary">
                {t('lending.messages.none')}
              </UbText>
            </UbCard>
          ) : (
            <UbCard padded>
              <UbStack as="ul" gap={0} aria-label={t('lending.messages.pageTitle')}>
                {state.rows.map((row) => (
                  <UbStack
                    as="li"
                    key={row.loanId}
                    gap={2}
                    className="border-b border-border-hairline py-3 last:border-b-0"
                    data-testid={`lending-message-row-${row.number}`}
                  >
                    <UbStack direction="row" justify="between" align="start" gap={3}>
                      <UbPressable
                        className="min-w-0 flex-1 text-left"
                        onClick={() => router.push(`${ROUTES.LENDING_LOANS}/${row.loanId}`)}
                      >
                        <UbListItemText
                          primary={row.name}
                          // A route named after its area read "Station road · LN-0004 ·
                          // Station road" (L03 QA): each word once.
                          secondary={[...new Set([row.area, row.number, row.route])]
                            .filter(Boolean)
                            .join(' · ')}
                        />
                      </UbPressable>
                      <UbStack gap={1} align="end" className="shrink-0">
                        <UbAmount
                          value={row.amount}
                          tone={row.bucket === 'overdue' ? 'receivable' : undefined}
                          label={t('lending.today.asked')}
                        />
                        <UbStatusBadge
                          tone={BUCKET_TONE[row.bucket]}
                          label={t(`lending.messages.bucket.${row.bucket}`)}
                        />
                      </UbStack>
                    </UbStack>
                    <UbStack direction="row" gap={2} align="center" wrap>
                      {row.hasMobile ? (
                        <UbButton
                          size="sm"
                          variant={row.sentToday ? 'secondary' : 'primary'}
                          icon={<MessageCircle className="h-4 w-4" aria-hidden />}
                          onClick={() => setOpen(row)}
                        >
                          {t('lending.messages.remind')}
                        </UbButton>
                      ) : (
                        <UbText variant="caption" tone="tertiary">
                          {t('lending.messages.noMobile', { name: row.name })}
                        </UbText>
                      )}
                      {row.sentToday && (
                        <UbStatusBadge
                          tone="success"
                          label={t('lending.messages.sentAt', {
                            time: localClock(row.sentToday.at),
                            channel: t(`lending.messages.channel.${row.sentToday.channel}`),
                          })}
                        />
                      )}
                    </UbStack>
                  </UbStack>
                ))}
              </UbStack>
            </UbCard>
          )}
        </UbStack>
      )}
      {open && (
        <MessageDialogLazy
          loanId={open.loanId}
          name={open.name}
          kind="reminder"
          onClose={() => setOpen(null)}
        />
      )}
    </UbPageShell>
  );
}
