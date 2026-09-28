'use client';

import { RegisterReport } from './RegisterReport';
import { TaxReportsIntlProvider } from './TaxReportsIntlProvider';

/** RPT-04 — `/reports/purchase-register`: every purchase bill, with ITC and RCM apart. */
export function PurchaseRegisterPageContent(): React.JSX.Element {
  return (
    <TaxReportsIntlProvider>
      <RegisterReport book="purchase" />
    </TaxReportsIntlProvider>
  );
}
