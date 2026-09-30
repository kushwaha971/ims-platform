import { API_PATHS } from 'src/api/APIPaths';
import { api, ubConfig } from 'src/api/AxiosInstances';

import { toRoleBadge, type PartyRoleBadgeApi } from './partyService';

import type {
  PartyRelation,
  PartyRelationDraft,
  PartyRelationEnd,
  PartyRelationRemoval,
  PartyRelations,
  PartyRole,
} from '../types/party.types';

/**
 * A6 (PLT-X04 §6) — roles and guardian/payer relations, in a module of their
 * own rather than in `partyService`: the party list's warm-up puts
 * `partyService` in the app shell, and these calls are needed only by the list's
 * role chips and a khata with a module that has roles (measured: +0.6 KB on
 * every route while they lived there).
 */

interface PartyRoleApi extends PartyRoleBadgeApi {
  readonly count: number;
}

/**
 * `GET /parties/roles` — the enabled modules' roles with active counts. `[]`
 * for a business without a module that has roles. Quiet on failure: the chips
 * row is an extra, and the list it sits above has its own error state.
 */
export const listPartyRoles = async (signal?: AbortSignal): Promise<readonly PartyRole[]> => {
  const response = await api.get<{ readonly data: readonly PartyRoleApi[] }>(
    API_PATHS.PARTY_ROLES,
    ubConfig({ signal, suppressErrorSnackbar: true })
  );
  return response.data.data.map((role) => ({ ...toRoleBadge(role), count: role.count }));
};

interface PartyRelationEndApi {
  readonly id: string;
  readonly name: string;
  readonly mobile_masked: string | null;
  readonly status: 'active' | 'archived';
}

interface PartyRelationApi {
  readonly id: string;
  readonly kind: PartyRelation['kind'];
  readonly receives_messages: boolean;
  readonly from_on: string;
  readonly to_on: string | null;
  readonly active: boolean;
  readonly party: PartyRelationEndApi;
  readonly related_party: PartyRelationEndApi;
}

const toRelationEnd = (end: PartyRelationEndApi): PartyRelationEnd => ({
  id: end.id,
  name: end.name,
  mobileMasked: end.mobile_masked,
  status: end.status,
});

const toRelation = (row: PartyRelationApi): PartyRelation => ({
  id: row.id,
  kind: row.kind,
  receivesMessages: row.receives_messages,
  fromOn: row.from_on,
  toOn: row.to_on,
  active: row.active,
  party: toRelationEnd(row.party),
  relatedParty: toRelationEnd(row.related_party),
});

/** `GET /parties/{id}/relations` — both directions. The section renders its own error. */
export const listPartyRelations = async (
  partyId: string,
  signal?: AbortSignal
): Promise<PartyRelations> => {
  const response = await api.get<{
    readonly data: {
      readonly as_person: readonly PartyRelationApi[];
      readonly as_related: readonly PartyRelationApi[];
    };
  }>(API_PATHS.PARTY_RELATIONS(partyId), ubConfig({ signal, suppressErrorSnackbar: true }));
  return {
    asPerson: response.data.data.as_person.map(toRelation),
    asRelated: response.data.data.as_related.map(toRelation),
  };
};

/**
 * `POST /parties/{id}/relations`. 201 for a new link, 200 when an ended one of
 * the same kind is re-opened — both come back as the relation. The key is minted
 * once per logical save by the caller (`/parties` is on IDEMPOTENT_POST_PATHS).
 */
export const createPartyRelation = async (
  partyId: string,
  draft: PartyRelationDraft,
  idempotencyKey: string
): Promise<PartyRelation> => {
  const response = await api.post<{ readonly data: PartyRelationApi }>(
    API_PATHS.PARTY_RELATIONS(partyId),
    {
      related_party_id: draft.relatedPartyId,
      kind: draft.kind,
      receives_messages: draft.receivesMessages,
    },
    ubConfig({ headers: { 'Idempotency-Key': idempotencyKey } })
  );
  return toRelation(response.data.data);
};

/** `DELETE …/relations/{rid}` — 204 deleted, or 200 with the ENDED relation. */
export const deletePartyRelation = async (
  partyId: string,
  relationId: string
): Promise<PartyRelationRemoval> => {
  const response = await api.delete<{ readonly data: PartyRelationApi } | ''>(
    API_PATHS.PARTY_RELATION(partyId, relationId),
    ubConfig({})
  );
  const body = response.data;
  if (response.status === 204 || !body || typeof body !== 'object') {
    return { outcome: 'deleted', id: relationId };
  }
  return { outcome: 'ended', relation: toRelation(body.data) };
};
