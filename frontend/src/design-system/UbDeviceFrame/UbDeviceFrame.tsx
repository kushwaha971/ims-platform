'use client';

import { memo, type ReactNode } from 'react';

import { Lock } from 'lucide-react';

import { cn } from 'src/utils/cn';

/**
 * A device around a product recording — the landing page's hero and its
 * use-case explorer. Two variants, because a desktop recording in a phone
 * outline (or the reverse) is the tell of a page that shrank one clip to fit:
 *
 *  - `browser` — a window: three quiet dots, a URL pill ("yourkhata.com"),
 *    the screen below. 20 px radius, a hairline border, a soft indigo glow.
 *  - `phone` — an ink bezel with a speaker pill in its own top band (so it
 *    never covers the app header the recording starts with), 44 px outer
 *    radius, the screen inset 9 px.
 *
 * `tilt` leans the frame back a little in 3D (≈ −2°, with perspective) and
 * straightens it on hover — only where the device has a fine pointer that can
 * hover, so a phone never gets stuck half-tilted after a tap. The transition
 * is `--dur-tilt`, which is 0 under reduced motion; a person who asked for
 * less motion also gets no tilt at all.
 *
 * The frame draws nothing inside the screen: the caller's child (a `UbVideo`,
 * usually) owns the aspect ratio, which is what keeps it zero-CLS.
 */
export type UbDeviceFrameVariant = 'browser' | 'phone';

export interface UbDeviceFrameProps {
  readonly variant: UbDeviceFrameVariant;
  readonly children: ReactNode;
  /** The address the browser variant shows. Decorative (`aria-hidden`). */
  readonly url?: string;
  readonly tilt?: boolean;
  readonly glow?: boolean;
  readonly className?: string;
}

const TILT =
  'motion-safe:[transform:rotateX(3deg)_rotateY(-5deg)_rotate(-1.5deg)] motion-safe:transition-transform motion-safe:duration-[var(--dur-tilt)] motion-safe:ease-entrance [@media(hover:hover)_and_(pointer:fine)]:group-hover/device:[transform:none]';

const GLOW = 'shadow-[0_32px_90px_-28px_var(--device-glow),0_12px_32px_-18px_rgb(10_9_11/0.18)]';

function UbDeviceFrameBase({
  variant,
  children,
  url,
  tilt = false,
  glow = true,
  className,
}: Readonly<UbDeviceFrameProps>) {
  if (variant === 'phone') {
    return (
      <div className={cn('group/device [perspective:1600px]', className)} data-device="phone">
        <div
          className={cn(
            'relative rounded-[2.75rem] bg-[hsl(var(--device-bezel))] px-[9px] pb-[12px] pt-[26px]',
            'ring-1 ring-inset ring-white/10',
            glow && GLOW,
            tilt && TILT
          )}
        >
          <span
            aria-hidden
            className="absolute left-1/2 top-[9px] h-[8px] w-[64px] -translate-x-1/2 rounded-full bg-white/15"
          />
          <div className="relative overflow-hidden rounded-[2.05rem] bg-canvas">{children}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('group/device [perspective:2000px]', className)} data-device="browser">
      <div
        className={cn(
          'overflow-hidden rounded-[20px] border border-border-hairline bg-surface-card',
          glow && GLOW,
          tilt && TILT
        )}
      >
        <div
          aria-hidden
          className="flex h-9 items-center gap-3 border-b border-border-hairline bg-surface-subtle px-3.5"
        >
          <span className="flex shrink-0 gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-border-subtle" />
            <span className="h-2.5 w-2.5 rounded-full bg-border-subtle" />
            <span className="h-2.5 w-2.5 rounded-full bg-border-subtle" />
          </span>
          {url && (
            <span className="mx-auto flex h-6 min-w-0 max-w-[60%] items-center gap-1.5 rounded-pill border border-border-hairline bg-surface-card px-3 ds-body-xs-regular text-text-tertiary">
              <Lock className="h-3 w-3 shrink-0" />
              <span className="truncate">{url}</span>
            </span>
          )}
          {/* Balances the dots so the pill sits in the true centre. */}
          <span className="w-[42px] shrink-0" />
        </div>
        <div className="relative">{children}</div>
      </div>
    </div>
  );
}

UbDeviceFrameBase.displayName = 'UbDeviceFrame';
export const UbDeviceFrame = memo(UbDeviceFrameBase);
