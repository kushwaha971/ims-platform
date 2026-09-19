'use client';

import { useCallback, useState } from 'react';

import {
  UbAmount,
  UbCard,
  UbEmptyState,
  UbPageHeader,
  UbPageShell,
  UbSkeleton,
  UbSnackbar,
  UbStatusBadge,
  UbStatusBanner,
  type UbSnackbarMessage,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';

/**
 * Part 23 §23.4 — the live gallery. Storybook is not a dependency (ADR-021), so
 * this route is where a reviewer sees every `Ub*` wrapper in every state, in
 * both locales and both themes.
 *
 * It is the only place in the application where a `Ub*` is rendered with
 * literal strings rather than translated props, and that is deliberate: the
 * gallery is developer chrome, not product (§23.2.2's `ds-label-caps` rule).
 */
const DEMO: readonly UbSnackbarMessage[] = [
  {
    id: 'demo',
    severity: 'error',
    message: 'Could not reach the server.',
    requestId: 'req_7f3a91',
  },
];

export function DesignSystemGallery(): React.JSX.Element {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<readonly UbSnackbarMessage[]>(DEMO);
  const onDismiss = useCallback(() => setMessages([]), []);

  return (
    <UbPageShell
      header={
        <UbPageHeader title={t('designSystem.title')} subtitle={t('designSystem.subtitle')} />
      }
    >
      <div className="flex flex-col gap-6">
        <UbCard title="UbAmount" description="Part 23 §23.2.6 — every case in the table.">
          <div className="flex flex-wrap items-start gap-8">
            <UbAmount value="500.00" tone="receivable" sign="minus" label="You gave" />
            <UbAmount value="300.00" tone="payable" sign="plus" label="You got" />
            <UbAmount value="2800.00" tone="receivable" label="You will get" size="lg" />
            <UbAmount value="0.00" tone="receivable" sign="minus" label="Settled" />
            <UbAmount value={null} />
            <UbAmount value="123456.5" tone="payable" label="You will give" size="sm" />
          </div>
        </UbCard>

        <UbCard title="UbStatusBadge">
          <div className="flex flex-wrap gap-2">
            <UbStatusBadge label="Draft" tone="info" />
            <UbStatusBadge label="Paid" tone="success" />
            <UbStatusBadge label="Due soon" tone="warning" />
            <UbStatusBadge label="Overdue" tone="error" />
            <UbStatusBadge label="Archived" />
          </div>
        </UbCard>

        <UbCard title="UbStatusBanner">
          <div className="flex flex-col gap-3">
            <UbStatusBanner tone="info" title="Draft saved" description="Saved a moment ago." />
            <UbStatusBanner tone="warning" title={t('common.network.degraded')} />
            <UbStatusBanner
              tone="offline"
              title={t('common.network.offline')}
              description={t('common.network.pending', { count: 2 })}
            />
            <UbStatusBanner
              tone="error"
              title="We could not save this"
              description="Check the highlighted fields."
            />
          </div>
        </UbCard>

        <UbCard title="UbEmptyState">
          <div className="flex flex-col gap-4">
            <UbEmptyState
              variant="firstUse"
              title={t('parties.list.empty.firstUse.title')}
              description={t('parties.list.empty.firstUse.body')}
            />
            <UbEmptyState
              variant="filtered"
              title={t('parties.list.empty.filtered.title')}
              description={t('parties.list.empty.filtered.body')}
            />
            <UbEmptyState
              variant="error"
              title={t('parties.list.error.title')}
              description={t('parties.list.error.body')}
              requestId="req_7f3a91"
            />
          </div>
        </UbCard>

        <UbCard title="UbSkeleton">
          <div className="flex flex-col gap-4">
            <UbSkeleton variant="list" count={3} />
            <UbSkeleton variant="card" />
            <UbSkeleton variant="form" count={2} />
          </div>
        </UbCard>
      </div>

      <UbSnackbar
        messages={messages}
        onDismiss={onDismiss}
        dismissLabel={t('common.action.dismiss')}
      />
    </UbPageShell>
  );
}
