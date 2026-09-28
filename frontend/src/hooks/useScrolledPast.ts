'use client';

import { useEffect, useState } from 'react';

/**
 * Whether an element has scrolled up and out of the viewport — above it, not
 * merely off screen in some direction.
 *
 * The khata's You gave / You got pair lives in the page header, and on a phone
 * a long timeline scrolls it away; the page docks a copy at the bottom once it
 * has (see `PartyDetailPageContent`). "Above the top edge" is the test rather
 * than "not intersecting", so an element that simply has not been reached yet
 * — below the fold on a short screen — never counts as scrolled past.
 *
 * Returns a callback ref and the answer. A callback ref, not an object ref,
 * because the element can arrive late (the pair renders once the party has
 * loaded) and an effect keyed on `ref.current` would never see it arrive.
 * Without `IntersectionObserver` (jsdom, an old WebView) the answer is always
 * `false`: the header pair is still there, so nothing is lost.
 */
export function useScrolledPast<E extends Element = HTMLElement>(): readonly [
  (node: E | null) => void,
  boolean,
] {
  const [node, setNode] = useState<E | null>(null);
  const [past, setPast] = useState(false);

  useEffect(() => {
    if (!node || typeof IntersectionObserver !== 'function') return undefined;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      const top = entry.rootBounds?.top ?? 0;
      setPast(!entry.isIntersecting && entry.boundingClientRect.bottom <= top);
    });
    observer.observe(node);
    // An observer reports once as soon as it starts observing, so a new
    // node's answer replaces the old one's on the next frame.
    return () => observer.disconnect();
  }, [node]);

  return [setNode, node !== null && past] as const;
}
