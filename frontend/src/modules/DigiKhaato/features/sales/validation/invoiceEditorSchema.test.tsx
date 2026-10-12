import { renderHook } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { Provider } from 'react-redux';

import { store } from 'src/redux/store';
import { en } from 'src/tests/allMessages';
import { addDaysIso, todayInTenantTz } from 'src/utils/dates';

import { emptyInvoiceForm, emptyLine, type InvoiceFormValues } from '../view-model/invoiceForm';

import { isWalkInMobile, useInvoiceEditorSchema } from './invoiceEditorSchema';

import type { ValidationError } from 'yup';

/**
 * SAL-02 §10 before the tap. The editor had no schema until 6 Oct 2026: a
 * half-filled row was silently LEFT OFF the bill (it failed `isCompleteLine`
 * and was never sent), and every other refusal came back as one snackbar over
 * a form with nothing highlighted. These pin each rule to the message the
 * merchant reads under the field, in the server's words.
 */
// The date rules read the business's timezone from the session (EC-8).
const wrapper = ({ children }: Readonly<{ children: React.ReactNode }>) => (
  <Provider store={store}>
    <IntlProvider locale="en" defaultLocale="en" messages={en as Record<string, string>}>
      {children}
    </IntlProvider>
  </Provider>
);

const TODAY = todayInTenantTz();

const schemaFor = (kind: 'invoice' | 'estimate' = 'invoice') =>
  renderHook(() => useInvoiceEditorSchema({ kind }), { wrapper }).result.current;

const rice = { ...emptyLine(), itemId: 'i1', qty: '2', unitPrice: '450', taxCode: 'GST5' };

const bill = (over: Partial<InvoiceFormValues> = {}): InvoiceFormValues => ({
  ...emptyInvoiceForm(TODAY, 'walkIn', '27'),
  lines: [rice],
  ...over,
});

/** Every message the schema raises, by path. */
const SHOP = {
  rates: { GST5: { rate: '5.000', cessRate: '0.000' } },
  gstType: 'regular' as const,
  tenantState: '27',
};

const errorsOf = (values: InvoiceFormValues, kind?: 'invoice' | 'estimate') => {
  try {
    schemaFor(kind).validateSync(values, { abortEarly: false, context: SHOP });
    return {};
  } catch (error) {
    const out: Record<string, string> = {};
    for (const inner of (error as ValidationError).inner) out[inner.path ?? ''] = inner.message;
    return out;
  }
};

it('passes a plain walk-in bill, and ignores a blank trailing row', () => {
  // The editor always keeps an empty row to type into; it is not a mistake.
  expect(errorsOf(bill({ lines: [rice, emptyLine()] }))).toEqual({});
});

it.each([
  ['0', 'The quantity must be more than zero.'],
  ['', 'Enter a quantity.'],
  ['1.5', 'This unit takes whole numbers only.'],
  ['abc', 'This unit takes whole numbers only.'],
])('stops a started row with quantity %p instead of leaving it off the bill', (qty, message) => {
  expect(errorsOf(bill({ lines: [{ ...rice, qty }] }))['lines[0].qty']).toBe(message);
});

it('lets a weighed unit take three decimals, and no more', () => {
  const sugar = { ...rice, allowDecimal: true, unitCode: 'KG' };
  expect(errorsOf(bill({ lines: [{ ...sugar, qty: '1.255' }] }))).toEqual({});
  expect(errorsOf(bill({ lines: [{ ...sugar, qty: '1.2555' }] }))['lines[0].qty']).toBe(
    'Use up to three decimals.'
  );
});

it('refuses a negative or over-precise rate, as the server would', () => {
  for (const unitPrice of ['-5', '12.34567']) {
    expect(errorsOf(bill({ lines: [{ ...rice, unitPrice }] }))['lines[0].unitPrice']).toBe(
      'Enter a rate of zero or more, up to 4 decimals.'
    );
  }
  expect(errorsOf(bill({ lines: [{ ...rice, unitPrice: '12.3456' }] }))).toEqual({});
});

it('checks HSN shape and line discount bounds', () => {
  const errors = errorsOf(
    bill({
      lines: [
        { ...rice, hsnSac: '10061' },
        { ...rice, discountType: 'percent', discountValue: '120' },
        { ...rice, discountType: 'amount', discountValue: '901' },
      ],
    })
  );
  expect(errors['lines[0].hsnSac']).toBe('An HSN code has 4, 6 or 8 digits.');
  expect(errors['lines[1].discountValue']).toBe('This cannot be more than 100.');
  expect(errors['lines[2].discountValue']).toBe('Discount cannot exceed the line amount.');
});

it('asks for a party on a party bill, and for a real mobile on a walk-in', () => {
  expect(errorsOf(bill({ mode: 'party', partyId: null })).partyId).toBe(
    'Choose a party, or switch to walk-in.'
  );
  expect(errorsOf(bill({ walkInMobile: '12345' })).walkInMobile).toBe(
    'Enter a 10-digit Indian mobile number.'
  );
  expect(errorsOf(bill({ walkInMobile: '98765 43210' }))).toEqual({});
});

it('keeps the dates in order: not in the future, due and valid-until not before the bill', () => {
  // The business's day, not the device's (EC-8) — what the rule itself judges by.
  const today = todayInTenantTz();
  const tomorrow = addDaysIso(today, 1);
  const yesterday = addDaysIso(today, -1);
  expect(errorsOf(bill({ documentDate: tomorrow })).documentDate).toBe(
    'This date cannot be in the future.'
  );
  expect(errorsOf(bill({ dueOn: yesterday })).dueOn).toBe(
    'Due date cannot be before the bill date.'
  );
  expect(errorsOf(bill({ validUntil: yesterday }), 'estimate').validUntil).toBe(
    'Valid-until cannot be before the estimate date.'
  );
});

it('bounds the bill discount by the subtotal and by 100 %', () => {
  expect(
    // Two rice at ₹450 is a ₹900 subtotal: ₹901 off it is refused, ₹900 is not.
    errorsOf(bill({ discountType: 'amount', discountValue: '901' })).discountValue
  ).toBe('Discount cannot exceed the subtotal.');
  expect(errorsOf(bill({ discountType: 'amount', discountValue: '900' }))).toEqual({});
  expect(errorsOf(bill({ discountType: 'percent', discountValue: '101' })).discountValue).toBe(
    'This cannot be more than 100.'
  );
});

it('needs a place of supply and at least one item', () => {
  const errors = errorsOf(bill({ placeOfSupplyState: '', lines: [emptyLine()] }));
  expect(errors.placeOfSupplyState).toBe('Choose the place of supply.');
  expect(errors.lines).toBe('Add at least one item.');
});

it.each([
  ['9876543210', true],
  ['+919876543210', true],
  ['98765-43210', true],
  ['5876543210', false],
  ['987654321', false],
  ['+447911123456', true],
  ['+14165550100', true],
  ['+4479', false],
])('reads %p as a walk-in mobile: %p (the server’s rule)', (value, ok) => {
  expect(isWalkInMobile(value)).toBe(ok);
});

describe('the return form (SAL-04 §10)', () => {
  it('refuses half a counted unit before the server does, and lets a weighed one through', async () => {
    // "1.5 NOS" reached the server and came back as a snackbar; the line cell
    // said nothing. The cap and the date were already checked here; this was not.
    const { useSalesFlowSchemas } = await import('./salesFlowSchemas');
    const { creditNoteSchemaFor } = renderHook(() => useSalesFlowSchemas(), { wrapper }).result
      .current;
    const { makeDocument, wireLine } = await import('../testing/salesFixtures');
    const { emptyCreditNoteForm, returnCaps } = await import('../view-model/creditNoteForm');
    const invoice = makeDocument({
      document_date: TODAY,
      lines: [
        wireLine({ id: 'l1', qty: '5.000', unit_code: 'NOS' }),
        wireLine({ id: 'l2', line_no: 2, qty: '5.000', unit_code: 'KG' }),
      ],
    });
    const schema = creditNoteSchemaFor(returnCaps(invoice));
    const values = (qty1: string, qty2: string) => ({
      ...emptyCreditNoteForm(invoice, TODAY),
      lines: [
        { againstLineId: 'l1', qty: qty1 },
        { againstLineId: 'l2', qty: qty2 },
      ],
    });
    await expect(schema.validateAt('lines[0].qty', values('1.5', ''))).rejects.toThrow(
      'This unit takes whole numbers only.'
    );
    await expect(schema.validate(values('2', '1.5'))).resolves.toBeTruthy();
  });
});
