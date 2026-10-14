import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import * as service from '../api/partyService';

import { PartyIdentityDrawer } from './PartyIdentityDrawer';

import type { PartySaveResult } from '../types/party.types';

jest.mock('../api/partyService');

const party = { id: 'p1', name: 'Asha', mobile: '+919876543210' };
const signIn = (role = 'owner', write = true): void => {
  store.dispatch(
    sessionLoaded({
      user: {
        id: 'u1',
        name: 'Owner',
        email: 'owner@test.example',
        mobile: null,
        locale: 'en',
        mustChangePassword: false,
        passwordExpiresAt: null,
      },
      activeTenant: { id: 't1', name: 'Library', timezone: 'Asia/Kolkata', role },
      tenants: [{ id: 't1', name: 'Library', timezone: 'Asia/Kolkata' }],
      permissions: write ? ['parties.party.write'] : [],
      enabledModules: ['library'],
      version: 1,
    })
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  signIn();
});

it('saves only identity through the existing party mutation and closes on success', async () => {
  jest.mocked(service.updatePartyIdentity).mockResolvedValue({
    party: { ...party, name: 'Asha Patil' },
    warnings: [],
  } as unknown as PartySaveResult);
  const onClose = jest.fn();
  renderWithProviders(<PartyIdentityDrawer party={party} onClose={onClose} />);
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  await userEvent.clear(screen.getByRole('textbox', { name: 'Name' }));
  await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Asha Patil');
  await userEvent.click(screen.getByTestId('party-identity-save'));
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  expect(service.updatePartyIdentity).toHaveBeenCalledWith('p1', {
    name: 'Asha Patil',
    mobile: '+919876543210',
  });
});

it('does not send a write when nothing changed', async () => {
  const onClose = jest.fn();
  renderWithProviders(<PartyIdentityDrawer party={party} onClose={onClose} />);
  await userEvent.click(screen.getByTestId('party-identity-save'));
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  expect(service.updatePartyIdentity).not.toHaveBeenCalled();
});

it.each([
  ['staff', true],
  ['owner', false],
])('does not permit %s with write=%s', (role, write) => {
  signIn(role as string, write as boolean);
  renderWithProviders(<PartyIdentityDrawer party={party} onClose={jest.fn()} />);
  expect(screen.getByTestId('party-identity-save')).toBeDisabled();
});

it('keeps a refused mobile editable and does not dismiss the form', async () => {
  jest.mocked(service.updatePartyIdentity).mockRejectedValue({
    status: 400,
    requestId: null,
    code: 'validation_error',
    message: 'Check the mobile',
    details: { mobile: ['This mobile is already in use.'] },
  });
  const onClose = jest.fn();
  renderWithProviders(<PartyIdentityDrawer party={party} onClose={onClose} />);
  await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), ' Patil');
  await userEvent.click(screen.getByTestId('party-identity-save'));
  expect(await screen.findByText('This mobile is already in use.')).toBeInTheDocument();
  expect(onClose).not.toHaveBeenCalled();
});
