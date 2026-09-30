import { api } from 'src/api/AxiosInstances';

import {
  createPartyRelation,
  deletePartyRelation,
  listPartyRelations,
  listPartyRoles,
} from './partyRelationService';
import { getParty, listParties } from './partyService';

/**
 * A6 (PLT-X04 §6) — the wire half of roles and relations: snake_case in,
 * domain shapes out, and the two readings of "absent" the screens depend on
 * (no `roles` key = no module with roles; 204 = deleted, 200 = ended).
 */
afterEach(() => jest.restoreAllMocks());

const END = { id: 'p2', name: 'Mohan', mobile_masked: 'XXXXXX5678', status: 'active' };
const ROW = {
  id: 'r1',
  kind: 'guardian',
  receives_messages: true,
  from_on: '2026-09-01',
  to_on: null,
  active: true,
  party: { id: 'p1', name: 'Rahul', mobile_masked: null, status: 'active' },
  related_party: END,
};

const LIST_PARAMS = {
  q: '',
  status: 'active' as const,
  type: '' as const,
  balance: '' as const,
  collection: '' as const,
  tag: '',
  credit: '' as const,
  ordering: 'name',
  page: 1,
  pageSize: 25,
};

it('sends role= on the list and reads whether rows carried roles', async () => {
  const row = {
    id: 'p1',
    name: 'Rahul',
    display_code: null,
    mobile: null,
    is_customer: true,
    is_supplier: false,
    balance: '0.00',
    status: 'active',
    last_activity_at: null,
  };
  const get = jest.spyOn(api, 'get').mockResolvedValue({
    data: {
      data: [{ ...row, roles: ['gym_member'] }],
      meta: { page: 1, page_size: 25, total: 1, total_pages: 1 },
    },
  });

  const result = await listParties({ ...LIST_PARAMS, role: 'gym_member,library_member' });

  expect(get.mock.calls[0]?.[0]).toContain('role=gym_member%2Clibrary_member');
  expect(result.rolesOn).toBe(true);
  expect(result.rows[0]?.roles).toEqual(['gym_member']);

  get.mockResolvedValue({
    data: { data: [row], meta: { page: 1, page_size: 25, total: 1, total_pages: 1 } },
  });
  const plain = await listParties(LIST_PARAMS);
  expect(get.mock.calls[1]?.[0]).not.toContain('role=');
  expect(plain.rolesOn).toBe(false);
  expect(plain.rows[0]?.roles).toEqual([]);
});

it('maps the detail roles to badges, and leaves them absent when not sent', async () => {
  const base = {
    id: 'p1',
    name: 'Rahul',
    display_code: null,
    mobile: null,
    is_customer: true,
    is_supplier: false,
    balance: '0.00',
    status: 'active',
    last_activity_at: null,
    alt_phone: null,
    email: null,
    gstin: null,
    gst_registration: 'unregistered',
    state_code: null,
    notes: '',
    collection_date: null,
    credit_limit: null,
    credit_days: null,
    sms_opt_in: false,
    consent_source: null,
    billing_address: {},
    opening_balance_amount: null,
    opening_balance_direction: null,
    opening_balance_as_of: null,
    created_at: '2026-01-01T00:00:00Z',
  };
  jest
    .spyOn(api, 'get')
    .mockResolvedValueOnce({
      data: {
        data: {
          ...base,
          roles: [{ code: 'gym_member', module: 'gym', label_id: 'gym.role.members' }],
        },
      },
    })
    .mockResolvedValueOnce({ data: { data: base } });

  const withRoles = await getParty('p1');
  expect(withRoles.party.roleBadges).toEqual([
    { code: 'gym_member', module: 'gym', labelId: 'gym.role.members' },
  ]);
  expect(withRoles.party.roles).toEqual(['gym_member']);

  const without = await getParty('p1');
  expect('roleBadges' in without.party).toBe(false);
});

it('lists roles and relations in the domain shape', async () => {
  jest
    .spyOn(api, 'get')
    .mockResolvedValueOnce({
      data: {
        data: [{ code: 'gym_member', module: 'gym', label_id: 'gym.role.members', count: 3 }],
      },
    })
    .mockResolvedValueOnce({ data: { data: { as_person: [ROW], as_related: [] } } });

  expect(await listPartyRoles()).toEqual([
    { code: 'gym_member', module: 'gym', labelId: 'gym.role.members', count: 3 },
  ]);
  const relations = await listPartyRelations('p1');
  expect(relations.asPerson[0]).toMatchObject({
    kind: 'guardian',
    receivesMessages: true,
    relatedParty: { id: 'p2', name: 'Mohan', mobileMasked: 'XXXXXX5678' },
  });
});

it('creates with an idempotency key and snake_case body', async () => {
  const post = jest.spyOn(api, 'post').mockResolvedValue({ data: { data: ROW } });

  await createPartyRelation(
    'p1',
    { relatedPartyId: 'p2', kind: 'payer', receivesMessages: false },
    'key-1'
  );

  expect(post).toHaveBeenCalledWith(
    '/parties/p1/relations',
    { related_party_id: 'p2', kind: 'payer', receives_messages: false },
    expect.objectContaining({ headers: { 'Idempotency-Key': 'key-1' } })
  );
});

it('tells a delete (204) from an end (200 with the row)', async () => {
  const del = jest
    .spyOn(api, 'delete')
    .mockResolvedValueOnce({ status: 204, data: '' })
    .mockResolvedValueOnce({
      status: 200,
      data: { data: { ...ROW, to_on: '2026-09-30', active: false } },
    });

  expect(await deletePartyRelation('p1', 'r1')).toEqual({ outcome: 'deleted', id: 'r1' });
  const ended = await deletePartyRelation('p1', 'r1');
  expect(ended.outcome).toBe('ended');
  expect(ended.outcome === 'ended' && ended.relation.toOn).toBe('2026-09-30');
  expect(del).toHaveBeenCalledWith('/parties/p1/relations/r1', expect.anything());
});
