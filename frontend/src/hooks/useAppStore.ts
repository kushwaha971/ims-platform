'use client';

import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux';

import type { AppDispatch, RootState } from 'src/redux/store';

/**
 * The two typed bindings every hook uses, so no feature repeats
 * `useDispatch<AppDispatch>()` and no component reaches for an untyped store.
 */
export const useAppDispatch = (): AppDispatch => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
