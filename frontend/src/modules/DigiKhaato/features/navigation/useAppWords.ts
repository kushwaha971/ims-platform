'use client';

import { useCallback, useMemo } from 'react';

import { useTranslation, type TranslateFn } from 'src/hooks/useTranslation';
import type { LedgerBook } from 'src/types/domain.types';

import { manifestFor } from 'modules/appManifests';

import { useNavigation } from './useNavigation';

/**
 * docs/platform/14 step 6 — words per app on shared pages.
 *
 * A khata, a statement or a receipt is one page whichever app opened it, and
 * it used to speak the Shop's language to everyone: a reading room's student
 * was badged "Customer", and a lender's borrower was "this party". `w(id)` is
 * `t(id)` with the open app's override applied (`AppManifest.words`), so a
 * shared page names the app's people the way the app does, and an app that
 * declares no word gets the shared one. `peopleHref` is the app's own list of
 * people, for "back to the list".
 */
export interface UseAppWordsResult {
  readonly w: TranslateFn;
  readonly peopleHref: string | undefined;
  /** DEC-019 — the book the shared person page reads while this app is open. */
  readonly book: LedgerBook;
  /** The open app's code, or null before the session says which. */
  readonly app: string | null;
}

export function useAppWords(): UseAppWordsResult {
  const { t } = useTranslation();
  const { app } = useNavigation();
  const manifest = useMemo(() => (app ? manifestFor(app) : undefined), [app]);
  const words = manifest?.words;
  const w = useCallback<TranslateFn>((id, values) => t(words?.[id] ?? id, values), [t, words]);
  return { w, peopleHref: manifest?.peopleHref, book: manifest?.book ?? 'main', app: app ?? null };
}
