'use client';

import { useEffect, useRef } from 'react';

import { useSearchParams } from 'next/navigation';

/**
 * `?add=1` — a link from another screen that means "open this page's add form"
 * (the Shop home's Record payment and Add expense, WP-06; the Library home's
 * New admission reads the same parameter its own way). A link that only lands
 * on the list would be a link pretending to be an action.
 *
 * Read ONCE, on the first render that can act on it: the list's URL filters
 * rewrite the address after mount and drop parameters they do not own, and a
 * form that reopened on every rewrite would be worse than none. `enabled` is
 * the page's own write permission, so a reader who may not add is shown the
 * list and nothing else.
 */
export function useOpenOnAddQuery(open: () => void, enabled: boolean): void {
  const asked = useSearchParams().get('add') === '1';
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !asked || !enabled) return;
    done.current = true;
    open();
  }, [asked, enabled, open]);
}
