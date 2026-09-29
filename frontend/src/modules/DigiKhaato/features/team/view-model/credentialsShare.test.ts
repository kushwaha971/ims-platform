import { accessStateOf, buildShareText } from './credentialsShare';

import type { IssuedCredentials, Member } from '../types/member.types';

const member = (overrides: Partial<Member> = {}): Member => ({
  id: 'm1',
  userId: 'u1',
  email: 'ramesh@shop.test',
  fullName: 'Ramesh Kumar',
  mobile: null,
  role: 'staff',
  roleLabelId: '',
  roleModule: null,
  roleActive: true,
  status: 'active',
  joinedAt: null,
  lastLoginAt: null,
  mustChangePassword: true,
  passwordExpiresAt: '2026-09-28T00:00:00Z',
  ...overrides,
});

const credentials = (overrides: Partial<IssuedCredentials> = {}): IssuedCredentials => ({
  member: member(),
  email: 'ramesh@shop.test',
  password: 'Gtde-R9mz-F2NA',
  passwordExpiresAt: '2026-09-28T00:00:00Z',
  createdUser: true,
  loginUrl: 'https://shop.test/login',
  ...overrides,
});

const translate = (id: string, values?: Record<string, string | number | Date>): string =>
  `${id}|${JSON.stringify(values ?? {})}`;

describe('buildShareText', () => {
  it('carries everything the person needs to sign in, not just the password', () => {
    // The owner's job is "tell Ramesh how to get in". A copy button that yields
    // the password alone leaves them typing the address and the link into
    // WhatsApp from memory, while the dialog holding the only copy of the
    // password is still open behind it.
    const text = buildShareText({
      credentials: credentials(),
      businessName: 'Kumar Stores',
      translate,
    });

    expect(text).toContain('Ramesh Kumar');
    expect(text).toContain('Kumar Stores');
    expect(text).toContain('https://shop.test/login');
    expect(text).toContain('ramesh@shop.test');
    expect(text).toContain('Gtde-R9mz-F2NA');
  });

  it('produces nothing when the person kept their own password', () => {
    // A message reading "Password: " with nothing after it is worse than no
    // message: the owner sends it, and the recipient asks what to do with it.
    expect(
      buildShareText({
        credentials: credentials({ password: null, createdUser: false }),
        businessName: 'Kumar Stores',
        translate,
      })
    ).toBeNull();
  });
});

describe('accessStateOf', () => {
  const now = Date.parse('2026-09-21T00:00:00Z');

  it('reads as active once they have chosen their own password', () => {
    expect(accessStateOf({ mustChangePassword: false, passwordExpiresAt: null }, now)).toBe(
      'active'
    );
  });

  it('reads as pending while the owner-issued password is still good', () => {
    expect(
      accessStateOf({ mustChangePassword: true, passwordExpiresAt: '2026-09-28T00:00:00Z' }, now)
    ).toBe('pending');
  });

  it('reads as expired once the window has passed', () => {
    expect(
      accessStateOf({ mustChangePassword: true, passwordExpiresAt: '2026-09-20T00:00:00Z' }, now)
    ).toBe('expired');
  });

  it('reads as invited for somebody who has not accepted, whatever the password fields say', () => {
    // CR-2026-09-23-B. An invited row holds no access to this business, and the
    // server withholds the person's profile (`mustChangePassword: false`), which
    // on its own would read as "Signed in" — a claim about access they do not
    // have. Invited wins over every password state.
    expect(
      accessStateOf({ status: 'invited', mustChangePassword: false, passwordExpiresAt: null }, now)
    ).toBe('invited');
    expect(
      accessStateOf(
        { status: 'invited', mustChangePassword: true, passwordExpiresAt: '2026-09-20T00:00:00Z' },
        now
      )
    ).toBe('invited');
    expect(
      accessStateOf({ status: 'active', mustChangePassword: false, passwordExpiresAt: null }, now)
    ).toBe('active');
  });

  it('treats an unreadable date as pending rather than expired', () => {
    // Saying "expired" wrongly sends the owner to regenerate and re-send for
    // nothing, and this row is the only evidence they have to go on.
    expect(accessStateOf({ mustChangePassword: true, passwordExpiresAt: 'not-a-date' }, now)).toBe(
      'pending'
    );
    expect(accessStateOf({ mustChangePassword: true, passwordExpiresAt: null }, now)).toBe(
      'pending'
    );
  });
});
