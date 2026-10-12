import { screen } from '@testing-library/react';

import { renderWithProviders } from 'src/tests/renderWithProviders';

import { discountsInRange } from '../hooks/useDraftAutosave';
import { emptyLine } from '../view-model/invoiceForm';

import { InvoiceSaveIndicator } from './InvoiceSaveIndicator';

import type { InvoiceFormValues } from '../view-model/invoiceForm';

/**
 * QA B8 — a 150 % line discount was autosaved, the server answered 400, and the bill
 * said only "Couldn't save". The save now says the server's reason, and a discount
 * outside 0–100 % is not sent at all: the cell refuses it as it is typed.
 */
describe('a failed draft save', () => {
  it('says why it failed', () => {
    renderWithProviders(
      <InvoiceSaveIndicator indicator="error" savedAt={null} reason="Discount cannot exceed 100%." />
    );
    expect(screen.getByTestId('invoice-save-indicator')).toHaveTextContent(
      'Couldn’t save: Discount cannot exceed 100%.'
    );
  });

  it('holds back a draft whose percentage discount is outside 0–100', () => {
    const withDiscount = (value: string): InvoiceFormValues =>
      ({
        lines: [{ ...emptyLine(), discountType: 'percent', discountValue: value }],
      }) as unknown as InvoiceFormValues;
    expect(discountsInRange(withDiscount('150'))).toBe(false);
    expect(discountsInRange(withDiscount('100'))).toBe(true);
    expect(discountsInRange(withDiscount(''))).toBe(true);
  });
});
