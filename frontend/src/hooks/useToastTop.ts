'use client';

import { useLayoutEffect, useState } from 'react';

/** B19: a wrapped page header must move the desktop toast below its actions. */
export function useToastTop(enabled: boolean): number {
  const [top, setTop] = useState(128);

  useLayoutEffect(() => {
    if (!enabled) return undefined;
    const headers = () => [...document.querySelectorAll<HTMLElement>('[data-ub-page-header]')];
    const measure = () => {
      const edges = headers()
        .map((header) => header.getBoundingClientRect())
        .filter(
          (rect) =>
            rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight
        )
        .map((rect) => rect.bottom);
      setTop((edges.length ? Math.max(...edges) : 112) + 16);
    };
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    const refresh = () => {
      resize?.disconnect();
      headers().forEach((header) => resize?.observe(header));
      measure();
    };
    refresh();
    // A toast can survive navigation, so observe replacement headers as well.
    const mutations = new MutationObserver(refresh);
    mutations.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      resize?.disconnect();
      mutations.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [enabled]);

  return top;
}
