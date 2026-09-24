'use client';

import { useEffect, useRef } from 'react';

/**
 * INV-02 FR-6 / BR-5 — a USB or Bluetooth barcode scanner is a KEYBOARD: it
 * types the code and presses Enter. This listens on the document for such a
 * burst — at least `minLength` characters, each within `maxGapMs` of the last,
 * ended by Enter or Tab — while focus is NOT in a text field (a scan into a
 * field is that field's business: the search box treats it as typed text plus
 * Enter, FR-7). A person does not type four characters 50 ms apart, so a burst
 * is a scan and slow typing is ignored.
 *
 * Shared (`src/hooks`) because the item list, the adjustment drawer and next
 * sprint's invoice editor all listen for scans.
 */
export interface ScannerOptions {
  readonly enabled?: boolean;
  readonly minLength?: number;
  readonly maxGapMs?: number;
}

const isTextTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
};

export function useScannerListener(
  onScan: (code: string) => void,
  { enabled = true, minLength = 4, maxGapMs = 50 }: ScannerOptions = {}
): void {
  const handler = useRef(onScan);
  useEffect(() => {
    handler.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return undefined;
    let buffer = '';
    let last = 0;

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTextTarget(event.target)) {
        buffer = '';
        return;
      }
      const now = event.timeStamp || Date.now();
      if (event.key === 'Enter' || event.key === 'Tab') {
        if (buffer.length >= minLength && now - last <= maxGapMs) {
          event.preventDefault();
          handler.current(buffer);
        }
        buffer = '';
        return;
      }
      if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
      buffer = now - last > maxGapMs ? event.key : buffer + event.key;
      last = now;
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [enabled, minLength, maxGapMs]);
}
