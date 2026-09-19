import { createAction } from '@reduxjs/toolkit';

/**
 * Part 19 §19.6.5 / §19.7.4 — the one teardown signal.
 *
 * Dispatched on logout and on tenant switch. Every feature slice handles it in
 * `extraReducers` with `() => initialState`; no slice imports another slice's
 * reducer to do it (R-RX-8). It is dispatched BEFORE the navigation, so the
 * login screen never renders with the previous tenant's data behind it.
 */
export const resetAllFeatureState = createAction('app/resetAllFeatureState');
