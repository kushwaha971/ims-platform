'use client';

import { RefreshCw } from 'lucide-react';

import {
  UbButton,
  UbEmptyState,
  UbPageHeader,
  UbPageShell,
  UbSkeleton,
  UbStack,
  UbStatCard,
  UbStatGrid,
  UbText,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { formatTimestamp } from 'src/utils/dates';

import { useAdminHealth } from '../hooks/useAdmin';
import { secondsText } from '../view-model/adminDisplay';

/**
 * PLT-14 FR-7 / AC-5 — database, storage, the scheduler's heartbeat and the job
 * queue, refreshed every 30 s. A stopped scheduler turns its tile red within two
 * minutes, because the heartbeat it writes every tick stops moving — an empty
 * queue and a dead runner no longer look the same.
 */
export function AdminHealthPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const { state, refetch } = useAdminHealth();
  const health = state.health;

  const header = (
    <UbPageHeader
      title={t('admin.health.title')}
      subtitle={
        health ? t('admin.health.checked', { when: formatTimestamp(health.checkedAt) }) : undefined
      }
      actions={
        <UbButton
          variant="secondary"
          iconOnly="mobile"
          icon={<RefreshCw aria-hidden className="h-4 w-4" />}
          busy={state.healthStatus === 'refreshing'}
          onClick={refetch}
        >
          {t('admin.health.refresh')}
        </UbButton>
      }
    />
  );

  let body: React.ReactNode;
  if (state.healthStatus === 'failed' && !health) {
    body = (
      <UbEmptyState
        variant="error"
        title={t('admin.error.title')}
        description={state.healthError?.message ?? t('admin.error.body')}
        requestId={state.healthError?.requestId ?? null}
        requestIdLabel={t('common.error.reference')}
        action={
          <UbButton variant="secondary" onClick={refetch}>
            {t('common.action.retry')}
          </UbButton>
        }
      />
    );
  } else if (!health) {
    body = <UbSkeleton variant="card" count={2} />;
  } else {
    const ok = t('admin.health.ok');
    const down = t('admin.health.down');
    body = (
      <UbStack gap={4}>
        <UbStatGrid label={t('admin.health.services')} live>
          <UbStatCard
            label={t('admin.health.db')}
            value={health.dbOk ? ok : down}
            subtext={t('admin.health.latency', { ms: health.dbLatencyMs })}
            tone={health.dbOk ? 'success' : 'danger'}
          />
          <UbStatCard
            label={t('admin.health.storage')}
            value={health.storageOk ? ok : down}
            subtext={
              health.freeMb === null ? undefined : t('admin.health.free', { mb: health.freeMb })
            }
            tone={health.storageOk ? 'success' : 'danger'}
          />
          <UbStatCard
            label={t('admin.health.scheduler')}
            value={health.schedulerOk ? ok : down}
            subtext={
              health.lastHeartbeatAt
                ? t('admin.health.lag', { lag: secondsText(health.lagS) })
                : t('admin.health.noHeartbeat')
            }
            tone={health.schedulerOk ? 'success' : 'danger'}
          />
        </UbStatGrid>
        <UbStatGrid label={t('admin.health.jobs')}>
          <UbStatCard label={t('admin.health.queued')} value={String(health.queued)} />
          <UbStatCard label={t('admin.health.running')} value={String(health.running)} />
          <UbStatCard
            label={t('admin.health.failed')}
            value={String(health.failed24h)}
            tone={health.failed24h > 0 ? 'danger' : 'default'}
          />
          <UbStatCard label={t('admin.health.oldest')} value={secondsText(health.oldestQueuedS)} />
        </UbStatGrid>
        <UbText variant="caption" tone="tertiary">
          {t('admin.health.footer', { version: health.version, email: health.emailBackend })}
        </UbText>
      </UbStack>
    );
  }

  return <UbPageShell header={header}>{body}</UbPageShell>;
}
