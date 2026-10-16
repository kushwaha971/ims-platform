import { fireEvent, screen } from '@testing-library/react';

import { renderWithProviders } from 'src/tests/renderWithProviders';

import { FinishDialog } from './CounterPrompts';

import type { CounterMember } from '../types/counter.types';

/**
 * WP-04 M-10 — the issue slip after the counter. It used to be a fixed
 * WhatsApp link: the librarian could not see the words, let alone fix a
 * wrong due date or add a line, before WhatsApp opened. The slip now sits in
 * the share sheet's editable box, the link carries exactly what the box holds,
 * and a blank slip offers no link.
 */
jest.mock('../api/libraryCirculationService', () => ({
  ...jest.requireActual('../api/libraryCirculationService'),
  issueSlip: jest.fn(),
}));
const service = jest.requireMock('../api/libraryCirculationService') as { issueSlip: jest.Mock };

const SLIP = 'Asha, you have borrowed:\n1. Wings of Fire (A-12), back by 30 Oct.\n— Vidya Library';

const member = {
  membershipId: 'm1',
  partyId: 'p1',
  name: 'Asha Verma',
  mobile: '+919812345678',
  loansOpen: 1,
  type: { maxCopies: 3 },
  loans: [{ id: 'l1' }],
} as unknown as CounterMember;

beforeEach(() => {
  service.issueSlip.mockResolvedValue({
    text: SLIP,
    waUrl: 'https://wa.me/919812345678?text=fixed',
    hasMobile: true,
  });
});

it('shows the slip in an editable box and links WhatsApp with exactly its words', async () => {
  renderWithProviders(<FinishDialog member={member} onClose={jest.fn()} onDone={jest.fn()} />);
  const box = await screen.findByRole('textbox', { name: 'Message' });
  expect(box).toHaveValue(SLIP);
  const link = () => screen.getByRole('link', { name: 'Send the slip on WhatsApp' });
  expect(new URL(link().getAttribute('href') ?? '').searchParams.get('text')).toBe(SLIP);

  fireEvent.change(box, { target: { value: 'Asha ji, kitaab 2 Nov tak laut dena 🙏' } });
  const href = link().getAttribute('href') ?? '';
  expect(href.startsWith('https://wa.me/919812345678?text=')).toBe(true);
  expect(new URL(href).searchParams.get('text')).toBe('Asha ji, kitaab 2 Nov tak laut dena 🙏');
});

it('offers no link for a blank slip, says why, and brings the original back', async () => {
  renderWithProviders(<FinishDialog member={member} onClose={jest.fn()} onDone={jest.fn()} />);
  const box = await screen.findByRole('textbox', { name: 'Message' });
  fireEvent.change(box, { target: { value: ' ' } });
  expect(screen.getByRole('alert')).toHaveTextContent('Write a message before sending.');
  expect(screen.queryByRole('link', { name: 'Send the slip on WhatsApp' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Use the original message' }));
  expect(box).toHaveValue(SLIP);
});
