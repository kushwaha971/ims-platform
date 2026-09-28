import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { hi } from 'src/tests/allMessages';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import type { PermissionCode } from 'src/types/domain.types';

import { resetMembers } from '../redux/memberSlice';

import { MembersSection } from './MembersSection';

/**
 * DEC-012 end to end inside the client (§19.13.3): screen → hook → thunk →
 * service, stubbed at the MODULE boundary.
 *
 * Each test names the defect it prevents. The one that matters most is the
 * password's single appearance: there is no way to recover it, so a screen that
 * drops it costs the merchant a working login for a person they have already
 * told to expect one.
 */
jest.mock('../api/memberService');

const memberService = jest.requireMock('../api/memberService') as {
  listMembers: jest.Mock;
  createMember: jest.Mock;
  regenerateCredentials: jest.Mock;
};

const MEMBER = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  email: 'ramesh@shop.test',
  fullName: 'Ramesh Kumar',
  mobile: null,
  role: 'staff' as const,
  status: 'active',
  joinedAt: '2026-09-21T09:00:00Z',
  lastLoginAt: null,
  mustChangePassword: true,
  passwordExpiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
};

const page = (rows: readonly unknown[]) => ({
  rows,
  meta: { page: 1, pageSize: 25, total: rows.length, totalPages: rows.length === 0 ? 0 : 1 },
});

const CREDENTIALS = {
  member: MEMBER,
  email: MEMBER.email,
  password: 'Gtde-R9mz-F2NA',
  passwordExpiresAt: MEMBER.passwordExpiresAt,
  createdUser: true,
  loginUrl: 'https://shop.test/login',
};

const signIn = (permissions: readonly PermissionCode[]): void => {
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
      activeTenant: { id: 't1', name: 'Kumar Stores', timezone: 'Asia/Kolkata' },
      tenants: [{ id: 't1', name: 'Kumar Stores', timezone: 'Asia/Kolkata' }],
      permissions: [...permissions],
      enabledModules: [],
      version: 1,
    })
  );
};

beforeEach(() => {
  store.dispatch(resetMembers());
  jest.clearAllMocks();
  signIn(['platform.members.manage']);
  memberService.listMembers.mockResolvedValue(page([]));
  memberService.createMember.mockResolvedValue(CREDENTIALS);
});

describe('MembersSection — the permission', () => {
  it('does not fetch the team for somebody who may not manage it', async () => {
    // The server enforces this on every request (R-SEC-2). Asking anyway spends
    // a round trip to be told 403 and puts a toast on a screen that would
    // already be explaining itself.
    signIn([]);
    renderWithProviders(<MembersSection />);

    await waitFor(() => expect(memberService.listMembers).not.toHaveBeenCalled());
  });
});

describe('MembersSection — adding somebody', () => {
  it('shows the password once, with everything needed to send it on', async () => {
    // The whole feature. Only a hash is stored, so a screen that renders the
    // 201 without the password — or loses it to a re-render — has cost the
    // merchant a login they have already promised somebody, with no way back
    // but to regenerate.
    const user = userEvent.setup();
    renderWithProviders(<MembersSection />);

    await user.click(await screen.findByRole('button', { name: 'Add member' }));
    await user.type(await screen.findByLabelText(/Full name/), 'Ramesh Kumar');
    await user.type(screen.getByLabelText(/Email address/), 'ramesh@shop.test');
    await user.click(screen.getByRole('button', { name: 'Create login' }));

    expect(await screen.findByDisplayValue('Gtde-R9mz-F2NA')).toBeInTheDocument();
    expect(screen.getByDisplayValue('ramesh@shop.test')).toBeInTheDocument();
    // The copy affordance is for the MESSAGE, not the password on its own: the
    // owner's job is to tell Ramesh how to get in, and a bare password leaves
    // them typing the address and the link into WhatsApp from memory.
    expect(screen.getByTestId('credentials-copy-message')).toBeInTheDocument();
  });

  it('says so plainly when the address already had an account', async () => {
    // No password is issued for an existing account — that would be a takeover
    // wearing an onboarding costume. The dialog has to say what actually
    // happened rather than show an empty field the owner will try to copy.
    memberService.createMember.mockResolvedValue({
      ...CREDENTIALS,
      password: null,
      createdUser: false,
    });
    const user = userEvent.setup();
    renderWithProviders(<MembersSection />);

    await user.click(await screen.findByRole('button', { name: 'Add member' }));
    await user.type(await screen.findByLabelText(/Full name/), 'Ramesh Kumar');
    await user.type(screen.getByLabelText(/Email address/), 'ramesh@shop.test');
    await user.click(screen.getByRole('button', { name: 'Create login' }));

    expect(await screen.findByText('They already have a YourKhata account')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Gtde-R9mz-F2NA')).not.toBeInTheDocument();
  });
});

describe('MembersSection — the list', () => {
  it('marks somebody who has never signed in, and offers a new password', async () => {
    // This is what an owner opens the screen to find out: the login exists and
    // has never been used, so the password may never have arrived.
    memberService.listMembers.mockResolvedValue(page([MEMBER]));
    renderWithProviders(<MembersSection />);

    expect(await screen.findByText('Ramesh Kumar')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /New password/ })).toBeInTheDocument();
  });

  it('offers no new password once they have chosen their own', async () => {
    // The server refuses that case, and a control whose only outcome is a
    // refusal teaches the merchant to distrust the screen.
    memberService.listMembers.mockResolvedValue(
      page([{ ...MEMBER, mustChangePassword: false, passwordExpiresAt: null }])
    );
    renderWithProviders(<MembersSection />);

    expect(await screen.findByText('Ramesh Kumar')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /New password/ })).not.toBeInTheDocument();
  });
});

describe('MembersSection — somebody invited but not yet joined', () => {
  const INVITED = {
    ...MEMBER,
    id: '33333333-3333-4333-8333-333333333333',
    email: 'priya@shop.test',
    // What the server sends for an invited row (CR-2026-09-23-B): the address
    // the owner typed and the role, and none of the invitee's own profile.
    fullName: '',
    status: 'invited',
    mustChangePassword: false,
    passwordExpiresAt: null,
  };

  it('says Invited rather than Signed in', async () => {
    // With the profile withheld, the password fields alone read as "Signed in"
    // — telling the owner somebody has access who has not even accepted.
    memberService.listMembers.mockResolvedValue(page([INVITED]));
    renderWithProviders(<MembersSection />);

    expect(await screen.findByText('Invited — has not joined yet')).toBeInTheDocument();
    expect(screen.queryByText('Signed in')).not.toBeInTheDocument();
  });

  it('titles the row by the address, once, when there is no name', async () => {
    // An empty title over the address would be a blank line on a phone card;
    // the address twice would be the same line printed two ways.
    memberService.listMembers.mockResolvedValue(page([INVITED]));
    renderWithProviders(<MembersSection />);

    expect(await screen.findAllByText('priya@shop.test')).toHaveLength(1);
  });

  it('offers no new password for somebody who has not joined', async () => {
    // The server refuses to reissue credentials for an invited row — there is
    // no login of theirs in this business — so the control is not rendered,
    // even when the (withheld) password fields would otherwise show it.
    memberService.listMembers.mockResolvedValue(
      page([{ ...INVITED, mustChangePassword: true, passwordExpiresAt: MEMBER.passwordExpiresAt }])
    );
    renderWithProviders(<MembersSection />);

    expect(await screen.findByText('Invited — has not joined yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /New password/ })).not.toBeInTheDocument();
  });
});

describe('MembersSection — the optional mobile field', () => {
  it('submits with the mobile left blank', async () => {
    // It used to not. `mobileValidation(false)` ran `.matches()` over the empty
    // string, which Yup does not skip, so an OPTIONAL field refused to submit
    // with "Enter a 10-digit mobile number" against an empty box — and there is
    // no visible clue, because the message lands on a field the merchant never
    // touched. The onboarding address step had the same defect.
    const user = userEvent.setup();
    renderWithProviders(<MembersSection />);

    await user.click(await screen.findByRole('button', { name: 'Add member' }));
    await user.type(await screen.findByLabelText(/Full name/), 'Ramesh Kumar');
    await user.type(screen.getByLabelText(/Email address/), 'ramesh@shop.test');
    await user.click(screen.getByRole('button', { name: 'Create login' }));

    await waitFor(() => expect(memberService.createMember).toHaveBeenCalledTimes(1));
    expect(memberService.createMember.mock.calls[0][0]).toMatchObject({
      email: 'ramesh@shop.test',
      fullName: 'Ramesh Kumar',
      role: 'staff',
      mobile: null,
    });
  });
});

describe('MembersSection — a ten-digit mobile (UAT D4)', () => {
  it('accepts 9890011223 and submits +919890011223', async () => {
    /* Prevents UAT D4: the field was a plain `type="tel"` box while the schema
       demands E.164 (`+91XXXXXXXXXX`), so the ten digits every merchant types
       were refused with "Enter a 10-digit Indian mobile number" — a message
       that describes exactly what they had typed. The party form's
       `UbPhoneInput` shows +91 and commits E.164; this form now uses it too. */
    const user = userEvent.setup();
    renderWithProviders(<MembersSection />);

    await user.click(await screen.findByRole('button', { name: 'Add member' }));
    await user.type(await screen.findByLabelText(/Full name/), 'Ramesh Kumar');
    await user.type(screen.getByLabelText(/Email address/), 'ramesh@shop.test');
    await user.type(screen.getByLabelText(/Mobile number/), '9890011223');
    await user.click(screen.getByRole('button', { name: 'Create login' }));

    await waitFor(() => expect(memberService.createMember).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Enter a 10-digit Indian mobile number.')).not.toBeInTheDocument();
    expect(memberService.createMember.mock.calls[0][0]).toMatchObject({
      mobile: '+919890011223',
    });
  });
});

describe('MembersSection — a mobile another login already holds (NEW-2)', () => {
  it('puts the server’s refusal on the Mobile field and keeps the dialog open', async () => {
    /* Prevents NEW-2: the server answered a taken number with a 500, which the
       merchant saw as a generic toast over a form with nothing highlighted —
       no clue that the OPTIONAL mobile was the problem or that leaving it
       blank would get the person added. The server now sends a 400 with a
       field error on `mobile`; this pins that it lands on that control, is
       announced through its `aria-describedby`, and that the dialog stays up
       with what the owner typed so they only have to clear the one field. */
    const message =
      'This mobile number is already used by another login. Leave it blank or use a different number.';
    memberService.createMember.mockRejectedValue({
      code: 'validation_error',
      message: 'Please check the highlighted fields.',
      details: { mobile: [message] },
      requestId: 'req-new2',
      status: 400,
      warnings: [],
    });
    const user = userEvent.setup();
    renderWithProviders(<MembersSection />);

    await user.click(await screen.findByRole('button', { name: 'Add member' }));
    await user.type(await screen.findByLabelText(/Full name/), 'Ramesh Kumar');
    await user.type(screen.getByLabelText(/Email address/), 'ramesh@shop.test');
    await user.type(screen.getByLabelText(/Mobile number/), '9876543210');
    await user.click(screen.getByRole('button', { name: 'Create login' }));

    const mobile = screen.getByLabelText(/Mobile number/);
    await waitFor(() => expect(mobile).toHaveAttribute('aria-invalid', 'true'));
    expect(mobile).toHaveAccessibleDescription(expect.stringContaining(message));
    expect(screen.getByLabelText(/Email address/)).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByDisplayValue('ramesh@shop.test')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create login' })).toBeInTheDocument();
  });
});

describe('MembersSection — the taken-mobile refusal in Hindi (L6)', () => {
  it('shows the NEW-2 field error in Hindi, by its code, not the server English', async () => {
    /* Prevents L6: the field message arrived in English under a Hindi form,
       because the client printed `details.mobile` verbatim and the server
       does not localise it. The server now sends `field_codes.mobile =
       "mobile_taken"`, and the dialog must say `errors.field.mobile_taken`
       from hi.json instead. */
    const english =
      'This mobile number is already used by another login. Leave it blank or use a different number.';
    memberService.createMember.mockRejectedValue({
      code: 'validation_error',
      message: 'Please check the highlighted fields.',
      details: { mobile: [english], field_codes: { mobile: 'mobile_taken' } },
      requestId: 'req-l6',
      status: 400,
      warnings: [],
    });
    const user = userEvent.setup();
    const messages = hi as Record<string, string>;
    renderWithProviders(<MembersSection />, { locale: 'hi', messages });

    await user.click(
      await screen.findByRole('button', { name: messages['team.member.add.action'] })
    );
    await user.type(
      await screen.findByLabelText(new RegExp(messages['team.member.name.label'] ?? '')),
      'Ramesh Kumar'
    );
    await user.type(
      screen.getByLabelText(new RegExp(messages['team.member.email.label'] ?? '')),
      'ramesh@shop.test'
    );
    const mobile = screen.getByLabelText(/मोबाइल नंबर/);
    await user.type(mobile, '9876543210');
    await user.click(screen.getByRole('button', { name: messages['team.member.add.submit'] }));

    await waitFor(() => expect(mobile).toHaveAttribute('aria-invalid', 'true'));
    expect(mobile).toHaveAccessibleDescription(
      expect.stringContaining(messages['errors.field.mobile_taken'] ?? '__missing__')
    );
    expect(screen.queryByText(english)).not.toBeInTheDocument();
    expect(screen.queryByText('mobile_taken')).not.toBeInTheDocument();
  });
});

describe('MembersSection — the heading count and the invited row’s disc (QA O3)', () => {
  const INVITED = {
    ...MEMBER,
    id: '33333333-3333-4333-8333-333333333333',
    email: 'priya@shop.test',
    fullName: '',
    status: 'invited',
    mustChangePassword: false,
    passwordExpiresAt: null,
  };
  const OWNER = {
    ...MEMBER,
    id: '44444444-4444-4444-8444-444444444444',
    email: 'owner@shop.test',
    fullName: 'Suresh Sharma',
    role: 'owner' as const,
  };

  it('counts the people who have joined, and the invited apart', async () => {
    /* Prevents QA O3: "3 people" for two members and an invited address that
       holds no access to this business. */
    memberService.listMembers.mockResolvedValue(page([MEMBER, INVITED, OWNER]));
    renderWithProviders(<MembersSection />);

    expect(await screen.findByText('2 people · 1 invited')).toBeInTheDocument();
    expect(screen.queryByText('3 people')).not.toBeInTheDocument();
  });

  it('says only the people when nobody is waiting', async () => {
    memberService.listMembers.mockResolvedValue(page([MEMBER, OWNER]));
    renderWithProviders(<MembersSection />);

    expect(await screen.findByText('2 people')).toBeInTheDocument();
  });

  it('draws an invite icon, not a lowercase letter of the email, for an invited row', async () => {
    /* Prevents QA O3: the phone card's disc read "p" for "priya@shop.test" —
       an initial that looks like a person's and is not one. */
    memberService.listMembers.mockResolvedValue(page([MEMBER, INVITED]));
    renderWithProviders(<MembersSection />);

    const cards = await screen.findAllByTestId('ub-grid-card');
    const invitedCard = cards.find((card) => within(card).queryByText('priya@shop.test'));
    const memberCard = cards.find((card) => within(card).queryByText('Ramesh Kumar'));
    expect(invitedCard).toBeDefined();
    expect(within(invitedCard as HTMLElement).queryByText('p')).not.toBeInTheDocument();
    expect(invitedCard?.querySelector('[aria-hidden] svg.lucide-mail')).not.toBeNull();
    // A joined member keeps their initials.
    expect(within(memberCard as HTMLElement).getByText('RK')).toBeInTheDocument();
  });
});
