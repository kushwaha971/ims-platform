import { ROUTES } from 'src/routes';
import type { ModuleCode, PermissionCode } from 'src/types/domain.types';

/**
 * The Reports hub's list — DATA, like the sidebar (Part 19 §19.6.2), and in
 * a module that imports nothing heavier than the route table.
 *
 * Only reports that are BUILT are listed (owner rule: no unbuilt features),
 * each gated on the module and every codename its screen needs, so a row is
 * never a door to a 403. Where a report's screen already existed before
 * Reports did — LED-09's aging, INV-08's stock summary, INV-07's low stock,
 * EXP-03's cashbook — the row opens THAT screen; RPT-05/06 are the same
 * selectors, and a second copy of a screen is a second thing to keep right.
 *
 * Track W4-B appends its registers and the GST summary here (a `sales`
 * group), additively.
 */
export type ReportGroup = 'money' | 'parties' | 'stock' | 'sales';

export interface ReportCatalogueEntry {
  /** Names the copy: `reports.shell.hub.<key>.title` / `.description`. */
  readonly key: string;
  readonly group: ReportGroup;
  readonly href: string;
  readonly modules: readonly ModuleCode[];
  readonly permissions: readonly PermissionCode[];
  /** A lucide icon name the hub maps to a component (keeps icons out of this module). */
  readonly icon: 'dayBook' | 'cashbook' | 'receivable' | 'payable' | 'stock' | 'lowStock';
}

export const REPORT_GROUPS: readonly ReportGroup[] = ['money', 'parties', 'stock', 'sales'];

export const REPORT_CATALOGUE: readonly ReportCatalogueEntry[] = [
  {
    key: 'dayBook',
    group: 'money',
    href: ROUTES.REPORT_DAY_BOOK,
    modules: ['reports'],
    permissions: ['reports.basic.read'],
    icon: 'dayBook',
  },
  {
    key: 'cashbook',
    group: 'money',
    href: ROUTES.CASHBOOK,
    modules: ['expenses'],
    permissions: ['expenses.expense.read'],
    icon: 'cashbook',
  },
  {
    key: 'receivablesAging',
    group: 'parties',
    href: ROUTES.LEDGER_AGING,
    modules: ['ledger'],
    permissions: ['ledger.entry.read'],
    icon: 'receivable',
  },
  {
    key: 'payablesAging',
    group: 'parties',
    href: `${ROUTES.LEDGER_AGING}?type=payable`,
    modules: ['ledger'],
    permissions: ['ledger.entry.read'],
    icon: 'payable',
  },
  {
    key: 'stockSummary',
    group: 'stock',
    href: ROUTES.STOCK_SUMMARY,
    modules: ['inventory'],
    permissions: ['inventory.stock.read'],
    icon: 'stock',
  },
  {
    key: 'lowStock',
    group: 'stock',
    href: ROUTES.STOCK_LOW,
    modules: ['inventory'],
    permissions: ['inventory.stock.read'],
    icon: 'lowStock',
  },
];

/** The entries this reader can open, in catalogue order. */
export const visibleReports = (
  entries: readonly ReportCatalogueEntry[],
  can: (permission: PermissionCode) => boolean,
  hasModule: (module: ModuleCode) => boolean
): readonly ReportCatalogueEntry[] =>
  entries.filter(
    (entry) => entry.modules.every(hasModule) && entry.permissions.every((code) => can(code))
  );
