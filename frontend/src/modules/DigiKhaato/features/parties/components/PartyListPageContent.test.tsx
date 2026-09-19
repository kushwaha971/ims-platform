import { screen, waitFor } from '@testing-library/react';

import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import hi from 'locales/hi.json';

import { resetPartyList } from '../redux/partyListSlice';

import { PartyListPageContent } from './PartyListPageContent';

/**
 * The walking skeleton, end to end inside the client (Part 32 S0-71 / S0-73):
 * route content → hook → thunk → service → axios, with the service stubbed at
 * the module boundary (§19.13.3). It asserts the three states the sprint's exit
 * criterion names — skeleton, first-use empty state, error with the request id —
 * and the Hindi rendering of the same screen.
 */
jest.mock('../api/partyService');

const partyService = jest.requireMock('../api/partyService') as {
  listParties: jest.Mock;
};

const EMPTY = {
  rows: [],
  meta: { page: 1, pageSize: 25, total: 0, totalPages: 0 },
};

describe('PartyListPageContent', () => {
  beforeEach(() => {
    store.dispatch(resetPartyList());
    jest.clearAllMocks();
  });

  it('paints the skeleton first, then the first-use empty state', async () => {
    partyService.listParties.mockResolvedValue(EMPTY);

    renderWithProviders(<PartyListPageContent />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(await screen.findByText('No customers yet')).toBeInTheDocument();
    expect(
      screen.getByText('Add the first person you give udhaar to, and their khata starts here.')
    ).toBeInTheDocument();
    expect(partyService.listParties).toHaveBeenCalledTimes(1);
  });

  it('renders the same empty state in Hindi', async () => {
    partyService.listParties.mockResolvedValue(EMPTY);

    renderWithProviders(<PartyListPageContent />, {
      locale: 'hi',
      messages: hi as Record<string, string>,
    });

    expect(await screen.findByText('अभी कोई ग्राहक नहीं है')).toBeInTheDocument();
  });

  it('renders the rows it is given, with the balance label the view-model chose', async () => {
    partyService.listParties.mockResolvedValue({
      rows: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Ramesh Traders',
          displayCode: 'C-001',
          mobile: '+919876543210',
          isCustomer: true,
          isSupplier: false,
          balance: '2800.00',
          status: 'active',
          lastActivityAt: '2026-09-18T10:00:00Z',
        },
      ],
      meta: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
    });

    renderWithProviders(<PartyListPageContent />);

    expect(await screen.findByText('Ramesh Traders')).toBeInTheDocument();
    // A positive balance is money the merchant will get — receivable, unsigned.
    expect(screen.getByText('You will get, ₹2,800.00')).toBeInTheDocument();
  });

  it('shows the error state with the request id when the request fails', async () => {
    partyService.listParties.mockRejectedValue({
      code: 'server_error',
      message: 'Something went wrong.',
      details: {},
      requestId: 'req_7f3a91',
      status: 500,
      warnings: [],
    });

    renderWithProviders(<PartyListPageContent />);

    await waitFor(() =>
      expect(screen.getByText('We could not load your customers')).toBeInTheDocument()
    );
    // R-E-4 — the only thing that connects a screenshot to a backend log line.
    expect(screen.getByTestId('request-id')).toHaveTextContent('req_7f3a91');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
