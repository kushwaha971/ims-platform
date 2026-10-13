import type { ModuleCode, PermissionCode } from 'src/types/domain.types';

import type { ImportKind } from '../types/import.types';

/**
 * IMP-01 §12 — who may import each kind. Imports nothing but types, because
 * the parties and items list headers read it to decide whether to DRAW the
 * Import action (§19.7.5 — hidden, not disabled), and anything this module
 * imported would land in those routes' chunks. The wizard's own per-kind
 * configuration (`importKinds.ts`) builds on it.
 *
 * The permissions mirror the server's `ImporterSpec.required_permissions`:
 * the server decides, and this only decides what is drawn.
 */
export interface ImportAccess {
  readonly write: readonly PermissionCode[];
  readonly read: PermissionCode;
  readonly modules: readonly ModuleCode[];
}

export const IMPORT_ACCESS: Readonly<Record<ImportKind, ImportAccess>> = {
  parties: {
    write: ['parties.party.write', 'ledger.entry.write'],
    read: 'parties.party.read',
    // `sales` is the Shop's anchor: a reading room that has parties and a ledger is
    // not offered the Shop's customers and suppliers (QA F10 look, DEC-019).
    modules: ['import_export', 'parties', 'ledger', 'sales'],
  },
  items: {
    write: ['inventory.item.write'],
    read: 'inventory.item.read',
    modules: ['import_export', 'inventory'],
  },
  // QA F10 — a reading room's register and a lender's, through F1's and F8's services.
  students: {
    write: ['library.member.write'],
    read: 'library.member.read',
    modules: ['import_export', 'library'],
  },
  loans: {
    write: ['lending.loan.create'],
    read: 'lending.loan.read',
    modules: ['import_export', 'lending'],
  },
};

export const isImportKind = (value: string | null | undefined): value is ImportKind =>
  value === 'parties' || value === 'items' || value === 'students' || value === 'loans';
