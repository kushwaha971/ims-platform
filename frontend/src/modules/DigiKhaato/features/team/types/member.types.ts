import type { PageMeta } from 'src/types/api.types';
import type { TenantRole } from 'src/types/domain.types';

/**
 * Part 19 §19.2.3 — the team feature's member types (DEC-012).
 *
 * A member is a PERSON with an account, where an invitation next door is an
 * intent addressed to an email that may have no account yet. The two answer
 * different questions and the screen shows both: "who works here" and "who was
 * asked and has not answered".
 *
 * This path exists because there is no mail provider and none is being paid for
 * until the platform earns. The owner creates the account and passes the
 * password on by hand, which is also how an Indian shopkeeper reaches their
 * salesman — WhatsApp, not email.
 */

/** The wire row, snake_case, exactly as the server sends it. */
export interface MemberApiRow {
  readonly id: string;
  readonly user_id: string;
  readonly email: string;
  readonly full_name: string;
  readonly mobile: string | null;
  readonly role: TenantRole;
  readonly status: string;
  readonly joined_at: string | null;
  readonly last_login_at: string | null;
  readonly must_change_password: boolean;
  readonly password_expires_at: string | null;
}

export interface Member {
  readonly id: string;
  readonly userId: string;
  readonly email: string;
  readonly fullName: string;
  readonly mobile: string | null;
  readonly role: TenantRole;
  readonly status: string;
  readonly joinedAt: string | null;
  readonly lastLoginAt: string | null;
  /**
   * Still on the password the owner issued. This is the difference between
   * "set up" and "has never signed in and the password is sitting in a chat
   * thread" — which is the question an owner opens this screen to answer.
   */
  readonly mustChangePassword: boolean;
  /** ISO 8601, or `null` once they have chosen their own password. */
  readonly passwordExpiresAt: string | null;
}

export interface MemberListParams {
  readonly page: number;
  readonly pageSize: number;
}

export interface MemberListResult {
  readonly rows: readonly Member[];
  readonly meta: PageMeta;
}

/** What the add-member form collects. `mobile` is a channel, never an identity. */
export interface MemberDraft {
  readonly email: string;
  readonly fullName: string;
  readonly role: TenantRole;
  readonly mobile?: string | null;
}

/**
 * The credentials response — the ONLY moment the password exists on the client.
 *
 * The server keeps a hash and cannot show it again, so a screen that loses this
 * has cost the merchant a working login and the only way back is to regenerate.
 *
 * `password` is `null` when `createdUser` is false: that address already had a
 * DigiKhaato account and keeps the password its owner chose. Issuing a new one
 * would be an account takeover wearing an onboarding costume, so the dialog has
 * to say the true thing instead of showing a credential that would not work.
 */
export interface IssuedCredentials {
  readonly member: Member;
  readonly email: string;
  readonly password: string | null;
  readonly passwordExpiresAt: string | null;
  readonly createdUser: boolean;
  readonly loginUrl: string;
}
