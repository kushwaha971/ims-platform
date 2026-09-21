import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { RootState } from 'src/redux/store';
import type { ThemeMode } from 'src/types/domain.types';

/**
 * Part 19 §19.8.4 — light is the default because the product is used in bright
 * shops on cheap screens. Dark is optional and secondary.
 *
 * That was always the written intent and the code did the opposite. The slice
 * carried a `systemThemeObserved` action that copied `prefers-color-scheme` into
 * `mode` whenever `explicit` was false — and `explicit` could only become true
 * via `themeChanged`, **which nothing in the codebase ever dispatched.** There
 * was no toggle, no settings control, nothing. So `explicit` was permanently
 * false, the operating system was permanently authoritative, and a merchant on a
 * Mac set to Dark got a dark khata whatever the specification said.
 * `ThemeProvider` then wrote that OS-derived value into a year-long cookie, so it
 * outlived the preference that produced it.
 *
 * `systemThemeObserved` is therefore gone rather than fixed. There is no version
 * of "the OS decides unless the user overrides" that is compatible with "light is
 * the default" — the first sentence contradicts the second, and the second is the
 * product decision. The OS is not consulted at all now; a merchant who wants dark
 * asks for it, and that choice persists.
 */
export interface ThemeState {
  mode: ThemeMode;
  /** True once the user has chosen. Only a choice is persisted. */
  explicit: boolean;
}

const initialState: ThemeState = { mode: 'light', explicit: false };

const themeSlice = createSlice({
  name: 'theme',
  initialState,
  reducers: {
    /** The user picked one. This is the only thing that writes the cookie. */
    themeChanged(state, action: PayloadAction<ThemeMode>) {
      state.mode = action.payload;
      state.explicit = true;
    },
    /**
     * A choice made on an earlier visit, read back from the cookie at startup.
     *
     * It sets `explicit` because it *was* explicit — the distinction the old code
     * lost is between a preference the merchant expressed and one the machine
     * inferred. Only the former is ever stored, so anything found in the cookie
     * is the former.
     */
    themeRestored(state, action: PayloadAction<ThemeMode>) {
      state.mode = action.payload;
      state.explicit = true;
    },
  },
});

export const { themeChanged, themeRestored } = themeSlice.actions;

export default themeSlice.reducer;

export const selectThemeMode = (state: RootState): ThemeMode => state.theme.mode;
export const selectThemeIsExplicit = (state: RootState): boolean => state.theme.explicit;
