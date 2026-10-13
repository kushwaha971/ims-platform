import { libraryPanelAppliesTo } from '../partyPanel';

import { blockParams, enrolCost, toEnrolBody, validityLine } from './memberDisplay';

import type { EnrolFormValues, MembershipType } from '../types/member.types';

const STUDENT: MembershipType = {
  id: 'ty1',
  name: 'Student',
  maxCopies: 2,
  loanDays: 14,
  feeAmount: '100.00',
  admissionFee: '50.00',
  depositAmount: '500.00',
  validityMonths: 12,
  isActive: true,
  version: 1,
};

const VALUES: EnrolFormValues = {
  partyMode: 'new',
  partyId: '',
  partyName: '',
  name: ' Asha Kulkarni ',
  mobile: '',
  membershipTypeId: 'ty1',
  memberNumber: '',
  groupLabel: '9-B',
  guardianName: 'Suresh Kulkarni',
  guardianMobile: '9876543210',
  shiftId: '',
  seatId: '',
  lockerLabel: '',
  collectNow: true,
  lines: [{ mode: 'cash', upiApp: '', amount: '150.00', reference: '' }],
  existingStudent: false,
  startsOn: '',
  validUntil: '',
  depositHeld: '',
  oldDuesAmount: '',
  oldDuesOn: '',
};

describe('memberDisplay', () => {
  it('says how long a membership has, in the words a counter uses', () => {
    const today = '2026-10-04';
    expect(validityLine({ validUntil: null, effectiveStatus: 'active' }, today).id).toBe(
      'library.member.noExpiry'
    );
    expect(validityLine({ validUntil: '2026-10-01', effectiveStatus: 'expired' }, today)).toEqual({
      id: 'library.member.expiredAgo',
      params: { count: 3 },
    });
    expect(validityLine({ validUntil: '2026-10-06', effectiveStatus: 'active' }, today)).toEqual({
      id: 'library.member.expiresIn',
      params: { count: 2 },
    });
    expect(validityLine({ validUntil: '2027-03-31', effectiveStatus: 'active' }, today).id).toBe(
      'library.member.validUntilOn'
    );
  });

  it('collects fees and the deposit as two cash blocks, and nothing when told not to', () => {
    expect(enrolCost(STUDENT)).toEqual({ fees: '150.00', deposit: '500.00' });
    const body = toEnrolBody(VALUES, STUDENT, '2026-10-04');
    expect(body).toMatchObject({
      party: { name: 'Asha Kulkarni' },
      membership_type_id: 'ty1',
      group_label: '9-B',
      guardian: { name: 'Suresh Kulkarni', mobile: '9876543210' },
      collect_fees: { mode_breakup: [{ mode: 'cash', amount: '150.00' }] },
      collect_deposit: { mode_breakup: [{ mode: 'cash', amount: '500.00' }] },
    });
    const owed = toEnrolBody({ ...VALUES, collectNow: false }, STUDENT, '2026-10-04');
    expect(owed.collect_fees).toBeUndefined();
    expect(owed.collect_deposit).toBeUndefined();
  });

  it('takes the fee as the merchant split it, and the deposit in the first line’s mode (QA F2)', () => {
    const body = toEnrolBody(
      {
        ...VALUES,
        lines: [
          { mode: 'upi', upiApp: 'phonepe', amount: '100.00', reference: '' },
          { mode: 'cash', upiApp: '', amount: '50.00', reference: '' },
        ],
      },
      STUDENT,
      '2026-10-04'
    );
    expect(body.collect_fees).toEqual({
      mode_breakup: [
        { mode: 'upi', amount: '100.00', upi_app: 'phonepe' },
        { mode: 'cash', amount: '50.00' },
      ],
      payment_date: '2026-10-04',
    });
    expect(body.collect_deposit).toMatchObject({
      mode_breakup: [{ mode: 'upi', amount: '500.00', upi_app: 'phonepe' }],
    });
  });

  it('brings an existing student in with their dates and no money today (QA F1)', () => {
    const body = toEnrolBody(
      {
        ...VALUES,
        existingStudent: true,
        startsOn: '2026-08-01',
        validUntil: '2026-10-31',
        depositHeld: '500.00',
        oldDuesAmount: '300.00',
        oldDuesOn: '2026-09-01',
      },
      STUDENT,
      '2026-10-04'
    );
    expect(body).toMatchObject({
      existing_student: true,
      starts_on: '2026-08-01',
      valid_until: '2026-10-31',
      deposit_held: '500.00',
      old_dues: { amount: '300.00', on: '2026-09-01' },
    });
    // No fee today and no money today: nothing to collect, even with "Collect now" on.
    expect(body.collect_fees).toBeUndefined();
    expect(body.collect_deposit).toBeUndefined();
  });

  it('reads the empty optional fields the resolver hands over as null (QA-F04-1)', () => {
    const resolved = {
      ...VALUES,
      mobile: null,
      memberNumber: null,
      guardianName: null,
      guardianMobile: null,
    } as unknown as EnrolFormValues;
    const body = toEnrolBody(resolved, STUDENT, '2026-10-04');
    expect(body.party).toEqual({ name: 'Asha Kulkarni', mobile: undefined });
    expect(body.guardian).toBeUndefined();
    expect(body.member_number).toBeUndefined();
  });

  it('formats a block’s amounts and leaves its counts alone', () => {
    expect(
      blockParams({
        code: 'dues_over_limit',
        overridable: true,
        params: { dues: '1200.00', limit: '500.00' },
      })
    ).toEqual({ dues: '₹1,200.00', limit: '₹500.00' });
    expect(
      blockParams({
        code: 'copy_limit_reached',
        overridable: true,
        params: { held: '2', max: '2' },
      })
    ).toEqual({ held: '2', max: '2' });
  });

  it('puts the library panel only on a member’s khata', () => {
    expect(libraryPanelAppliesTo({ roleBadges: [{ code: 'library_member' }] })).toBe(true);
    expect(libraryPanelAppliesTo({ roleBadges: [{ code: 'borrower' }] })).toBe(false);
    expect(libraryPanelAppliesTo({})).toBe(false);
  });
});
