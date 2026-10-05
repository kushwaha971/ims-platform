'use client';

import { useEffect, useState } from 'react';

import dynamic from 'next/dynamic';

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
  UbStack,
  UbStatusBadge,
  UbText,
} from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { useTranslation } from 'src/hooks/useTranslation';
import { formatBusinessDate } from 'src/utils/dates';

import { selectLibraryMessages } from '../redux/libraryMessagesSlice';
import { fetchFeeReminders } from '../redux/libraryMessageThunk';

import type { FeeReminderRow } from '../types/message.types';

/** The message loads with the tap that opens it (CLAUDE.md). */
const MessageDialogLazy = dynamic(() => import('./MessageDialog').then((m) => m.MessageDialog), {
  ssr: false,
});

/**
 * W06 (owner, 4 Oct 2026) — `/library/messages`: today's fee messages, the
 * way Reminders work. The schedule is fixed — 7, 3 and 1 day before a plan
 * ends, then 1, 3 and 7 days after it ended unrenewed — so this list is
 * exactly who to message today. Each opens WhatsApp with the text filled in
 * and is recorded; a row sent today says so and can still be sent again.
 */
export function MessagesPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const state = useAppSelector(selectLibraryMessages);
  const { can, hasModule } = usePermissions();
  const canRead = hasModule('library') && can('library.member.read');
  const canSend = hasModule('library') && can('library.member.write');
  const [open, setOpen] = useState<FeeReminderRow | null>(null);

  useEffect(() => {
    if (!canRead) return undefined;
    const promise = dispatch(fetchFeeReminders());
    return () => promise.abort();
  }, [canRead, dispatch]);
  const staleNow = state.stale && state.staleUrgency === 'now';
  useEffect(() => {
    if (canRead && staleNow) void dispatch(fetchFeeReminders());
  }, [canRead, staleNow, dispatch]);

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
      <UbPageHeader title={t('library.messages.title')} />
      {state.status === 'idle' || state.status === 'loading' ? (
        <UbPageSkeleton variant="card" />
      ) : state.status === 'failed' ? (
        <UbEmptyState
          variant="error"
          title={t('library.messages.error.title')}
          description={state.error?.message}
          requestId={state.error?.requestId ?? null}
          requestIdLabel={t('common.error.reference')}
        />
      ) : (
        <UbStack gap={3} data-testid="library-messages">
          <UbText variant="body-sm" tone="secondary">
            {t('library.messages.schedule')}
          </UbText>
          {state.rows.length === 0 ? (
            <UbCard padded>
              <UbText variant="body-sm" tone="tertiary">
                {t('library.messages.none')}
              </UbText>
            </UbCard>
          ) : (
            <UbCard padded>
              <UbStack as="ul" gap={0} aria-label={t('library.messages.title')}>
                {state.rows.map((row) => (
                  <UbStack
                    as="li"
                    key={row.membershipId}
                    gap={2}
                    className="border-b border-border-hairline py-3 last:border-b-0"
                  >
                    <UbStack direction="row" justify="between" align="start" gap={3}>
                      <UbListItemText
                        primary={row.name}
                        secondary={[
                          row.memberNumber,
                          row.seat,
                          row.endsOn
                            ? t(
                                row.kind === 'due'
                                  ? 'library.messages.endsOn'
                                  : 'library.messages.endedOn',
                                { date: formatBusinessDate(row.endsOn) }
                              )
                            : '',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      />
                      <UbStack gap={1} align="end" className="shrink-0">
                        <UbAmount
                          value={row.amount}
                          tone="receivable"
                          label={t('library.member.owes')}
                        />
                        <UbStatusBadge
                          tone={row.kind === 'due' ? 'warning' : 'error'}
                          label={t(
                            row.kind === 'due' ? 'library.fee.due_soon' : 'library.fee.overdue'
                          )}
                        />
                      </UbStack>
                    </UbStack>
                    <UbStack direction="row" gap={2} align="center" wrap>
                      {canSend && row.hasMobile && (
                        <UbButton
                          size="sm"
                          variant={row.sentToday ? 'secondary' : 'primary'}
                          icon={<MessageCircle className="h-4 w-4" aria-hidden />}
                          onClick={() => setOpen(row)}
                        >
                          {t('library.messages.send')}
                        </UbButton>
                      )}
                      {!row.hasMobile && (
                        <UbText variant="caption" tone="tertiary">
                          {t('library.messages.noMobile', { name: row.name })}
                        </UbText>
                      )}
                      {row.sentToday && (
                        <UbStatusBadge tone="success" label={t('library.messages.sentToday')} />
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
          membershipId={open.membershipId}
          name={open.name}
          kind="fee"
          onClose={() => setOpen(null)}
        />
      )}
    </UbPageShell>
  );
}
