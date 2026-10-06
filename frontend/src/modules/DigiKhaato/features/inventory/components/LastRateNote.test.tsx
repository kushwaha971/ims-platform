import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders } from 'src/tests/renderWithProviders';

import { clearLastRateCache, LastRateNote } from './LastRateNote';

/**
 * Price memory (Shop gap §1.5). These pin that the note names the party, the
 * rate and the day; that "Use this rate" hands the remembered rate back with
 * its GST basis; that the button goes once the line already carries it; that
 * a party with no history shows nothing; and that one answer serves every
 * re-render instead of a request per keystroke.
 */
jest.mock('../api/itemTradeService', () => ({
  ...jest.requireActual('../api/itemTradeService'),
  getLastRate: jest.fn(),
}));
const service = jest.requireMock('../api/itemTradeService') as { getLastRate: jest.Mock };

const last = {
  rate: '440.00',
  taxInclusive: true,
  unitCode: 'BAG',
  qty: '2.000',
  document: { id: 'd1', number: 'INV/1', date: '2026-10-02' },
};

beforeEach(() => {
  clearLastRateCache();
  service.getLastRate.mockReset();
});

test('offers the rate this customer paid last time, and hands it back', async () => {
  service.getLastRate.mockResolvedValue(last);
  const onUse = jest.fn();
  const { rerender } = renderWithProviders(
    <LastRateNote
      itemId="i1"
      partyId="p1"
      partyName="Ramesh"
      side="sales"
      current="450.00"
      currentInclusive={false}
      onUse={onUse}
    />
  );
  expect(
    await screen.findByText(/Last sold to Ramesh at ₹440.00 on 02\/10\/2026/)
  ).toHaveTextContent('(incl. GST)');
  await userEvent.click(screen.getByRole('button', { name: 'Use this rate' }));
  expect(onUse).toHaveBeenCalledWith(last);

  rerender(
    <LastRateNote
      itemId="i1"
      partyId="p1"
      partyName="Ramesh"
      side="sales"
      current="440"
      currentInclusive
      onUse={onUse}
    />
  );
  expect(screen.queryByRole('button', { name: 'Use this rate' })).toBeNull();
  expect(service.getLastRate).toHaveBeenCalledTimes(1);
});

test('a supplier with no history shows nothing', async () => {
  service.getLastRate.mockResolvedValue(null);
  renderWithProviders(
    <LastRateNote
      itemId="i1"
      partyId="p9"
      partyName="New"
      side="purchases"
      current=""
      onUse={jest.fn()}
    />
  );
  await Promise.resolve();
  expect(screen.queryByTestId('last-rate-note')).toBeNull();
  expect(service.getLastRate).toHaveBeenCalledWith('i1', 'p9', 'purchases');
});
