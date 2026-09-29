import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';

import { resetAllFeatureState } from 'src/redux/actions';
import { store } from 'src/redux/store';

import { usePrintBranding } from './usePrintBranding';

/**
 * R33 / A16 — the letterhead every printed document reads, now one copy in
 * `src/print` instead of a field in two feature slices fed by a sales thunk.
 * What this protects: the hook fetching the tenant's branding when a print
 * screen mounts and handing back the six fields a sheet prints; aborting on
 * unmount (a detail page left before the read lands must not write into the
 * next page's state); and a sign-in to another business clearing it, so one
 * shop's logo is never printed on another shop's bill.
 */
jest.mock('modules/DigiKhaato/features/branding/api/brandingService', () => ({
  fetchBranding: jest.fn(async () => ({
    logoUrl: 'https://cdn.test/logo.png',
    signatureUrl: null,
    docHeader: 'GSTIN 27ABCDE1234F1Z5',
    docFooter: 'Thank you',
    appName: 'Kumar Stores',
    primaryHex: '#123456',
    extraFieldNotPrinted: true,
  })),
}));

const wrapper = ({ children }: { children: React.ReactNode }): React.JSX.Element => (
  <Provider store={store}>{children}</Provider>
);

beforeEach(() => store.dispatch(resetAllFeatureState()));

it('reads the letterhead once a print screen mounts', async () => {
  const { result } = renderHook(() => usePrintBranding(), { wrapper });
  expect(result.current).toBeNull();
  await waitFor(() => expect(result.current).not.toBeNull());
  expect(result.current).toEqual({
    logoUrl: 'https://cdn.test/logo.png',
    signatureUrl: null,
    docHeader: 'GSTIN 27ABCDE1234F1Z5',
    docFooter: 'Thank you',
    appName: 'Kumar Stores',
    primaryHex: '#123456',
  });
});

it('is cleared when the feature state is reset (a sign-in to another business)', async () => {
  const { result } = renderHook(() => usePrintBranding(), { wrapper });
  await waitFor(() => expect(result.current).not.toBeNull());
  act(() => {
    store.dispatch(resetAllFeatureState());
  });
  expect(result.current).toBeNull();
});

it('aborts its read when the screen unmounts before it lands', () => {
  const spy = jest.spyOn(store, 'dispatch');
  const { unmount } = renderHook(() => usePrintBranding(), { wrapper });
  const request = spy.mock.results[0]?.value as { abort: jest.Mock } | undefined;
  expect(typeof request?.abort).toBe('function');
  const abort = jest.spyOn(request as { abort: () => void }, 'abort');
  unmount();
  expect(abort).toHaveBeenCalled();
  spy.mockRestore();
});
