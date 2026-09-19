'use client';

import { memo, type ReactNode } from 'react';

import { AlertCircle, Inbox, SearchX } from 'lucide-react';

import { MLEmpty, MLEmptyDescription, MLEmptyTitle } from 'src/design-system/primitives';
import { cn } from 'src/utils/cn';

/**
 * Part 23 §23.3 — three variants, because "no rows" means three different
 * things: nothing exists yet, the filters excluded everything, or the request
 * failed. Koper's rule applies to all three: absence is a finding — name the
 * gap and offer the one action that closes it.
 */
export type UbEmptyStateVariant = 'firstUse' | 'filtered' | 'error';

export interface UbEmptyStateProps {
  readonly variant: UbEmptyStateVariant;
  readonly title: string;
  readonly description?: string;
  /** Exactly one action: the move that closes the gap. */
  readonly action?: ReactNode;
  /**
   * The request id of the failure, rendered as `ds-mono` caption (R-E-4). It is
   * the only thing that connects a user's screenshot to a backend log line.
   */
  readonly requestId?: string | null;
  readonly className?: string;
}

const ICON: Record<UbEmptyStateVariant, typeof Inbox> = {
  firstUse: Inbox,
  filtered: SearchX,
  error: AlertCircle,
};

const ICON_TONE: Record<UbEmptyStateVariant, string> = {
  firstUse: 'text-text-tertiary',
  filtered: 'text-text-tertiary',
  // An error is the validation/system family, never the receivable red.
  error: 'text-formError',
};

function UbEmptyStateBase({
  variant,
  title,
  description,
  action,
  requestId,
  className,
}: Readonly<UbEmptyStateProps>) {
  const Icon = ICON[variant];

  return (
    <MLEmpty
      // R-A-6 — an error state is announced.
      role={variant === 'error' ? 'alert' : undefined}
      className={cn(
        variant === 'error' && 'rounded-md border border-formError bg-formError-dim',
        className
      )}
    >
      <Icon aria-hidden className={cn('h-8 w-8', ICON_TONE[variant])} />
      <MLEmptyTitle>{title}</MLEmptyTitle>
      {description && <MLEmptyDescription>{description}</MLEmptyDescription>}
      {action}
      {requestId && (
        <p className="ds-mono text-text-muted" data-testid="request-id">
          {requestId}
        </p>
      )}
    </MLEmpty>
  );
}

UbEmptyStateBase.displayName = 'UbEmptyState';
export const UbEmptyState = memo(UbEmptyStateBase);
