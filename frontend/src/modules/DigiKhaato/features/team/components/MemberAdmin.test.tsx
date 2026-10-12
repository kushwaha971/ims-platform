import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import { resetMembers } from '../redux/memberSlice';

import { MembersSection } from './MembersSection';

/**
 * Owner, 12 Oct 2026 — edit, block, unblock and remove on the team list,
 * through screen → hook → thunk → service, stubbed at the module boundary.
 *
 * The visibility cases matter as much as the actions: every ⋯ drawn where the
 * server would refuse is a button whose only outcome is a 403, and the owner
 * asked in so many words that these be for the owner and admins only.
 */
jest.mock('../api/memberService');
jest.mock('../api/roleService');

const memberService = jest.requireMock('../api/memberService') as {
  listMembers: jest.Mock;
  updateMember: jest.Mock;
  blockMember: jest.Mock;
  unblockMember: jest.Mock;
  removeMember: jest.Mock;
};
const roleService = jest.requireMock('../api/roleService') as { fetchRoles: jest.Mock };

const base = {
  email: 'x@shop.test',
  mobile: null,
  roleLabelId: '',
  roleModule: null,
  roleActive: true,
  status: 'active',
  joinedAt: '2026-09-21T09:00:00Z',
  lastLoginAt: null,
  mustChangePassword: false,
  passwordExpiresAt: null,
};

const OWNER_ROW = {
  ...base,
  id: 'm-owner',
  userId: 'u-owner',
  fullName: 'Asha Owner',
  role: 'owner',
};
const ADMIN_ROW = {
  ...base,
  id: 'm-admin',
  userId: 'u-admin',
  fullName: 'Vikram Admin',
  role: 'admin',
};
const STAFF_ROW = {
  ...base,
  id: 'm-staff',
  userId: 'u-staff',
  fullName: 'Ramesh Kumar',
  role: 'staff',
};
const BLOCKED_ROW = {
  ...base,
  id: 'm-blocked',
  userId: 'u-blocked',
  fullName: 'Suresh Blocked',
  role: 'staff',
  status: 'suspended',
};
const ROWS = [OWNER_ROW, ADMIN_ROW, STAFF_ROW, BLOCKED_ROW];

const page = (rows: readonly unknown[]) => ({
  rows,
  meta: { page: 1, pageSize: 25, total: rows.length, totalPages: 1 },
});

const signInAs = (userId: string, role: string): void => {
  store.dispatch(
    sessionLoaded({
      user: {
        id: userId,
        name: 'Viewer',
        email: 'viewer@shop.test',
        mobile: null,
        locale: 'en',
        mustChangePassword: false,
        passwordExpiresAt: null,
      },
      activeTenant: { id: 't1', name: 'Kumar Stores', timezone: 'Asia/Kolkata', role },
      tenants: [{ id: 't1', name: 'Kumar Stores', timezone: 'Asia/Kolkata', role }],
      permissions: ['platform.members.manage'],
      enabledModules: [],
      version: 1,
    })
  );
};

const moreFor = (name: string) => screen.queryByRole('button', { name: `Actions for ${name}` });

beforeEach(() => {
  store.dispatch(resetMembers());
  jest.clearAllMocks();
  memberService.listMembers.mockResolvedValue(page(ROWS));
  roleService.fetchRoles.mockResolvedValue([]);
});

describe('who sees the ⋯', () => {
  it('shows it to the owner on staff and admin rows, never on their own row', async () => {
    signInAs('u-owner', 'owner');
    renderWithProviders(<MembersSection />);

    expect(await screen.findByRole('button', { name: 'Actions for Ramesh Kumar' })).toBeEnabled();
    expect(moreFor('Vikram Admin')).toBeInTheDocument();
    expect(moreFor('Suresh Blocked')).toBeInTheDocument();
    expect(moreFor('Asha Owner')).not.toBeInTheDocument();
  });

  it('shows an admin staff rows only — not the owner, not another admin, not themselves', async () => {
    signInAs('u-admin', 'admin');
    renderWithProviders(<MembersSection />);

    expect(await screen.findByRole('button', { name: 'Actions for Ramesh Kumar' })).toBeEnabled();
    expect(moreFor('Asha Owner')).not.toBeInTheDocument();
    expect(moreFor('Vikram Admin')).not.toBeInTheDocument();
  });

  it('shows nothing to a role that holds the codename but is not owner or admin', async () => {
    // A custom "Supervisor" ticked with manage-members can read the team; the
    // owner said acting on people is theirs and the admins' alone.
    signInAs('u-sup', 'supervisor');
    renderWithProviders(<MembersSection />);

    expect(await screen.findByText('Ramesh Kumar')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Actions for/ })).not.toBeInTheDocument();
  });

  it('marks a blocked member as Blocked', async () => {
    // Without the badge a blocked row read "Signed in", and the owner could
    // not tell the block had worked — or find the row to unblock.
    signInAs('u-owner', 'owner');
    renderWithProviders(<MembersSection />);

    expect(await screen.findByText('Blocked')).toBeInTheDocument();
  });
});

describe('the actions', () => {
  it('blocks only after a confirmation that names the person', async () => {
    memberService.blockMember.mockResolvedValue({ ...STAFF_ROW, status: 'suspended' });
    signInAs('u-owner', 'owner');
    const user = userEvent.setup();
    renderWithProviders(<MembersSection />);

    await user.click(await screen.findByRole('button', { name: 'Actions for Ramesh Kumar' }));
    await user.click(await screen.findByRole('button', { name: /^Block/ }));
    expect(memberService.blockMember).not.toHaveBeenCalled();

    const dialog = await screen.findByRole('dialog', { name: 'Block Ramesh Kumar?' });
    expect(within(dialog).getByText(/Ramesh Kumar will be signed out/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Block' }));

    await waitFor(() => expect(memberService.blockMember).toHaveBeenCalledTimes(1));
    expect(memberService.blockMember.mock.calls[0][0]).toBe('m-staff');
    expect(typeof memberService.blockMember.mock.calls[0][1]).toBe('string');
    expect(await screen.findAllByText('Blocked')).toHaveLength(2);
  });

  it('unblocks in one tap, because it takes nothing away', async () => {
    memberService.unblockMember.mockResolvedValue({ ...BLOCKED_ROW, status: 'active' });
    signInAs('u-owner', 'owner');
    const user = userEvent.setup();
    renderWithProviders(<MembersSection />);

    await user.click(await screen.findByRole('button', { name: 'Actions for Suresh Blocked' }));
    expect(screen.queryByRole('button', { name: /^Block/ })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: /^Unblock/ }));

    await waitFor(() =>
      expect(memberService.unblockMember).toHaveBeenCalledWith('m-blocked', expect.any(String))
    );
    await waitFor(() => expect(screen.queryByText('Blocked')).not.toBeInTheDocument());
  });

  it('removes after a confirmation, and the row leaves the list', async () => {
    memberService.removeMember.mockResolvedValue({ ...STAFF_ROW, status: 'removed' });
    signInAs('u-owner', 'owner');
    const user = userEvent.setup();
    renderWithProviders(<MembersSection />);

    await user.click(await screen.findByRole('button', { name: 'Actions for Ramesh Kumar' }));
    await user.click(await screen.findByRole('button', { name: /Remove from team/ }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Remove Ramesh Kumar from the team?',
    });
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

    await waitFor(() =>
      expect(memberService.removeMember).toHaveBeenCalledWith('m-staff', expect.any(String))
    );
    await waitFor(() => expect(screen.queryByText('Ramesh Kumar')).not.toBeInTheDocument());
  });

  it('edits a name and sends only what changed', async () => {
    // Sending the unchanged role back would be harmless; sending an unchanged
    // NAME is not — the server refuses a name it does not own, which would
    // fail a role change the owner was entitled to make.
    memberService.updateMember.mockResolvedValue({ ...STAFF_ROW, fullName: 'Ramesh K' });
    signInAs('u-owner', 'owner');
    const user = userEvent.setup();
    renderWithProviders(<MembersSection />);

    await user.click(await screen.findByRole('button', { name: 'Actions for Ramesh Kumar' }));
    await user.click(await screen.findByRole('button', { name: /^Edit/ }));
    const name = await screen.findByLabelText(/Full name/);
    await user.clear(name);
    await user.type(name, 'Ramesh K');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(memberService.updateMember).toHaveBeenCalledWith('m-staff', { fullName: 'Ramesh K' })
    );
    expect(await screen.findByText('Ramesh K')).toBeInTheDocument();
  });
});
