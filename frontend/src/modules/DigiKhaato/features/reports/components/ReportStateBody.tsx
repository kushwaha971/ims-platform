'use client';

import type { ReactNode } from 'react';

import { UbButton, UbEmptyState, UbSkeleton, UbStack } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import type { ApiErrorShape } from 'src/types/api.types';

/**
 * One report body, by state — the half of `ReportPageShell` that has no date
 * controls and no export, so a screen that needs only this (the dashboard,
 * the landing page every merchant loads first) does not download the period
 * picker's calendar to draw a skeleton.
 *
 * `loading` is a skeleton shaped like a report (tiles, then rows) in a busy
 * `status` region; `error` is the server's sentence with its request id and
 * Retry; `empty` is the caller's empty state; `ready` renders `children`.
 * Exactly one of them at a time.
 */
export type ReportState = 'loading' | 'error' | 'empty' | 'ready';

export interface ReportEmpty {
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
  /** `firstUse` — nothing recorded yet; `filtered` — the scope hides everything. */
  readonly variant?: 'firstUse' | 'filtered';
}

export interface ReportStateBodyProps {
  readonly state: ReportState;
  readonly error?: ApiErrorShape | null;
  readonly onRetry?: () => void;
  readonly empty?: ReportEmpty;
  /** Announced while loading ("Loading the day book"). */
  readonly loadingLabel: string;
  /** How many skeleton tiles above the skeleton rows; 0 for a list-only report. */
  readonly skeletonTiles?: number;
  readonly children?: ReactNode;
}

export function ReportStateBody({
  state,
  error,
  onRetry,
  empty,
  loadingLabel,
  skeletonTiles = 4,
  children,
}: Readonly<ReportStateBodyProps>): React.JSX.Element | null {
  const { t } = useTranslation();

  if (state === 'loading') {
    return (
      <UbStack gap={3} aria-busy="true" aria-label={loadingLabel} role="status">
        {skeletonTiles > 0 && (
          <UbStack direction="row" gap={3} className="flex-wrap">
            {Array.from({ length: skeletonTiles }, (_, index) => (
              <UbSkeleton key={index} className="h-24 min-w-36 flex-1" />
            ))}
          </UbStack>
        )}
        {Array.from({ length: 6 }, (_, index) => (
          <UbSkeleton key={index} className="h-12 w-full" />
        ))}
      </UbStack>
    );
  }

  if (state === 'error') {
    return (
      <UbEmptyState
        variant="error"
        title={t('reports.shell.error.title')}
        description={error?.message ?? t('reports.shell.error.body')}
        requestId={error?.requestId ?? null}
        requestIdLabel={t('common.error.reference')}
        action={
          onRetry ? (
            <UbButton variant="secondary" onClick={onRetry}>
              {t('common.action.retry')}
            </UbButton>
          ) : undefined
        }
      />
    );
  }

  if (state === 'empty') {
    return empty ? (
      <UbEmptyState
        variant={empty.variant ?? 'filtered'}
        title={empty.title}
        description={empty.description}
        action={empty.action}
      />
    ) : null;
  }

  return <>{children}</>;
}
