import type { IssuedCredentials } from '../types/member.types';

/**
 * Part 19 §19.2.5 — the view-model layer: pure, testable, no React.
 *
 * ── Why the whole message, not just the password ────────────────────────────
 * The owner's job is not "copy a password", it is "tell Ramesh how to get in".
 * A copy button that yields `Gtde-R9mz-F2NA` on its own leaves them to type the
 * address, the link and an explanation into WhatsApp themselves — on a phone,
 * from memory, while a dialog they cannot reopen is holding the one copy of the
 * password. Half of them will send the password with no link and the other half
 * will close the dialog to go and look the link up.
 *
 * So the copy affordance produces the message, and the individual fields are
 * still shown and individually selectable for the merchant who wants only one.
 */
export interface ShareTextInput {
  readonly credentials: IssuedCredentials;
  readonly businessName: string;
  /** `t` from `useTranslation`, so the message goes out in the owner's language. */
  readonly translate: (id: string, values?: Record<string, string | number | Date>) => string;
}

export const buildShareText = ({
  credentials,
  businessName,
  translate,
}: ShareTextInput): string | null => {
  // No password means the person already had an account and kept their own.
  // There is nothing to send, and a message that says "Password: " with nothing
  // after it is worse than no message.
  if (!credentials.password) return null;

  return translate('team.credentials.share', {
    name: credentials.member.fullName,
    business: businessName,
    loginUrl: credentials.loginUrl,
    email: credentials.email,
    password: credentials.password,
  });
};

/**
 * How a row's access column reads (DEC-012).
 *
 * `pending` is the state the owner is scanning for: the login exists and has
 * never been used, which means the password is still sitting in a chat thread
 * and may never have arrived. `expired` is that state having run out of time.
 *
 * Derived from two fields rather than stored as one, because the server already
 * owns both and a third column that could disagree with them is a bug waiting
 * for a clock skew.
 */
export type MemberAccessState = 'invited' | 'active' | 'pending' | 'expired';

/**
 * `invited` comes first and overrides the password fields (CR-2026-09-23-B).
 *
 * An invited row is somebody with an account who was sent an invitation and
 * has not accepted it. They hold no access to this business, and the server
 * withholds their profile, so "Signed in" — what `mustChangePassword: false`
 * would otherwise read as — would be a claim about access they do not have.
 */
export const accessStateOf = (
  member: {
    readonly status?: string;
    readonly mustChangePassword: boolean;
    readonly passwordExpiresAt: string | null;
  },
  now: number = Date.now()
): MemberAccessState => {
  if (member.status === 'invited') return 'invited';
  if (!member.mustChangePassword) return 'active';
  if (!member.passwordExpiresAt) return 'pending';
  const expiresAt = Date.parse(member.passwordExpiresAt);
  // An unparseable date is treated as "pending", never as "expired": telling an
  // owner their salesman's password is dead when it is not sends them to
  // regenerate and re-send for nothing, and the row they are reading is the
  // only evidence they have.
  if (Number.isNaN(expiresAt)) return 'pending';
  return expiresAt <= now ? 'expired' : 'pending';
};
