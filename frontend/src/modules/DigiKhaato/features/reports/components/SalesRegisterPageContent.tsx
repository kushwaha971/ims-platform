'use client';

import { RegisterReport } from './RegisterReport';
import { TaxReportsIntlProvider } from './TaxReportsIntlProvider';

/** RPT-03 — `/reports/sales-register`: every invoice, bill of supply and credit note. */
export function SalesRegisterPageContent(): React.JSX.Element {
  return (
    <TaxReportsIntlProvider>
      <RegisterReport book="sales" />
    </TaxReportsIntlProvider>
  );
}
