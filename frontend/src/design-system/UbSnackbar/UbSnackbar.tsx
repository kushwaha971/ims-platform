'use client';

import { memo, useEffect } from 'react';

import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';

import { MLButton, MLToaster } from 'src/design-system/primitives';
import { cn } from 'src/utils/cn';

/**
 * Part 19 §19.12.2 — the single toast channel, driven by `snackbarSlice`.
 *
 * The component knows nothing about Redux (§19.1.2): the host in
 * `components/layout` subscribes and passes the queue down as props. Koper's
 * content rule applies: "what happened, and the move it enables".
 */
export type UbSnackbarSeverity = 'success' | 'info' | 'warning' | 'error';

export interface UbSnackbarMessage {
  readonly id: string;
  readonly severity: UbSnackbarSeverity;
  readonly message: string;
  /** Shown as `ds-mono` caption so a screenshot carries the trace id (R-E-4). */
  readonly requestId?: string | null;
  readonly actionLabel?: string;
}

export interface UbSnackbarProps {
  readonly messages: readonly UbSnackbarMessage[];
  readonly onDismiss: (id: string) => void;
  readonly onAction?: (id: string) => void;
  /** Dismiss text, translated by the caller. */
  readonly dismissLabel: string;
  readonly autoHideMs?: number;
  readonly className?: string;
}

const ICON: Record<UbSnackbarSeverity, typeof Info> = {
  success: CheckCircle2,
  info: Info,
  warning: TriangleAlert,
  error: AlertCircle,
};

const TONE: Record<UbSnackbarSeverity, string> = {
  success: 'border-success/40',
  info: 'border-info/40',
  warning: 'border-warning/40',
  error: 'border-formError',
};

const ICON_TONE: Record<UbSnackbarSeverity, string> = {
  success: 'text-success',
  info: 'text-info',
  warning: 'text-warning',
  error: 'text-formError',
};

function UbSnackbarBase({
  messages,
  onDismiss,
  onAction,
  dismissLabel,
  autoHideMs = 5_000,
  className,
}: Readonly<UbSnackbarProps>) {
  const head = messages[0];

  useEffect(() => {
    if (!head) return undefined;
    // An error stays until it is dismissed: a failure the user did not see is
    // a failure that did not surface (R-E-3).
    if (head.severity === 'error') return undefined;
    const timer = window.setTimeout(() => onDismiss(head.id), autoHideMs);
    return () => window.clearTimeout(timer);
  }, [head, autoHideMs, onDismiss]);

  if (!head) return null;
  const Icon = ICON[head.severity];

  return (
    <MLToaster className={cn(className)}>
      <div
        data-testid="snackbar"
        role={head.severity === 'error' ? 'alert' : 'status'}
        className={cn(
          'pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-md border bg-surface-raised p-4 shadow-3',
          TONE[head.severity]
        )}
      >
        <Icon aria-hidden className={cn('mt-0.5 h-4 w-4 shrink-0', ICON_TONE[head.severity])} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="ds-body-sm text-text-primary">{head.message}</p>
          {head.requestId && <p className="ds-mono text-text-muted">{head.requestId}</p>}
        </div>
        {head.actionLabel && onAction && (
          <MLButton variant="ghost" size="sm" onClick={() => onAction(head.id)}>
            {head.actionLabel}
          </MLButton>
        )}
        <MLButton
          variant="ghost"
          size="sm"
          aria-label={dismissLabel}
          onClick={() => onDismiss(head.id)}
        >
          <X aria-hidden className="h-4 w-4" />
        </MLButton>
      </div>
    </MLToaster>
  );
}

UbSnackbarBase.displayName = 'UbSnackbar';
export const UbSnackbar = memo(UbSnackbarBase);
