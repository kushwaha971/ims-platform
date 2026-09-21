import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { DEFAULT_LOCALE } from 'src/constants';
import type { RootState } from 'src/redux/store';
import type { Locale } from 'src/types/domain.types';

/**
 * Part 19 §19.11.2 — the active locale, persisted in a readable `ub_locale`
 * cookie so the server-rendered `<html lang>` matches on the next load.
 *
 * This docstring used to claim the locale was persisted "in localStorage AND in
 * a readable cookie". The localStorage half never existed, and the cookie half
 * was **write-only from the client's side**: `LanguagePicker` wrote it, the
 * server read it for `<html lang>`, and nothing ever read it back into this
 * slice. So after a refresh the document said `lang="hi"` while every string on
 * the page rendered in English — the two halves of one preference disagreeing on
 * every page load. `localeRestored` is the missing read; see
 * `PreferencesBootstrap`.
 *
 * The transport layer reads `current` for `Accept-Language`, so server messages
 * match the UI — which is a second reason the restore matters: without it, a
 * merchant working in Hindi got English validation errors from the server.
 */
export interface LocaleState {
  current: Locale;
  /** True when the user chose a locale; a local override beats /auth/me. */
  overridden: boolean;
}

const initialState: LocaleState = { current: DEFAULT_LOCALE, overridden: false };

const localeSlice = createSlice({
  name: 'locale',
  initialState,
  reducers: {
    localeChanged(state, action: PayloadAction<Locale>) {
      state.current = action.payload;
      state.overridden = true;
    },
    /**
     * A choice made on an earlier visit, read back from the cookie at startup.
     *
     * It sets `overridden` because it was an override: only `localeChanged`
     * writes that cookie, and only the picker dispatches `localeChanged`. So a
     * value in the cookie is always a deliberate choice, and it must keep
     * outranking `/auth/me` across a refresh exactly as it did before one.
     */
    localeRestored(state, action: PayloadAction<Locale>) {
      state.current = action.payload;
      state.overridden = true;
    },
    /** From `GET /auth/me`; a local override wins until the user clears it. */
    localeFromProfile(state, action: PayloadAction<Locale>) {
      if (!state.overridden) state.current = action.payload;
    },
    localeOverrideCleared(state) {
      state.overridden = false;
    },
  },
});

export const { localeChanged, localeRestored, localeFromProfile, localeOverrideCleared } =
  localeSlice.actions;

export default localeSlice.reducer;

export const selectLocale = (state: RootState): Locale => state.locale.current;
