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
 *
 * ── CR-2026-09-19-D ─────────────────────────────────────────────────────────
 * The states were specified and never designed. A 32 px grey icon on the bare
 * canvas, a heading, a sentence and a button, all on a 12 px gap, is a stack of
 * four elements rather than a composition — and on the parties screen it was
 * the FIRST thing every new merchant saw.
 *
 *  · The icon sits in a tinted disc — `--surface-sunken` for the two neutral
 *    variants, `--form-error-dim` for the failure — which gives the block a
 *    centre of gravity and stops a lone glyph floating.
 *  · The first-use and filtered variants sit on a dashed hairline panel. An
 *    empty list still has to look like the list it will become; a heading
 *    floating on the canvas looks like a page that failed to load.
 *  · The title is `ds-h3` over a `ds-body` sentence with a real measure, and
 *    the action is separated by 24 px rather than sharing the text's 12.
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
  firstUse: 'bg-surface-sunken text-text-tertiary',
  filtered: 'bg-surface-sunken text-text-tertiary',
  // An error is the validation/system family, never the receivable red.
  error: 'bg-formError-dim text-formError',
};

const PANEL: Record<UbEmptyStateVariant, string> = {
  firstUse: 'rounded-card border border-dashed border-border-subtle bg-surface-card/50',
  filtered: 'rounded-card border border-dashed border-border-subtle bg-surface-card/50',
  error: 'rounded-card border border-formError bg-formError-dim',
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
      className={cn('gap-3 px-6 py-10', PANEL[variant], className)}
    >
      <span
        aria-hidden
        className={cn(
          'mb-1 flex h-12 w-12 items-center justify-center rounded-pill',
          ICON_TONE[variant]
        )}
      >
        <Icon className="h-6 w-6" />
      </span>
      <MLEmptyTitle>{title}</MLEmptyTitle>
      {description && <MLEmptyDescription>{description}</MLEmptyDescription>}
      {action && <span className="mt-2 inline-flex">{action}</span>}
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
