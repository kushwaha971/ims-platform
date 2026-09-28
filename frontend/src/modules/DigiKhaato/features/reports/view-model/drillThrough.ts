import { partyPath } from 'src/routes';

import { sourceRoute } from '../../ledger/view-model/sourceDisplay';

import type { SourceRef } from '../types/reports.types';

/**
 * Where a report row opens (RPT-02 AC-3, RPT-01 FR-3): the document's own
 * page, or the party's khata for one of the khata's own lines.
 *
 * Documents go through LED-10's `sourceRoute` — the one table of "which page
 * shows this document" — so a report row and the khata line for the same bill
 * open the same page. A credit note opens SAL-04's own detail route: a report
 * row's `type` names it (`credit_note`, `credit_note_void`) and is passed on
 * as the document kind, which `sourceRoute` turns into
 * `ROUTES.SALES_CREDIT_NOTES`. A stock adjustment has no page of its own
 * (INV-06 shows it only in each item's movements), so its row links nowhere
 * rather than to a page that would 404.
 */
export const sourceHref = (
  source: SourceRef,
  number: string | null,
  rowType: string | null = null
): string | null => {
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
        kind: rowType?.startsWith('credit_note') ? 'credit_note' : null,
      });
    case 'stock_adjustment':
    default:
      return null;
  }
};
