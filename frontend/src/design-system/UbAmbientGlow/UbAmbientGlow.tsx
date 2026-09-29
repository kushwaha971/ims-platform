'use client';

import { memo, useRef } from 'react';

import { useInView } from 'src/design-system/motion';
import { cn } from 'src/utils/cn';

/**
 * Ambient light behind a public page's hero: three blurred indigo blobs drifting on 17–26 s
 * transform-only loops (`.ub-blob` in app/globals.css). Decorative and
 * `aria-hidden`.
 *
 * Three things it must never do, each of which the reference site did:
 *  - widen the page — the layer is `overflow: clip` and `inset-0`, so a blob
 *    translated past the edge is cut, not scrolled to;
 *  - animate for someone who asked it not to — `prefers-reduced-motion` turns
 *    the animation off in CSS, not merely to zero length;
 *  - burn a phone's battery offscreen — the loops pause (`data-ambient`) once
 *    the hero has scrolled away.
 *
 * Light mode is a whisper on white; dark mode is richer — the tokens
 * `--landing-blob*` carry both.
 */
function UbAmbientGlowBase({ className }: Readonly<{ className?: string }>) {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { rootMargin: '100px' });

  return (
    <div
      ref={ref}
      aria-hidden
      data-ambient={inView ? 'running' : 'paused'}
      className={cn('pointer-events-none absolute inset-0 overflow-clip', className)}
    >
      <div
        className="ub-blob -top-24 left-[-10%] h-[26rem] w-[26rem] sm:h-[34rem] sm:w-[34rem]"
        style={{ '--ub-blob-period': '19s' } as React.CSSProperties}
      />
      <div
        className="ub-blob ub-blob-b right-[-12%] top-[8%] h-[24rem] w-[24rem] sm:h-[32rem] sm:w-[32rem]"
        style={{ '--ub-blob-period': '26s' } as React.CSSProperties}
      />
      <div
        className="ub-blob ub-blob-c bottom-[-18%] left-[35%] h-[20rem] w-[20rem] sm:h-[26rem] sm:w-[26rem]"
        style={{ '--ub-blob-period': '17s' } as React.CSSProperties}
      />
      {/* A hairline fade at the bottom, so the section meets the next on canvas. */}
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-canvas" />
    </div>
  );
}

UbAmbientGlowBase.displayName = 'UbAmbientGlow';
export const UbAmbientGlow = memo(UbAmbientGlowBase);
