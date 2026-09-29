'use client';

import { memo, useLayoutEffect, useRef, useState, type ElementType, type ReactNode } from 'react';

import { canObserve, observeIntersection, REDUCED_MOTION_QUERY } from 'src/design-system/motion';
import { cn } from 'src/utils/cn';

/**
 * A section that rises 12 px and fades in the first time it scrolls into view
 * (500 ms, the entrance curve); with `stagger`, each direct child 60 ms after
 * the one before.
 *
 * The rule it exists to keep: **content is visible without JavaScript and
 * whatever is already on screen never blinks.** The server renders no hidden
 * state at all. After hydration, and only for an element that is still BELOW
 * the fold, a layout effect marks it `pending` — before the browser paints, so
 * nothing that was visible is ever hidden — and the shared observer reveals it
 * on arrival. An element already in (or above) the viewport, a browser without
 * IntersectionObserver, and a person who asked for reduced motion all get the
 * plain, static element. The CSS (`.ub-reveal` in `app/globals.css`) reads the
 * durations from `--dur-section` / `--dur-stagger`, which are 0 under
 * `prefers-reduced-motion`.
 *
 * Never put it around a hero's text: the LCP element must not wait for a
 * script to decide it may be seen.
 */
export interface UbRevealProps {
  readonly as?: ElementType;
  /** Delay each direct child by one stagger step (60 ms). */
  readonly stagger?: boolean;
  readonly children: ReactNode;
  readonly className?: string;
  readonly id?: string;
  readonly 'aria-labelledby'?: string;
}

type RevealState = 'static' | 'pending' | 'shown';

function UbRevealBase({
  as = 'div',
  stagger = false,
  children,
  className,
  ...rest
}: Readonly<UbRevealProps>) {
  const ref = useRef<HTMLElement | null>(null);
  const [state, setState] = useState<RevealState>('static');

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || !canObserve()) return undefined;
    if (window.matchMedia?.(REDUCED_MOTION_QUERY).matches) return undefined;
    // Already on screen, or scrolled past (a reload halfway down the page):
    // leave it exactly as the server drew it.
    if (element.getBoundingClientRect().top < window.innerHeight) return undefined;
    setState('pending');
    const stop = observeIntersection(element, '0px 0px -8% 0px', (entry) => {
      if (!entry.isIntersecting) return;
      setState('shown');
      stop();
    });
    return stop;
  }, []);

  const Component = as;
  return (
    <Component
      ref={ref}
      data-reveal={state === 'static' ? undefined : state}
      className={cn('ub-reveal', stagger && 'ub-reveal-stagger', className)}
      {...rest}
    >
      {children}
    </Component>
  );
}

UbRevealBase.displayName = 'UbReveal';
export const UbReveal = memo(UbRevealBase);
