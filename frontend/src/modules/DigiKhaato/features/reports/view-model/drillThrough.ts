import { partyPath } from 'src/routes';

import { sourceRoute } from '../../ledger/view-model/sourceDisplay';

import type { SourceRef } from '../types/reports.types';

/**
 * Where a report row opens (RPT-02 AC-3, RPT-01 FR-3): the document's own
 * page, or the party's khata for one of the khata's own lines.
 *
 * Documents go through LED-10's `sourceRoute` — the one table of "which page
 * shows this document" — so a report row and the khata line for the same bill
 * open the same page, and when SAL-04 gives credit notes their own detail
 * route it is changed there once. A stock adjustment has no page of its own
 * (INV-06 shows it only in each item's movements), so its row links nowhere
 * rather than to a page that would 404.
 */
export const sourceHref = (source: SourceRef, number: string | null): string | null => {
  switch (source.kind) {
    case 'ledger_entry':
      return source.partyId ? partyPath(source.partyId) : null;
    case 'sales_document':
    case 'purchase_document':
    case 'payment':
    case 'expense':
      return sourceRoute({
        type: source.kind,
        id: source.id,
        // `sourceRoute` refuses a document it cannot name ("not found"); a
        // report row always has one, so an unnumbered row still opens.
        number: number ?? source.id,
        status: null,
        kind: null,
      });
    case 'stock_adjustment':
    default:
      return null;
  }
};
