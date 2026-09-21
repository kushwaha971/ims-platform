import { API_PATHS } from 'src/api/APIPaths';
import { api, ubConfig } from 'src/api/AxiosInstances';
import type { TWriteClass } from 'src/types/api.types';
import { toQueryString } from 'src/utils/queryString';

import { DEFAULT_PAGE_SIZE } from '../constants/teamDefaults';

import type {
  CreatedInvitation,
  Invitation,
  InvitationApiRow,
  InvitationDraft,
  InvitationListParams,
  InvitationListResult,
} from '../types/invitation.types';

/**
 * Part 19 §19.3.4 — the service layer: one exported async function per
 * endpoint, owning the snake_case ⇄ camelCase mapping, the query string and the
 * response typing, returning domain objects rather than `AxiosResponse`.
 *
 * No React, no Redux, no `Ub*`, no `react-intl`.
 */

// ── Wire shapes (snake_case, exactly as the agreed contract documents them) ──

interface InvitationListApiResponse {
  readonly data: readonly InvitationApiRow[];
  readonly meta?: {
    readonly page?: number;
    readonly page_size?: number;
    readonly total?: number;
    readonly total_pages?: number;
  };
}

interface InvitationApiResponse {
  readonly data: InvitationApiRow & { readonly accept_url?: string | null };
}

/**
 * `invited_by` is the one field whose shape the contract leaves open, so both
 * shapes are read and neither reaches a component. A bare id is NOT shown: a
 * UUID in a column headed "Invited by" is noise, and the column is allowed to
 * be empty.
 */
const toInvitedBy = (raw: InvitationApiRow['invited_by']): string | null => {
  if (!raw) return null;
  if (typeof raw === 'string') return raw.trim() === '' ? null : raw;
  return raw.name ?? raw.email ?? null;
};

const toInvitation = (row: InvitationApiRow): Invitation => ({
  id: row.id,
  email: row.email,
  role: row.role,
  status: row.status,
  expiresAt: row.expires_at,
  createdAt: row.created_at,
  invitedBy: toInvitedBy(row.invited_by),
});

/**
 * GET /invitations — the team screen's only read.
 *
 * CR-2026-09-19-E, DOCUMENTED EXCEPTION — this is a WHOLE-PAGE read, so it sets
 * `suppressErrorSnackbar` and `TeamPageContent` renders the failure in place
 * with the request id and a Try again, exactly as the party list does. A toast
 * would say the same thing and then disappear, leaving an empty screen with no
 * explanation of why it is empty.
 *
 * `meta` is read defensively. The contract writes it as `{...}`, the envelope
 * rule says it is page pagination, and a list that renders nothing because one
 * counter was absent would be a worse failure than a pagination bar that says
 * "page 1 of 1".
 */
export const listInvitations = async (
  params: InvitationListParams,
  signal?: AbortSignal
): Promise<InvitationListResult> => {
  const query = toQueryString({ page: params.page, page_size: params.pageSize });

  const response = await api.get<InvitationListApiResponse>(
    `${API_PATHS.INVITATIONS}${query}`,
    ubConfig({ signal, suppressErrorSnackbar: true })
  );

  const rows = response.data.data.map(toInvitation);
  const meta = response.data.meta;
  const total = meta?.total ?? rows.length;
  const pageSize = meta?.page_size ?? params.pageSize ?? DEFAULT_PAGE_SIZE;

  return {
    rows,
    meta: {
      page: meta?.page ?? params.page,
      pageSize,
      total,
      totalPages: meta?.total_pages ?? Math.max(1, Math.ceil(total / Math.max(1, pageSize))),
    },
  };
};

/**
 * POST /invitations — the invite.
 *
 * `Idempotency-Key` is MANDATORY (canon §0.11 rule 5, and `API_PATHS.INVITATIONS`
 * is on `IDEMPOTENT_POST_PATHS` so the transport backstop would warn if it were
 * missed). The key is minted by the CALLER and reused on every retry of the
 * same logical invite: a lost response after a successful 201 must replay the
 * invitation that was created rather than send a second one. That matters more
 * here than for an ordinary duplicate row, because each 201 mints a token — two
 * of them is two live ways into the business for one seat.
 *
 * The error snackbar is NOT suppressed, and that is deliberate:
 *   · a 400 does not toast anyway (`validation_error` is in `LOCALLY_PRESENTED`)
 *     and is anchored on the email or role field by `applyServerErrors`;
 *   · a 403 `plan_limit_reached` is claimed by PLT-15's dialog before the toast
 *     channel sees it, which is exactly the "you have used 3 of 3 team members"
 *     surface this screen is the first to be able to trigger;
 *   · everything else — a 500, a lost link — has no better local surface than
 *     the one global channel.
 */
export const createInvitation = async (
  input: InvitationDraft,
  idempotencyKey: string
): Promise<CreatedInvitation> => {
  const response = await api.post<InvitationApiResponse>(
    API_PATHS.INVITATIONS,
    {
      email: input.email,
      role: input.role,
      ...(input.mobile ? { mobile: input.mobile } : {}),
    },
    ubConfig({ headers: { 'Idempotency-Key': idempotencyKey } })
  );

  return {
    ...toInvitation(response.data.data),
    acceptUrl: response.data.data.accept_url ?? null,
  };
};
export const createInvitationWriteClass: TWriteClass = 'online-only';

/**
 * DELETE /invitations/{id} — revoke. 204, no body.
 *
 * Class **C, online-only** (§19.10.4). A revocation is the merchant taking
 * access back, usually because someone has just left; queuing it would leave
 * the invitation live for as long as the phone has no signal, which is the one
 * window in which it matters that it is not.
 */
export const revokeInvitation = async (invitationId: string): Promise<void> => {
  await api.delete(API_PATHS.INVITATION(invitationId));
};
export const revokeInvitationWriteClass: TWriteClass = 'online-only';

/**
 * POST /invitations/{token}/accept — the seat-consuming gate (PLT-05 FR-10).
 *
 * Class **C, online-only**. Accepting is what creates the membership and spends
 * a seat under the tenant's plan; the server locks the tenant row for it so two
 * invitees cannot take the last one. Queuing that offline would let both
 * succeed locally and one fail hours later, on a screen that has long since
 * said "you have joined".
 */
export const acceptInvitation = async (token: string): Promise<void> => {
  await api.post(API_PATHS.INVITATION_ACCEPT(token), undefined, ubConfig({
    // The page renders the failure in place — an expired or already-used link
    // needs an explanation and a way onward, not a toast that vanishes.
    suppressErrorSnackbar: true,
  }));
};
export const acceptInvitationWriteClass: TWriteClass = 'online-only';
