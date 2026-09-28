'use client';

import { useEffect, useSyncExternalStore } from 'react';

import {
  catalogueVersion,
  ensureLocaleLoaded,
  liveMessages,
  subscribeCatalogues,
  type Messages,
} from 'src/i18n/catalogueRegistry';
import 'src/i18n/catalogues/shell';
import type { Locale } from 'src/types/domain.types';

/**
 * Part 19 §19.11.2 — the shell catalogue (`locales/en.json`) is imported
 * statically, through `src/i18n/catalogues/shell`: it is the fallback and must
 * always be present. Everything else a screen renders arrives with that
 * screen's chunk (W4-P, see `src/i18n/catalogueRegistry.ts`), and every Hindi
 * half — the shell's included — is fetched on demand, so switching to Hindi
 * costs one small chunk per catalogue in use, not a reload.
 *
 * The map returned is the registry's LIVE map for the locale: a catalogue that
 * registers later writes into it, so a screen whose chunk has just loaded finds
 * its words without this provider re-rendering first. The subscription is for
 * the other case — a Hindi half landing, which replaces the map so the text
 * already on screen re-renders.
 */
export const useMessages = (locale: Locale): Messages => {
  const version = useSyncExternalStore(subscribeCatalogues, catalogueVersion, catalogueVersion);

  useEffect(() => {
    ensureLocaleLoaded(locale);
  }, [locale, version]);

  // Until a Hindi half lands its English strings stand in — the documented
  // fallback, never a blank screen or a raw id.
  return liveMessages(locale);
};
