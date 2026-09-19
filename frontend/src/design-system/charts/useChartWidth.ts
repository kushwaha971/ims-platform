'use client';

import { useEffect, useRef, useState } from 'react';

import { CHART_FALLBACK_WIDTH } from './chartScale';

/**
 * The measured inner width of a chart's container, in CSS pixels.
 *
 * A `viewBox` that is scaled to the card would scale the axis text with it, so
 * a 360 px phone would get 0.6× labels. Instead every chart is drawn at its
 * real pixel size and the text stays at its token size, which is also what
 * makes "leave room in the viewBox for the outermost labels" a fixed gutter
 * rather than a guess.
 *
 * Measuring happens in an effect, never during render, so the server and the
 * first client paint agree (R-H-6). Before the first measurement — and under
 * jsdom, which has neither `ResizeObserver` nor layout — the fallback width is
 * used, so a chart is never rendered at zero width.
 */
export const useChartWidth = (): readonly [React.RefObject<HTMLDivElement | null>, number] => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(CHART_FALLBACK_WIDTH);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    const measure = (): void => {
      const measured = element.getBoundingClientRect().width;
      setWidth(measured > 0 ? Math.round(measured) : CHART_FALLBACK_WIDTH);
    };

    measure();

    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
};
