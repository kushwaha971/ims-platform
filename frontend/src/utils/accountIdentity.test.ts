import { accountContact, accountDisplayName, isPlaceholderEmail } from './accountIdentity';

/**
 * DEC-013 — an account made with a mobile number carries a placeholder email
 * the server needs and nobody should read. The account menu showed it as the
 * person's name on every screen.
 */
describe('accountIdentity', () => {
  const mobileOnly = { name: '', email: '919876543210@mobile.invalid', mobile: '+919876543210' };

  it('never shows the placeholder address', () => {
    expect(isPlaceholderEmail(mobileOnly.email)).toBe(true);
    expect(accountContact(mobileOnly)).toBe('+91 98765 43210');
    expect(accountDisplayName(mobileOnly)).toBe('+91 98765 43210');
  });

  it('prefers the name, with the mobile as the second line', () => {
    const named = { ...mobileOnly, name: 'Ramesh Sharma' };
    expect(accountDisplayName(named)).toBe('Ramesh Sharma');
    expect(accountContact(named)).toBe('+91 98765 43210');
  });

  it('keeps a real email exactly as it is', () => {
    const emailAccount = { name: 'Admin', email: 'ops@example.com', mobile: null };
    expect(isPlaceholderEmail(emailAccount.email)).toBe(false);
    expect(accountContact(emailAccount)).toBe('ops@example.com');
  });

  it('is empty, not "undefined", when there is nothing to show', () => {
    expect(accountDisplayName({ name: '', email: 'x@mobile.invalid', mobile: null })).toBe('');
  });
});
