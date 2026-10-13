'use client';

import { useSyncExternalStore } from 'react';

type OpenFeedback = () => void;
let openFeedback: OpenFeedback | null = null;
const listeners = new Set<() => void>();
const notify = (): void => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Only a running survey on an allowed page makes the account action available. */
export const registerFeedback = (open: OpenFeedback): (() => void) => {
  openFeedback = open;
  notify();
  return () => {
    if (openFeedback !== open) return;
    openFeedback = null;
    notify();
  };
};

/** QA B16: navigation reads availability without importing the PostHog SDK. */
export const useFeedback = (): OpenFeedback | null =>
  useSyncExternalStore(
    subscribe,
    () => openFeedback,
    () => null
  );
