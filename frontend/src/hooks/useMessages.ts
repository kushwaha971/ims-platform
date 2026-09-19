'use client';

import { useEffect, useState } from 'react';

import type { Locale } from 'src/types/domain.types';

import en from 'locales/en.json';

/**
 * Part 19 §19.11.2 — `en.json` is imported statically (it is the fallback and
 * must always be present); `hi.json` is imported on demand and cached in a
 * module-level map, so switching to Hindi costs one small chunk, not a reload.
 *
 * The cache is read during RENDER and the effect only bumps a counter once the
 * chunk has landed: calling `setState` synchronously inside an effect is a
 * cascading render, and `react-hooks/set-state-in-effect` fails it.
 */
type Messages = Record<string, string>;

const CACHE = new Map<Locale, Messages>([['en', en as Messages]]);

export const useMessages = (locale: Locale): Messages => {
  const [, setLoadedCount] = useState(0);

  useEffect(() => {
    if (CACHE.has(locale)) return undefined;
    let cancelled = false;
    void import('locales/hi.json').then((module) => {
      CACHE.set(locale, module.default as Messages);
      if (!cancelled) setLoadedCount((count) => count + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  // Until the chunk lands, English is rendered — which is the documented
  // fallback, not a blank screen.
  return CACHE.get(locale) ?? (en as Messages);
};
