'use client';

import { useCallback, useState } from 'react';

import { newRequestId } from 'src/utils/requestId';

export interface UseIdempotencyKeyResult {
  /** Stable across re-renders; the SAME key on every retry (R-F-10, BR-8). */
  readonly key: string;
  /** Call only when the user starts a genuinely new logical write. */
  readonly rotate: () => void;
}

/**
 * Part 19 §19.1.3 note 1 — the key is minted ONCE, in the hook, before the
 * first attempt, and reused on every retry of the same logical action. A
 * remount must not mint a new one, which is why a write with slice state also
 * stores it in the slice.
 *
 * State rather than a ref: a ref read during render is a concurrent-rendering
 * hazard (`react-hooks/refs`), and rotating the key must repaint the caller.
 */
export const useIdempotencyKey = (): UseIdempotencyKeyResult => {
  const [key, setKey] = useState<string>(() => newRequestId());

  const rotate = useCallback(() => {
    setKey(newRequestId());
  }, []);

  return { key, rotate };
};
