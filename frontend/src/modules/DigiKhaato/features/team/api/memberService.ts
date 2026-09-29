import { API_PATHS } from 'src/api/APIPaths';
import { api, ubConfig } from 'src/api/AxiosInstances';
import type { TWriteClass } from 'src/types/api.types';
import { toQueryString } from 'src/utils/queryString';

import { DEFAULT_PAGE_SIZE } from '../constants/teamDefaults';

import type {
  IssuedCredentials,
  Member,
  MemberApiRow,
  MemberDraft,
  MemberListParams,
  MemberListResult,
} from '../types/member.types';

/**
 * Part 19 §19.3.4 — one exported async function per endpoint, owning the
 * snake_case ⇄ camelCase mapping and returning domain objects (DEC-012).
 *
 * No React, no Redux, no `Ub*`, no `react-intl`.
 */

interface MemberListApiResponse {
  readonly data: readonly MemberApiRow[];
  readonly meta?: {
    readonly page?: number;
    readonly page_size?: number;
    readonly total?: number;
    readonly total_pages?: number;
  };
}

interface CredentialsApiResponse {
  readonly data: {
    readonly member: MemberApiRow;
    readonly email: string;
    readonly password: string | null;
    readonly password_expires_at: string | null;
    readonly created_user: boolean;
    readonly login_url: string;
  };
}

const toMember = (row: MemberApiRow): Member => ({
  id: row.id,
  userId: row.user_id,
  email: row.email,
  fullName: row.full_name ?? '',
  mobile: row.mobile ?? null,
  role: row.role,
  // A13: servers before module roles sent none of these; "active" is what
  // those rows always meant, and an empty label id is resolved to the canon
  // key by `roleDisplay` (never here: this module is in the app shell's import
  // graph, and a `tenant.role.*` template here pins those words to every route).
  roleLabelId: row.role_label_id ?? '',
  roleModule: row.role_module ?? null,
  roleActive: row.role_active ?? true,
  status: row.status,
  joinedAt: row.joined_at ?? null,
  lastLoginAt: row.last_login_at ?? null,
  mustChangePassword: Boolean(row.must_change_password),
  passwordExpiresAt: row.password_expires_at ?? null,
});

const toCredentials = (data: CredentialsApiResponse['data']): IssuedCredentials => ({
  member: toMember(data.member),
  email: data.email,
  // Normalised to `null` rather than left as `''`: the dialog branches on this
  // to decide between "here is their password" and "they already have an
  // account", and an empty string is a value that reads as present.
  password: data.password ? data.password : null,
  passwordExpiresAt: data.password_expires_at ?? null,
  createdUser: Boolean(data.created_user),
  loginUrl: data.login_url,
});

/**
 * GET /members — the team screen's read of who actually works here.
 *
 * CR-2026-09-19-E, DOCUMENTED EXCEPTION — a WHOLE-PAGE read, so it suppresses
 * the snackbar and the page renders the failure in place with a Try again, the
 * same as the invitation list beside it. A toast would say the same thing and
 * then vanish, leaving an empty screen with no explanation.
 */
export const listMembers = async (
  params: MemberListParams,
  signal?: AbortSignal
): Promise<MemberListResult> => {
  const query = toQueryString({ page: params.page, page_size: params.pageSize });

  const response = await api.get<MemberListApiResponse>(
    `${API_PATHS.MEMBERS}${query}`,
    ubConfig({ signal, suppressErrorSnackbar: true })
  );

  const rows = response.data.data.map(toMember);
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
 * POST /members — create the account and get the password to pass on.
 *
 * `Idempotency-Key` is MANDATORY (canon §0.11 rule 5; `API_PATHS.MEMBERS` is on
 * `IDEMPOTENT_POST_PATHS`). Minted ONCE by the caller and reused on every retry
 * of the same logical add: a lost response after a successful 201 must replay
 * the member that was created rather than create a second account and spend a
 * second seat — and on a replay the server returns `password: null`, because
 * the plaintext is deliberately not kept in the replay row.
 *
 * Class **C, online-only** (§19.10.4). This mints a credential under a seat
 * limit the server checks under a lock; queuing it offline would let two adds
 * both succeed locally and one fail hours later, on a screen that has already
 * shown the owner a password they have since sent to somebody.
 */
export const createMember = async (
  input: MemberDraft,
  idempotencyKey: string
): Promise<IssuedCredentials> => {
  const response = await api.post<CredentialsApiResponse>(
    API_PATHS.MEMBERS,
    {
      email: input.email,
      full_name: input.fullName,
      role: input.role,
      ...(input.mobile ? { mobile: input.mobile } : {}),
    },
    ubConfig({ headers: { 'Idempotency-Key': idempotencyKey } })
  );

  return toCredentials(response.data.data);
};
export const createMemberWriteClass: TWriteClass = 'online-only';

/**
 * POST /members/{id}/credentials — reissue the temporary password.
 *
 * The owner lost the WhatsApp message, or the seven days ran out. The old
 * password dies on the spot and every session held on it is thrown out, so this
 * is destructive in exactly the way a retry must not repeat blindly — hence the
 * idempotency key, which is what makes a lost response recoverable instead of
 * silently minting a third password and killing the second.
 */
export const regenerateCredentials = async (
  membershipId: string,
  idempotencyKey: string
): Promise<IssuedCredentials> => {
  const response = await api.post<CredentialsApiResponse>(
    API_PATHS.MEMBER_CREDENTIALS(membershipId),
    undefined,
    ubConfig({ headers: { 'Idempotency-Key': idempotencyKey } })
  );

  return toCredentials(response.data.data);
};
export const regenerateCredentialsWriteClass: TWriteClass = 'online-only';
