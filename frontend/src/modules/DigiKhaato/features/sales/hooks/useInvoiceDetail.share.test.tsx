import type { ReactNode } from 'react';

import { act, renderHook, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { Provider } from 'react-redux';

import { resetAllFeatureState } from 'src/redux/actions';
import { store } from 'src/redux/store';
import { ALL_MESSAGES } from 'src/tests/allMessages';

import { makeDocument } from '../testing/salesFixtures';

import { useInvoiceDetail } from './useInvoiceDetail';

/**
 * UAT D1 — every "Copy link" / "Share on WhatsApp" used to mint a new token and
 * silently kill the link the customer already had. The server now hands back
 * the live link, so rotating it is an explicit "Reset link": revoke FIRST, then
 * share again, then copy the NEW url and say the old one stopped working.
 */
jest.mock('../api/salesService', () => ({
  ...jest.requireActual('../api/salesService'),
  getInvoice: jest.fn(),
  getUpiIntent: jest.fn(async () => null),
  createShareLink: jest.fn(),
  revokeShareLink: jest.fn(),
}));
jest.mock('../../branding/api/brandingService', () => ({
  fetchBranding: jest.fn(async () => ({
    logoUrl: null,
    signatureUrl: null,
    docHeader: '',
    docFooter: '',
    appName: 'Shop',
    primaryHex: null,
  })),
}));

const sales = jest.requireMock('../api/salesService') as {
  getInvoice: jest.Mock;
  createShareLink: jest.Mock;
  revokeShareLink: jest.Mock;
};

const wrapper = ({ children }: { readonly children: ReactNode }) => (
  <Provider store={store}>
    <IntlProvider locale="en-IN" defaultLocale="en" messages={ALL_MESSAGES.en}>
      {children}
    </IntlProvider>
  </Provider>
);

beforeEach(() => {
  store.dispatch(resetAllFeatureState());
  jest.clearAllMocks();
  sales.getInvoice.mockResolvedValue({
    document: makeDocument(),
    warnings: [],
    rule46: null,
    partyBalance: null,
    ledgerEntryId: null,
  });
  Object.assign(navigator, { clipboard: { writeText: jest.fn(async () => undefined) } });
});

it('UAT D1: Reset link revokes the live link before sharing, and copies the new url', async () => {
  const order: string[] = [];
  sales.revokeShareLink.mockImplementation(async () => {
    order.push('revoke');
    return true;
  });
  sales.createShareLink.mockImplementation(async () => {
    order.push('create');
    return { url: 'https://x/d/new', expiresAt: '2026-10-28T00:00:00Z' };
  });
  const { result } = renderHook(() => useInvoiceDetail('d1', false), { wrapper });
  await waitFor(() => expect(result.current.document?.id).toBe('d1'));

  await act(async () => {
    await result.current.resetLink();
  });

  expect(order).toEqual(['revoke', 'create']);
  expect(sales.revokeShareLink).toHaveBeenCalledWith('d1', 'invoice');
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://x/d/new');
  expect(store.getState().snackbar.id).toBe('sales.share.resetDone');
  expect(result.current.shareLink?.url).toBe('https://x/d/new');
});

it('UAT D1: a failed revoke never mints a second link', async () => {
  sales.revokeShareLink.mockRejectedValue(new Error('403'));
  const { result } = renderHook(() => useInvoiceDetail('d1', false), { wrapper });
  await waitFor(() => expect(result.current.document?.id).toBe('d1'));

  await act(async () => {
    await result.current.resetLink();
  });

  expect(sales.createShareLink).not.toHaveBeenCalled();
  expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
});
