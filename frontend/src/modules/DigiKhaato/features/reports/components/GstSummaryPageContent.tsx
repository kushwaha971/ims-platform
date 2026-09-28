'use client';

import { GstReport } from './GstReport';
import { TaxReportsIntlProvider } from './TaxReportsIntlProvider';

/** RPT-07 — `/reports/gst-summary`: GSTR-1 and GSTR-3B figures for a period. */
export function GstSummaryPageContent(): React.JSX.Element {
  return (
    <TaxReportsIntlProvider>
      <GstReport />
    </TaxReportsIntlProvider>
  );
}
