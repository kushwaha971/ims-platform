'use client';

import { useCallback, useMemo, useState } from 'react';

import dynamic from 'next/dynamic';

import { DEFAULT_TENANT_TIMEZONE } from 'src/constants';
import {
  UbAmount,
  UbButton,
  UbCard,
  UbEmptyState,
  UbSectionHeading,
  UbSkeleton,
  UbStack,
  UbStatusBadge,
  UbText,
} from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectTenantTimezone } from 'src/redux/slice/sessionSlice';

import { useModuleReminders } from '../hooks/useModuleReminders';
import {
  MODULE_BUCKETS,
  MODULE_BUCKET_LABEL,
  nextAllowedLabel,
} from '../view-model/moduleReminderDisplay';

import type { ModuleReminderRow } from '../types/reminder.types';

import 'src/i18n/catalogues/reminders';

const SourceReminderSheetLazy = /* @__PURE__ */ dynamic(() =>
  import('./SourceReminderSheet').then((m) => m.SourceReminderSheet)
);

/**
 * A7 (PLT-X06 §2 flows 1-2) — one module's reminder tab: its records, grouped by
 * bucket, each with Remind or, when the module's policy says not now, the next
 * time it may go. The row's title is the RECORD ("Instalment 4 of LN-0042"),
 * because that is what the reminder is about; the party and, when someone else
 * receives it, the recipient ride underneath. The bucket is the group's
 * heading and only there: a badge on every row repeated it word for word (look
 * pass).
 */
export function ModuleRemindersPanel({ module }: Readonly<{ module: string }>): React.JSX.Element {
  const { t, d } = useTranslation();
  const timeZone = useAppSelector(selectTenantTimezone) ?? DEFAULT_TENANT_TIMEZONE;
  const { rows, status, error, sentIds, canRemind, refetch } = useModuleReminders(module);
  const [target, setTarget] = useState<ModuleReminderRow | null>(null);

  const groups = useMemo(
    () =>
      MODULE_BUCKETS.map((bucket) => ({
        bucket,
        rows: rows.filter((row) => row.bucket === bucket),
      })).filter((group) => group.rows.length > 0),
    [rows]
  );

  const close = useCallback(
    (open: boolean) => {
      if (open) return;
      setTarget(null);
      refetch();
    },
    [refetch]
  );

  if (status === 'failed' && rows.length === 0) {
    return (
      <UbEmptyState
        variant="error"
        title={t('reminders.error.title')}
        description={error?.message ?? t('reminders.error.body')}
        requestId={error?.requestId ?? null}
        requestIdLabel={t('common.error.reference')}
        action={
          <UbButton variant="secondary" onClick={refetch}>
            {t('common.action.retry')}
          </UbButton>
        }
      />
    );
  }
  if (status === 'loading' || status === 'idle') {
    return <UbSkeleton variant="list" count={3} label={t('reminders.loading')} />;
  }
  if (rows.length === 0) {
    return (
      <UbEmptyState
        variant="firstUse"
        title={t('reminders.module.empty.title')}
        description={t('reminders.module.empty.body')}
      />
    );
  }

  return (
    <UbStack gap={4}>
      {groups.map((group) => (
        <UbStack key={group.bucket} gap={2}>
          <UbSectionHeading
            as="h3"
            title={t(MODULE_BUCKET_LABEL[group.bucket])}
            meta={String(group.rows.length)}
          />
          <UbCard padded={false}>
            <UbStack as="ul" gap={0}>
              {group.rows.map((row) => (
                <UbStack
                  as="li"
                  key={row.sourceId}
                  direction="row"
                  align="start"
                  justify="between"
                  gap={3}
                  className="border-b border-border-hairline px-4 py-3 last:border-b-0"
                >
                  <UbStack gap={1} className="min-w-0">
                    <UbText
                      variant="body-sm"
                      className="line-clamp-2 whitespace-normal break-words"
                    >
                      {row.subjectLabel}
                    </UbText>
                    <UbText variant="caption" tone="tertiary" className="break-words">
                      {row.recipient
                        ? t('reminders.module.partyAndRecipient', {
                            party: row.party.name,
                            recipient: row.recipient.name,
                          })
                        : row.party.name}
                    </UbText>
                    <UbStack direction="row" gap={2} align="center" className="flex-wrap">
                      {row.amount !== null && (
                        <UbText variant="caption" tone="tertiary">
                          {t('reminders.module.dueOn', { date: d(row.dueOn) })}
                        </UbText>
                      )}
                      {sentIds.includes(row.sourceId) && (
                        <UbStatusBadge tone="success" label={t('reminders.module.sentNow')} />
                      )}
                    </UbStack>
                    {!row.allowed && row.nextAllowedAt && (
                      <UbText variant="caption" tone="tertiary">
                        {nextAllowedLabel(t, d, row.nextAllowedAt, timeZone)}
                      </UbText>
                    )}
                  </UbStack>
                  <UbStack gap={2} align="end" className="shrink-0">
                    {row.amount !== null && <UbAmount value={row.amount} size="sm" />}
                    {canRemind && row.allowed && (
                      <UbButton variant="secondary" size="sm" onClick={() => setTarget(row)}>
                        {t('reminders.module.remind')}
                      </UbButton>
                    )}
                  </UbStack>
                </UbStack>
              ))}
            </UbStack>
          </UbCard>
        </UbStack>
      ))}
      {target && (
        <SourceReminderSheetLazy
          source={{ sourceType: target.sourceType, sourceId: target.sourceId }}
          title={target.subjectLabel}
          open
          onOpenChange={close}
        />
      )}
    </UbStack>
  );
}
