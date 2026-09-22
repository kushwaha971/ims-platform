'use client';

import { memo, useEffect } from 'react';

import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';

import { MLButton, MLToast, MLToaster } from 'src/design-system/primitives';
import { cn } from 'src/utils/cn';

/**
 * Part 19 §19.12.2 — the single toast channel, driven by `snackbarSlice`.
 *
 * The component knows nothing about Redux (§19.1.2): the host in
 * `components/layout` subscribes and passes ONE message down as props. Koper's
 * content rule applies: "what happened, and the move it enables".
 *
 * ── CR-2026-09-19-E ─────────────────────────────────────────────────────────
 *  · It takes one message, not a queue — BrandHub's `CustomerSnackbar` reads a
 *    single-message slice and so does this now (see `snackbarSlice`).
 *  · `AUTO_HIDE_MS` is 4000, BrandHub's `CustomerSnackbar` value. It used to be
 *    5000 here, with errors pinned open indefinitely.
 *  · The live region is chosen by severity: an error is announced `assertive`,
 *    everything else `polite` (R-A-7). `MLToaster` keeps both regions mounted
 *    so the choice is reliable — see ../primitives/mlToastPrimitives.tsx.
 *  · Dismiss is a real button with a translated accessible name, and it is the
 *    last thing in the toast's tab order, so the whole toast is reachable by
 *    keyboard.
 */
export type UbSnackbarSeverity = 'success' | 'error' | 'warning' | 'info';

export interface UbSnackbarProps {
  /** `null` renders nothing but the (empty) live regions. */
  readonly message: string | null;
  readonly severity: UbSnackbarSeverity;
  /** Shown as `ds-mono` caption so a screenshot carries the trace id (R-E-4). */
  readonly requestId?: string | null;
  readonly actionLabel?: string;
  readonly onDismiss: () => void;
  readonly onAction?: () => void;
  /** Dismiss text, translated by the caller. */
  readonly dismissLabel: string;
  readonly autoHideMs?: number;
  readonly className?: string;
}

/** BrandHub `CustomerSnackbar`'s `AUTO_HIDE_MS`. */
export const UB_SNACKBAR_AUTO_HIDE_MS = 4_000;

const ICON: Record<UbSnackbarSeverity, typeof Info> = {
  success: CheckCircle2,
  info: Info,
  warning: TriangleAlert,
  error: AlertCircle,
};

const ICON_TONE: Record<UbSnackbarSeverity, string> = {
  success: 'text-success',
  info: 'text-info',
  warning: 'text-warning',
  error: 'text-formError',
};

function UbSnackbarBase({
  message,
  severity,
  requestId,
  actionLabel,
  onDismiss,
  onAction,
  dismissLabel,
  autoHideMs = UB_SNACKBAR_AUTO_HIDE_MS,
  className,
}: Readonly<UbSnackbarProps>) {
  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(onDismiss, autoHideMs);
    return () => window.clearTimeout(timer);
  }, [message, requestId, autoHideMs, onDismiss]);

  const Icon = ICON[severity];

  return (
    <MLToaster politeness={severity === 'error' ? 'assertive' : 'polite'} className={cn(className)}>
      {message ? (
        <MLToast data-testid="snackbar" variant={severity}>
          <Icon aria-hidden className={cn('mt-0.5 h-4 w-4 shrink-0', ICON_TONE[severity])} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="ds-body-sm text-current">{message}</p>
            {requestId ? <p className="ds-mono text-text-muted">{requestId}</p> : null}
          </div>
          {actionLabel && onAction ? (
            <MLButton variant="ghost" size="sm" onClick={onAction}>
              {actionLabel}
            </MLButton>
          ) : null}
          <MLButton variant="ghost" size="sm" aria-label={dismissLabel} onClick={onDismiss}>
            <X aria-hidden className="h-4 w-4" />
          </MLButton>
        </MLToast>
      ) : null}
    </MLToaster>
  );
}

UbSnackbarBase.displayName = 'UbSnackbar';
export const UbSnackbar = memo(UbSnackbarBase);
