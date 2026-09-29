import type { PageMeta } from 'src/types/api.types';
import type { InvitationStatus } from 'src/types/domain.types';

import type { MemberRoleCode } from './role.types';

/**
 * Part 19 §19.2.3 — the team feature's own types.
 *
 * An invitation is a pending INTENT, not a person: it is addressed to an email
 * that may have no account yet, it expires, and it can be revoked. That is why
 * this screen lists invitations rather than memberships — the two answer
 * different questions, and only one of them is something the owner can still
 * take back.
 */

/** The wire row, snake_case, exactly as the agreed contract sends it. */
export interface InvitationApiRow {
  readonly id: string;
  readonly email: string;
  readonly role: MemberRoleCode;
  /** A13: the catalogue key the role's name is drawn with. */
  readonly role_label_id?: string;
  readonly status: InvitationStatus;
  readonly expires_at: string;
  readonly created_at: string;
  /**
   * Who sent it. The contract does not fix the shape, and the server has an
   * FK, so both a plain id/name string and an expanded object are accepted and
   * reduced to one display string here rather than in a component.
   */
  readonly invited_by?:
    | string
    | { readonly id?: string; readonly name?: string | null; readonly email?: string | null }
    | null;
}

export interface Invitation {
  readonly id: string;
  readonly email: string;
  readonly role: MemberRoleCode;
  readonly roleLabelId: string;
  readonly status: InvitationStatus;
  /** ISO 8601. */
  readonly expiresAt: string;
  readonly createdAt: string;
  /** A name or an address to show; `null` when the server named nobody. */
  readonly invitedBy: string | null;
}

export interface InvitationListParams {
  readonly page: number;
  readonly pageSize: number;
}

export interface InvitationListResult {
  readonly rows: readonly Invitation[];
  readonly meta: PageMeta;
}

/** What the invite form collects. `mobile` is a channel, never an identity. */
export interface InvitationDraft {
  readonly email: string;
  readonly role: MemberRoleCode;
  readonly mobile?: string | null;
}

/**
 * The 201 body. `acceptUrl` is the ONLY moment the link exists on the client:
 * the server stores a hash of the token and cannot show it again, so a screen
 * that loses it has cost the merchant an invitation.
 */
export interface CreatedInvitation extends Invitation {
  readonly acceptUrl: string | null;
}
