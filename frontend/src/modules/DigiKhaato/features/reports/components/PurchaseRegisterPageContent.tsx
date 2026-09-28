'use client';

import { RegisterReport } from './RegisterReport';

/** RPT-04 — `/reports/purchase-register`: every purchase bill, with ITC and RCM apart. */
export function PurchaseRegisterPageContent(): React.JSX.Element {
  return <RegisterReport book="purchase" />;
}
