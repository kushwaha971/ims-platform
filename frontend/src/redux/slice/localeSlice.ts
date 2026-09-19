import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { DEFAULT_LOCALE } from 'src/constants';
import type { RootState } from 'src/redux/store';
import type { Locale } from 'src/types/domain.types';

/**
 * Part 19 §19.11.2 — the active locale. It is persisted in localStorage AND in
 * a readable `ub_locale` cookie, so the server-rendered `<html lang>` matches on
 * the next load and there is no flash of English. The transport layer reads
 * `current` for `Accept-Language`, so server messages match the UI.
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
    /** From `GET /auth/me`; a local override wins until the user clears it. */
    localeFromProfile(state, action: PayloadAction<Locale>) {
      if (!state.overridden) state.current = action.payload;
    },
    localeOverrideCleared(state) {
      state.overridden = false;
    },
  },
});

export const { localeChanged, localeFromProfile, localeOverrideCleared } = localeSlice.actions;

export default localeSlice.reducer;

export const selectLocale = (state: RootState): Locale => state.locale.current;
