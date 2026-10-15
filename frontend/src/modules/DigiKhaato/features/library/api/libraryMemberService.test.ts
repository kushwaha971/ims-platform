import { api } from 'src/api/AxiosInstances';

import { toMemberSummary, updateMember } from './libraryMemberService';

jest.mock('src/api/AxiosInstances', () => ({
  api: { patch: jest.fn() },
  ubConfig: (extras: unknown) => extras,
}));

/** B40: the form's corrected joining date must survive the API whitelist. */
it('sends both corrected dates with the current member version', async () => {
  jest.mocked(api.patch).mockResolvedValue({ data: { data: {} } });
  await updateMember('m1', { startsOn: '2025-09-01', validUntil: '2025-10-05' }, 4);
  expect(api.patch).toHaveBeenCalledWith(
    '/library/members/m1',
    { starts_on: '2025-09-01', valid_until: '2025-10-05', version: 4 },
    { suppressErrorSnackbar: true }
  );
});

it('maps optional contact fields without inventing a phone number', () => {
  expect(toMemberSummary({ mobile: '9876543210', location_label: 'Rampur' })).toMatchObject({
    mobile: '9876543210',
    locationLabel: 'Rampur',
  });
  expect(toMemberSummary({})).toMatchObject({ mobile: null, locationLabel: '' });
});
