import { toLoanBody } from './lendingService';

import type { LoanFormValues } from '../types/lending.types';

/**
 * QA F8 — the request a loan from the old book sends. The server decides that it is
 * history (an adjustment, never today's cash); the form's job is only to say what was
 * already collected, as a count of instalments or as an amount, and never both.
 */
const VALUES: LoanFormValues = {
  borrowerMode: 'new',
  borrowerId: '',
  borrowerName: '',
  name: 'Geeta Devi',
  mobile: '',
  area: '',
  routeId: '',
  planType: 'fixed_daily',
  principal: '10000.00',
  fileCharge: '',
  rate: '2',
  rateUnit: 'per_month',
  frequency: 'daily',
  instalmentCount: '100',
  perInstalmentAmount: '100.00',
  disbursedOn: '2026-08-01',
  firstDueOn: '2026-08-02',
  collectionWeekdays: 63,
  paymentMode: 'cash',
  notes: '',
  lateFeeKind: 'none',
  lateFeeValue: '',
  lateFeeCap: '',
  lateFeeGraceDays: '0',
  existingLoan: false,
  collectedBy: 'instalments',
  collectedInstalments: '',
  collectedAmount: '',
};

describe('toLoanBody — a loan from the old book (QA F8)', () => {
  it('sends nothing about history for a new loan', () => {
    expect(toLoanBody(VALUES)).not.toHaveProperty('existing');
  });

  it('sends the instalments already paid as a number', () => {
    const body = toLoanBody({ ...VALUES, existingLoan: true, collectedInstalments: '60' });
    expect(body.existing).toEqual({ instalments_collected: 60 });
  });

  it('sends an amount instead when that is how it was counted', () => {
    const body = toLoanBody({
      ...VALUES,
      existingLoan: true,
      collectedBy: 'amount',
      collectedInstalments: '60',
      collectedAmount: '6050.00',
    });
    expect(body.existing).toEqual({ collected_amount: '6050.00' });
  });
});
