import { formatPhoneForDisplay } from 'src/utils/share';

/**
 * How a signed-in person is named on screen.
 *
 * Since sign-in became a mobile number and a code (DEC-013), an account made
 * that way has no email: the server keeps a placeholder,
 * `919876543210@mobile.invalid`, because the column is unique and not null.
 * It is not an address and was never meant to be read — yet the account menu
 * printed it as the person's name ("919876543210@mobile.inv…") on every
 * screen of the app (found recording the demo, 10 Oct 2026).
 *
 * So: the CONTACT line is a real email when there is one, otherwise the mobile
 * the person signs in with, formatted. The DISPLAY name is the name, else the
 * contact.
 */
const PLACEHOLDER_EMAIL = /@mobile\.invalid$/i;

export const isPlaceholderEmail = (email: string | null | undefined): boolean =>
  !!email && PLACEHOLDER_EMAIL.test(email);

export interface AccountIdentityInput {
  readonly name?: string | null;
  readonly email?: string | null;
  readonly mobile?: string | null;
}

export const accountContact = (user: AccountIdentityInput): string => {
  if (user.email && !isPlaceholderEmail(user.email)) return user.email;
  return formatPhoneForDisplay(user.mobile) || '';
};

export const accountDisplayName = (user: AccountIdentityInput): string =>
  (user.name ?? '').trim() || accountContact(user);
