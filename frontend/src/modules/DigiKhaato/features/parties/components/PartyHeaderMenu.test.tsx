import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { TranslateFn } from 'src/hooks/useTranslation';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import { PartyHeaderMenu } from './PartyHeaderMenu';

/**
 * PUR-02 FR-4 — the khata's ⋯ carries "Pay supplier" for a supplier: money OUT against
 * their purchase bills, beside "Record payment" (money in). What this protects: the item
 * is drawn only when the page passes the handler (the page decides by `isSupplier` and
 * the payments write codename), and tapping it runs that handler — not the money-in one.
 */
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
}));

const t = ((key: string) =>
  ({
    'payments.record.title': 'Record payment',
    'payments.record.titleOut': 'Pay supplier',
    'parties.detail.more': 'More',
    'parties.detail.moreActions': 'More actions',
    'common.action.close': 'Close',
  })[key] ?? key) as unknown as TranslateFn;

it('offers Pay supplier only when asked to, and runs the money-out handler', async () => {
  const pay = jest.fn();
  const receive = jest.fn();
  const { unmount } = renderWithProviders(
    <PartyHeaderMenu t={t} onRecordPayment={receive} onPaySupplier={pay} />
  );
  await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Pay supplier' }));
  expect(pay).toHaveBeenCalledTimes(1);
  expect(receive).not.toHaveBeenCalled();
  unmount();

  renderWithProviders(<PartyHeaderMenu t={t} onRecordPayment={receive} />);
  await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
  expect(await screen.findByRole('button', { name: 'Record payment' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Pay supplier' })).not.toBeInTheDocument();
});
