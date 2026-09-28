import type { ReactNode } from 'react';

import { act, renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';

import { useShareFeedback } from 'src/hooks/useShareFeedback';
import { hideSnackbar } from 'src/redux/slice/snackbarSlice';
import { store } from 'src/redux/store';

/**
 * What the product SAYS after a share. DEC-012 / NTF-03 BR-1: it prepared a
 * message and the merchant sends it, so every word here is about an app being
 * opened or text being copied — never about something being sent.
 */
const wrapper = ({ children }: { readonly children: ReactNode }) => (
  <Provider store={store}>{children}</Provider>
);

beforeEach(() => {
  store.dispatch(hideSnackbar());
});

describe('useShareFeedback', () => {
  it.each([
    ['whatsapp', 'share.opened.whatsapp', 'info'],
    ['sms', 'share.opened.sms', 'info'],
    ['copy', 'share.copied', 'success'],
  ] as const)('reports %s neutrally as %s', (channel, id, severity) => {
    /* Prevents: a green "done" tick for WhatsApp or SMS, which reads as
       delivered when the merchant has not yet pressed send. */
    const { result } = renderHook(() => useShareFeedback(), { wrapper });
    act(() => result.current.onShared(channel));
    const state = store.getState().snackbar;
    expect(state.id).toBe(id);
    expect(state.snackbarSeverity).toBe(severity);
  });

  it('stays quiet after the platform sheet, which confirms for itself', () => {
    /* Prevents: a second, contradicting confirmation on top of the OS's own. */
    const { result } = renderHook(() => useShareFeedback(), { wrapper });
    act(() => result.current.onShared('native'));
    expect(store.getState().snackbar.snackbarOpen).toBe(false);
  });

  it.each([
    ['copy', 'share.copyFailed'],
    ['native', 'share.failed'],
  ] as const)('raises a %s failure on the global snackbar as %s', (channel, id) => {
    /* Prevents: a refused clipboard or a broken share sheet failing silently
       — errors go through the one global snackbar, never a local message. */
    const { result } = renderHook(() => useShareFeedback(), { wrapper });
    act(() => result.current.onFailed(channel));
    const state = store.getState().snackbar;
    expect(state.id).toBe(id);
    expect(state.snackbarSeverity).toBe('error');
  });
});
