'use client';

import { useEffect, useState } from 'react';

/**
 * R-P-7 — debounce user input; the raw value stays local and only the settled
 * one is committed to the slice, so a keystroke is not a request.
 */
export function useDebounce<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState<T>(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}
