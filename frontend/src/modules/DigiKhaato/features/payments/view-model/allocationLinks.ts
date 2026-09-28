import { ROUTES } from 'src/routes';

import type { PaymentAllocation } from '../types/payment.types';

/**
 * Where a receipt's "Against PB/26-27/0007" row links: a supplier payment
 * settles PURCHASE BILLS (PUR-02), and linking one to the invoice route opened
 * "This invoice could not be found" for a bill that exists.
 *
 * Its own module rather than a line in `paymentDisplay.ts`: the receipt page
 * imports it statically, and `paymentDisplay` would pull the mode labels (and
 * their message catalogue) into that page's first paint with it.
 */
export const allocationHref = (
  row: Pick<PaymentAllocation, 'documentType' | 'documentId'>
): string =>
  row.documentType === 'purchase_document'
    ? `${ROUTES.PURCHASE_BILLS}/${row.documentId}`
    : `${ROUTES.SALES_INVOICES}/${row.documentId}`;
