'use client';

import { memo, useEffect, useRef, useState } from 'react';

import { useInView, usePrefersReducedMotion } from 'src/design-system/motion';
import { cn } from 'src/utils/cn';

/**
 * One word from a list at a time, each sliding up and fading in over the one
 * before (`--dur-rotate`, 450 ms), every `intervalMs`.
 *
 * It is DECORATION over a sentence that already exists, and the contract is
 * built around that:
 *
 *  - The whole thing is `aria-hidden`. The caller puts the complete sentence
 *    in the accessible text (an `sr-only` node beside it), so a screen reader
 *    hears "Track udhaar, GST bills, stock and payments" once rather than a
 *    word changing under it every two seconds.
 *  - Every word is rendered in ONE grid cell (`.ub-rotator`), so the widest
 *    reserves the width and nothing on the line moves when the word changes.
 *  - The server renders the first word, which is also what a browser without
 *    JavaScript, a person who asked for reduced motion and an offscreen or
 *    hidden tab all see: the interval only runs while it is in view.
 */
export interface UbRotatingTextProps {
  readonly words: readonly string[];
  readonly intervalMs?: number;
  readonly className?: string;
}

function UbRotatingTextBase({ words, intervalMs = 2400, className }: Readonly<UbRotatingTextProps>) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const reduced = usePrefersReducedMotion();
  const inView = useInView(ref);
  const [{ index, previous }, setTurn] = useState<{ index: number; previous: number | null }>({
    index: 0,
    previous: null,
  });
  const count = words.length;

  useEffect(() => {
    if (reduced || !inView || count < 2) return undefined;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      setTurn((turn) => ({ index: (turn.index + 1) % count, previous: turn.index }));
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [reduced, inView, count, intervalMs]);

  // Reduced motion freezes on whatever is showing — the first word, in practice.
  const active = reduced ? 0 : index;

  return (
    <span ref={ref} aria-hidden className={cn('ub-rotator', className)} data-testid="ub-rotator">
      {words.map((word, i) => (
        <span
          key={word}
          data-state={i === active ? 'in' : i === previous && !reduced ? 'out' : 'wait'}
        >
          {word}
        </span>
      ))}
    </span>
  );
}

UbRotatingTextBase.displayName = 'UbRotatingText';
export const UbRotatingText = memo(UbRotatingTextBase);
