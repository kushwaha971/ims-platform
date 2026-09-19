import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { RootState } from 'src/redux/store';
import type { ThemeMode } from 'src/types/domain.types';

/**
 * Part 19 §19.8.4 — dark mode is optional and secondary. Light is the default
 * because the product is used in bright shops on cheap screens. The mode is
 * written to `data-theme` on <html> by ThemeProvider; the tokens change
 * underneath, so almost no component needs a `dark:` variant.
 */
export interface ThemeState {
  mode: ThemeMode;
  /** False until the user picks one; until then `prefers-color-scheme` wins. */
  explicit: boolean;
}

const initialState: ThemeState = { mode: 'light', explicit: false };

const themeSlice = createSlice({
  name: 'theme',
  initialState,
  reducers: {
    themeChanged(state, action: PayloadAction<ThemeMode>) {
      state.mode = action.payload;
      state.explicit = true;
    },
    systemThemeObserved(state, action: PayloadAction<ThemeMode>) {
      if (!state.explicit) state.mode = action.payload;
    },
  },
});

export const { themeChanged, systemThemeObserved } = themeSlice.actions;

export default themeSlice.reducer;

export const selectThemeMode = (state: RootState): ThemeMode => state.theme.mode;
