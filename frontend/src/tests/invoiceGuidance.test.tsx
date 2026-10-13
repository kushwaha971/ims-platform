import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';

import { UbForm } from 'src/design-system';
import { PurchaseBillTotalsPanel } from 'src/modules/DigiKhaato/features/purchases/components/PurchaseBillTotalsPanel';
import type { PurchaseBillFormValues } from 'src/modules/DigiKhaato/features/purchases/view-model/purchaseBillForm';
import { InvoiceTotalsPanel } from 'src/modules/DigiKhaato/features/sales/components/InvoiceTotalsPanel';
import type { InvoiceFormValues } from 'src/modules/DigiKhaato/features/sales/view-model/invoiceForm';
import { computeDocumentTotals } from 'src/modules/DigiKhaato/features/sales/view-model/taxEngine';
import { renderWithProviders } from 'src/tests/renderWithProviders';

const preview = computeDocumentTotals({
  lines: [],
  gstType: 'regular',
  tenantState: '27',
  placeOfSupply: '27',
  roundOffEnabled: false,
  discountType: null,
  discountValue: null,
});

function InvoiceHarness() {
  const form = useForm<InvoiceFormValues>({
    defaultValues: { discountType: '', roundOffEnabled: false, placeOfSupplyState: '27' },
  });
  return (
    <UbForm form={form} onSubmit={() => undefined}>
      <InvoiceTotalsPanel
        form={form}
        preview={preview}
        taxFree={false}
        disabled={false}
        warnings={[]}
        rule46={{
          passed: true,
          satisfied: 7,
          total: 9,
          issues: [
            { code: 'supplier_address_missing', field: 'non_field_errors', severity: 'soft' },
            { code: 'hsn_missing', field: 'lines.0.hsn_sac', severity: 'soft' },
          ],
        }}
      />
    </UbForm>
  );
}

function PurchaseHarness() {
  const form = useForm<PurchaseBillFormValues>({
    defaultValues: { partyId: 'supplier-1', discountType: '', roundOffEnabled: false, notes: '' },
  });
  return (
    <UbForm form={form} onSubmit={() => undefined}>
      <PurchaseBillTotalsPanel
        form={form}
        preview={preview}
        claimable
        disabled={false}
        warnings={[
          {
            code: 'supplier_state_unknown',
            message: 'Supplier state unknown — assumed 27.',
            details: { assumed: '27' },
          },
        ]}
      />
    </UbForm>
  );
}

/** B20: a numbered regulation alone gives no way to find the missing bill details. */
it('opens a plain-language checklist instead of showing an unexplained rule number', async () => {
  const user = userEvent.setup();
  renderWithProviders(<InvoiceHarness />);
  expect(screen.queryByText(/Rule 46/)).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Invoice details: 7/9 complete' }));
  const checklist = screen.getByRole('dialog', { name: 'Check invoice details' });
  expect(within(checklist).getByText('Add your business address.')).toBeVisible();
  expect(within(checklist).getByText('Line 1: Add the item tax code (HSN/SAC).')).toBeVisible();
  expect(within(checklist).queryByText(/supplier_address_missing|hsn_missing/)).toBeNull();
});

/** B20: raw state codes must become an explanation with the correct supplier link. */
it('explains the assumed tax state and links to the supplier to correct it', () => {
  renderWithProviders(<PurchaseHarness />);
  expect(screen.queryByText(/assumed 27/)).toBeNull();
  expect(
    screen.getByText(
      "The supplier's state is missing. GST uses your business's state until you add it."
    )
  ).toBeVisible();
  expect(screen.getByRole('link', { name: "Add the supplier's state" })).toHaveAttribute(
    'href',
    '/parties/supplier-1'
  );
});

/** Both the warning and the corrective action must be understandable in Hindi. */
it('uses Hindi for the supplier warning and corrective action', () => {
  renderWithProviders(<PurchaseHarness />, { locale: 'hi' });
  expect(screen.queryByText(/Supplier state unknown|assumed 27/)).toBeNull();
  expect(screen.getByRole('link', { name: 'सप्लायर का राज्य जोड़ें' })).toHaveAttribute(
    'href',
    '/parties/supplier-1'
  );
});
