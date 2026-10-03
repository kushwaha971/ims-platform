'use client';

import { useEffect, useState } from 'react';

import { useDebounce } from 'src/hooks/useDebounce';

/**
 * A list's search box: what the merchant types stays local, and only the
 * debounced value is committed to the list's filters — so a keystroke is not a
 * request (§19.3.1). The rule is PTY-02/PTY-05's (`usePartyList`), written
 * once here for the library's lists rather than copied into each.
 *
 *  - Commit only once the debounce has CAUGHT UP with the box, or a link
 *    carrying `?q=…` is overwritten a moment later by the stale empty
 *    debounced value (the list filters for one frame, then unfilters).
 *  - A `q` that arrives from elsewhere (the URL seed, "Clear filters") is put
 *    into the box DURING RENDER, not in an effect: an effect is
 *    `react-hooks/set-state-in-effect` and would paint one stale frame.
 */
export const useCommittedSearch = (
  committed: string,
  commit: (q: string) => void,
  delayMs: number
): readonly [string, (value: string) => void] => {
  const [input, setInput] = useState(committed);
  const debounced = useDebounce(input, delayMs);

  useEffect(() => {
    if (debounced !== input) return;
    const next = debounced.trim();
    if (next !== committed) commit(next);
  }, [debounced, input, committed, commit]);

  const [lastSeen, setLastSeen] = useState(committed);
  if (committed !== lastSeen) {
    setLastSeen(committed);
    if (committed !== input.trim()) setInput(committed);
  }

  return [input, setInput];
};
