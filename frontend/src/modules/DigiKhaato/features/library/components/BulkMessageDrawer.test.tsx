import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { resetAllFeatureState } from 'src/redux/actions';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import * as service from '../api/libraryMessageService';

import { BulkMessageDrawer } from './BulkMessageDrawer';

/**
 * QA F4 / B51 — a message to a group. The drawer asks what and to whom, the
 * server prepares one text per student (their own name and figure), and each
 * row opens WhatsApp and is recorded on its own tap. The tests pin what the
 * merchant relies on: the request carries the group and the words, every
 * student's own text is on screen, and a tap records THAT student.
 */
jest.mock('../api/libraryMessageService', () => ({
  ...jest.requireActual('../api/libraryMessageService'),
  prepareBulk: jest.fn(),
  recordMessage: jest.fn(),
}));
jest.mock('../api/librarySeatService', () => ({
  ...jest.requireActual('../api/librarySeatService'),
  listShifts: jest.fn().mockResolvedValue([]),
}));

const row = (id: string, name: string, text: string) => ({
  kind: 'fee' as const,
  membershipId: id,
  name,
  memberNumber: `M-${id}`,
  text,
  waUrl: `https://wa.me/91900000000${id}?text=x`,
  recipient: { name, isGuardian: false, hasMobile: true },
});

beforeEach(() => {
  store.dispatch(resetAllFeatureState());
  jest.clearAllMocks();
});

describe('BulkMessageDrawer', () => {
  it('prepares fee reminders for everyone unpaid, each with their own amount', async () => {
    jest
      .mocked(service.prepareBulk)
      .mockResolvedValue([
        row('1', 'Asha', 'Rs 600.00 is pending'),
        row('2', 'Bina', 'Rs 900.00 is pending'),
      ]);
    jest.mocked(service.recordMessage).mockResolvedValue(undefined);
    renderWithProviders(<BulkMessageDrawer onClose={jest.fn()} />);
    await userEvent.click(screen.getByTestId('library-bulk-prepare'));
    expect(service.prepareBulk).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'fee', audience: 'unpaid' }),
      expect.anything()
    );
    expect(await screen.findByDisplayValue('Rs 600.00 is pending')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Rs 900.00 is pending')).toBeInTheDocument();
    expect(screen.getByText(/2 messages ready · 0 opened/)).toBeInTheDocument();

    const [, binaSend] = screen.getAllByTestId('library-bulk-send') as [HTMLElement, HTMLElement];
    binaSend.addEventListener('click', (event) => event.preventDefault());
    await userEvent.click(binaSend);
    expect(service.recordMessage).toHaveBeenCalledWith(
      '2',
      'fee',
      undefined,
      'Rs 900.00 is pending'
    );
    expect(await screen.findByText(/2 messages ready · 1 opened/)).toBeInTheDocument();
    const bina = screen.getByTestId('library-bulk-row-2');
    expect(within(bina).getByText('Opened')).toBeInTheDocument();
  });

  it('sends the desk’s own words with the group, and records them on each tap', async () => {
    jest.mocked(service.prepareBulk).mockResolvedValue([row('1', 'Asha', 'Hi Asha')]);
    jest.mocked(service.recordMessage).mockResolvedValue(undefined);
    renderWithProviders(<BulkMessageDrawer onClose={jest.fn()} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Your own message' }));
    await userEvent.click(screen.getByRole('radio', { name: 'All students' }));
    await userEvent.type(screen.getByRole('textbox'), 'Hi {{name}');
    await userEvent.click(screen.getByTestId('library-bulk-prepare'));
    expect(service.prepareBulk).toHaveBeenCalledWith(
      { kind: 'custom', audience: 'all', shiftId: '', text: 'Hi {name}' },
      expect.anything()
    );
    const send = await screen.findByTestId('library-bulk-send');
    send.addEventListener('click', (event) => event.preventDefault());
    await userEvent.click(send);
    expect(service.recordMessage).toHaveBeenCalledWith('1', 'custom', 'Hi {name}', 'Hi Asha');
  });

  it('lets each student’s message be changed on its own, and records what went', async () => {
    /* Prevents: WP-04 MSG-07 — one student's figure wrong in a group message
       with no way to fix that one text, and an edit leaking to another row. */
    jest
      .mocked(service.prepareBulk)
      .mockResolvedValue([
        row('1', 'Asha', 'Rs 600.00 is pending'),
        row('2', 'Bina', 'Rs 900.00 is pending'),
      ]);
    jest.mocked(service.recordMessage).mockResolvedValue(undefined);
    renderWithProviders(<BulkMessageDrawer onClose={jest.fn()} />);
    await userEvent.click(screen.getByTestId('library-bulk-prepare'));
    const bina = await screen.findByTestId('library-bulk-row-2');
    fireEvent.change(within(bina).getByRole('textbox', { name: 'Message' }), {
      target: { value: 'Bina, Rs 300 baaki — kal tak 🙏' },
    });
    const send = within(bina).getByTestId('library-bulk-send');
    const href = send.getAttribute('href') ?? '';
    expect(href.startsWith('https://wa.me/919000000002?text=')).toBe(true);
    expect(new URL(href).searchParams.get('text')).toBe('Bina, Rs 300 baaki — kal tak 🙏');
    expect(screen.getByDisplayValue('Rs 600.00 is pending')).toBeInTheDocument();
    send.addEventListener('click', (event) => event.preventDefault());
    await userEvent.click(send);
    expect(service.recordMessage).toHaveBeenCalledWith(
      '2',
      'fee',
      undefined,
      'Bina, Rs 300 baaki — kal tak 🙏'
    );
  });

  it('asks for a shift before preparing a message to one shift', async () => {
    renderWithProviders(<BulkMessageDrawer onClose={jest.fn()} />);
    await userEvent.click(screen.getByRole('radio', { name: 'One shift' }));
    await userEvent.click(screen.getByTestId('library-bulk-prepare'));
    expect(await screen.findAllByText('Choose a shift')).not.toHaveLength(0);
    expect(service.prepareBulk).not.toHaveBeenCalled();
  });

  it('says so when nobody fits, rather than showing an empty box', async () => {
    jest.mocked(service.prepareBulk).mockResolvedValue([]);
    renderWithProviders(<BulkMessageDrawer onClose={jest.fn()} />);
    await userEvent.click(screen.getByTestId('library-bulk-prepare'));
    expect(await screen.findByText('No student fits this. Nothing to send.')).toBeInTheDocument();
  });
});
