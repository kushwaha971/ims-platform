'use client';

import { useCallback, useEffect, useRef } from 'react';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { localeFromProfile } from 'src/redux/slice/localeSlice';
import type { Locale } from 'src/types/domain.types';

import { selectPublicDocument, type PublicDocumentState } from '../redux/publicDocumentSlice';
import { fetchPublicDocument } from '../redux/publicDocumentThunk';

/**
 * The language a customer's page opens in when they have not chosen one:
 * Hindi if the SHOP writes in Hindi or the customer's phone asks for it
 * (`navigator.languages` is the browser's Accept-Language), else English.
 * A choice made with the page's own switch is a cookie override and outranks
 * both — `localeFromProfile` only applies while nothing has been chosen.
 */
export const preferredPublicLocale = (
  shopLocale: Locale,
  browserLanguages: readonly string[]
): Locale =>
  shopLocale === 'hi' || browserLanguages.some((tag) => tag.toLowerCase().startsWith('hi'))
    ? 'hi'
    : 'en';

const browserLanguages = (): readonly string[] =>
  typeof navigator === 'undefined'
    ? []
    : navigator.languages?.length
      ? navigator.languages
      : [navigator.language ?? ''];

export interface UsePublicDocumentResult extends PublicDocumentState {
  readonly retry: () => void;
  /** FR-7 — `window.print()` once the fonts are in, titled by the number. */
  readonly print: () => void;
}

/** SAL-03 FR-5 — the customer page's data, language and print. */
export const usePublicDocument = (token: string): UsePublicDocumentResult => {
  const dispatch = useAppDispatch();
  const state = useAppSelector(selectPublicDocument);
  const request = useRef<{ abort: () => void } | null>(null);

  const load = useCallback(() => {
    request.current?.abort();
    request.current = dispatch(fetchPublicDocument(token));
  }, [dispatch, token]);

  useEffect(() => {
    load();
    return () => request.current?.abort();
  }, [load]);

  const data = state.token === token ? state.data : null;
  const shopLocale = data?.locale ?? null;
  const number = data?.document.number ?? null;

  useEffect(() => {
    if (shopLocale)
      dispatch(localeFromProfile(preferredPublicLocale(shopLocale, browserLanguages())));
  }, [dispatch, shopLocale]);

  // The filename "Save as PDF" proposes is the page title (SAL-03 FR-7).
  useEffect(() => {
    if (number) document.title = number;
  }, [number]);

  const print = useCallback(() => {
    const fonts = typeof document !== 'undefined' ? document.fonts?.ready : undefined;
    void Promise.resolve(fonts).then(() => window.print());
  }, []);

  return { ...state, data, retry: load, print };
};
