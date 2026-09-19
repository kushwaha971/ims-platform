'use client';

import { memo, type ReactNode } from 'react';

import { AlertCircle, CheckCircle2, CloudOff, Info, TriangleAlert } from 'lucide-react';

import { MLAlert, MLAlertDescription, MLAlertTitle } from 'src/design-system/primitives';
import { cn } from 'src/utils/cn';

/**
 * Part 23 §23.3 — the page-level notice. §23.5: an error is an OUTLINED block
 * with an icon and a sentence; a red border with no text is not an error state,
 * and a filled red block is never used.
 *
 * The network strip of §19.10.3 is this component in its `offline` /
 * `degraded` tones, which is why `CloudOff` is one of the icons.
 */
export type UbStatusBannerTone = 'info' | 'success' | 'warning' | 'error' | 'offline';

export interface UbStatusBannerProps {
  readonly tone?: UbStatusBannerTone;
  readonly title: string;
  readonly description?: string;
  /** At most one action: the move the banner enables. */
  readonly action?: ReactNode;
  readonly className?: string;
}

const ICON: Record<UbStatusBannerTone, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warning: TriangleAlert,
  error: AlertCircle,
  offline: CloudOff,
};

const VARIANT: Record<UbStatusBannerTone, 'info' | 'success' | 'warning' | 'error'> = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  error: 'error',
  // A queued/offline state is amber "waiting for signal", never red (§23.2.4).
  offline: 'warning',
};

const ICON_TONE: Record<UbStatusBannerTone, string> = {
  info: 'text-info',
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-formError',
  offline: 'text-warning',
};

function UbStatusBannerBase({
  tone = 'info',
  title,
  description,
  action,
  className,
}: Readonly<UbStatusBannerProps>) {
  const Icon = ICON[tone];

  return (
    <MLAlert
      variant={VARIANT[tone]}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      className={cn(className)}
    >
      <Icon aria-hidden className={cn('mt-0.5 h-4 w-4 shrink-0', ICON_TONE[tone])} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <MLAlertTitle>{title}</MLAlertTitle>
        {description && <MLAlertDescription>{description}</MLAlertDescription>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </MLAlert>
  );
}

UbStatusBannerBase.displayName = 'UbStatusBanner';
export const UbStatusBanner = memo(UbStatusBannerBase);
