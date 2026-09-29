import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { ALL_MESSAGES } from 'src/tests/allMessages';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import { resetMembers } from '../redux/memberSlice';

import { MembersSection } from './MembersSection';

/**
 * A13 (PLT-X12 §7-§8, BR-6) — module roles on the team screen.
 *
 * The roles come from `GET /roles` rather than a hard-coded four, so a module's
 * role appears exactly while its module is on; and a member whose module was
 * switched off is marked as such instead of looking like everybody else while
 * being able to do nothing.
 */
jest.mock('../api/memberService');
jest.mock('../api/roleService');

const memberService = jest.requireMock('../api/memberService') as {
  listMembers: jest.Mock;
  createMember: jest.Mock;
};
const roleService = jest.requireMock('../api/roleService') as { fetchRoles: jest.Mock };

// The vertical ships these words; the test stands in for its catalogue line.
const MESSAGES = {
  ...ALL_MESSAGES.en,
  'lending.role.agent': 'Collection agent',
  'lending.role.agent.caption': 'Cannot see money or phone numbers',
  'nav.module.lending': 'Lending',
};

const canon = (code: string, assignable = true) => ({
  code,
  module: null,
  labelId: `tenant.role.${code}`,
  assignable,
  isModuleRole: false,
});
const AGENT_ROLE = {
  code: 'lending_agent',
  module: 'lending',
  labelId: 'lending.role.agent',
  assignable: true,
  isModuleRole: true,
};

const member = (overrides: Record<string, unknown>) => ({
  id: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  email: 'anil@shop.test',
  fullName: 'Anil Verma',
  mobile: null,
  role: 'lending_agent',
  roleLabelId: 'lending.role.agent',
  roleModule: 'lending',
  roleActive: true,
  status: 'active',
  joinedAt: '2026-09-21T09:00:00Z',
  lastLoginAt: null,
  mustChangePassword: false,
  passwordExpiresAt: null,
  ...overrides,
});

const page = (rows: readonly unknown[]) => ({
  rows,
  meta: { page: 1, pageSize: 25, total: rows.length, totalPages: rows.length ? 1 : 0 },
});

beforeEach(() => {
  store.dispatch(resetMembers());
  store.dispatch(
    sessionLoaded({
      user: {
        id: 'u1',
        name: 'Owner',
        email: 'owner@shop.test',
        mobile: null,
        locale: 'en',
        mustChangePassword: false,
        passwordExpiresAt: null,
      },
      activeTenant: { id: 't1', name: 'Kumar Finance', timezone: 'Asia/Kolkata' },
      tenants: [{ id: 't1', name: 'Kumar Finance', timezone: 'Asia/Kolkata' }],
      permissions: ['platform.members.manage'],
      enabledModules: [],
      version: 1,
    })
  );
  roleService.fetchRoles.mockResolvedValue([
    canon('owner', false),
    canon('admin'),
    canon('staff'),
    canon('accountant'),
    AGENT_ROLE,
  ]);
  memberService.listMembers.mockResolvedValue(page([]));
});

describe('module roles on the team screen', () => {
  it('offers a module role from GET /roles, named with its module, and never owner', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MembersSection />, { messages: MESSAGES });

    await user.click(await screen.findByRole('button', { name: 'Add member' }));
    await waitFor(() => expect(roleService.fetchRoles).toHaveBeenCalled());
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('combobox'));
    const options = (await screen.findAllByRole('option')).map((o) => o.textContent);
    expect(options).toEqual(['Admin', 'Staff', 'Accountant', 'Collection agent · Lending']);
  });

  it('says what a module role cannot see, and when it is inactive', async () => {
    memberService.listMembers.mockResolvedValue(
      page([
        member({}),
        member({
          id: '33333333-3333-4333-8333-333333333333',
          email: 'b@shop.test',
          fullName: 'Bina',
          roleActive: false,
        }),
      ])
    );
    renderWithProviders(<MembersSection />, { messages: MESSAGES });

    expect(await screen.findAllByText('Collection agent')).not.toHaveLength(0);
    expect(screen.getByText('Cannot see money or phone numbers')).toBeInTheDocument();
    expect(screen.getByText('Inactive while Lending is off')).toBeInTheDocument();
  });

  it('lets the caption wrap inside a nowrap grid cell', async () => {
    // Found by LOOKING (the A13 screenshot pass): the grid's cells and card
    // meta slots are `truncate`, so the caption rendered "Inactive while its
    // featu" — cut mid-word, no ellipsis — at 1280 and 390 px alike. jsdom
    // cannot measure; this pins the class that opts the sentence out.
    memberService.listMembers.mockResolvedValue(page([member({ roleActive: false })]));
    renderWithProviders(<MembersSection />, { messages: MESSAGES });
    const captions = await screen.findAllByText('Inactive while Lending is off');
    for (const caption of captions) expect(caption).toHaveClass('whitespace-normal');
  });

  it('never prints a role message id the screen has no copy for', async () => {
    memberService.listMembers.mockResolvedValue(
      page([member({ role: 'gym_trainer', roleLabelId: 'gym.role.trainer', roleModule: 'gym' })])
    );
    renderWithProviders(<MembersSection />, { messages: MESSAGES });

    expect(await screen.findAllByText('Feature role')).not.toHaveLength(0);
    expect(screen.queryByText(/gym\.role\.trainer/)).toBeNull();
  });
});
