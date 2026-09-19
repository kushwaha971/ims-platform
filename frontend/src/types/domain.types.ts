/**
 * Shared enums mirrored from canon §0.3 and §0.9. These are `as const` objects
 * plus derived unions, never TypeScript `enum`s (R-TS-8).
 */

export const LOCALES = ['en', 'hi'] as const;
export type Locale = (typeof LOCALES)[number];

/** Canon §0.3 module map. A module the tenant has not enabled does not exist. */
export const MODULE_CODES = [
  'platform',
  'parties',
  'ledger',
  'inventory',
  'sales',
  'purchases',
  'payments',
  'expenses',
  'reports',
  'notifications',
  'import_export',
  'help',
  'loans',
  'accounting',
] as const;
export type ModuleCode = (typeof MODULE_CODES)[number];

/**
 * Canon §0.9 permission codenames. Sprint 0 carries the subset the walking
 * skeleton and the Sprint 0 sidebar name; the registry grows per feature and
 * the backend's registry test is the authority on the full set.
 */
export const PERMISSION_CODES = [
  'parties.party.read',
  'parties.party.write',
  'ledger.entry.read',
  'ledger.entry.write',
  'inventory.item.read',
  'sales.invoice.read',
  'purchases.bill.read',
  'payments.payment.read',
  'expenses.expense.read',
  'reports.basic.read',
  'platform.members.manage',
  'platform.settings.manage',
] as const;
export type PermissionCode = (typeof PERMISSION_CODES)[number];

export type ThemeMode = 'light' | 'dark';

/** Part 21 §21.3.3 — a party is active or archived; nothing else at MVP. */
export type PartyStatus = 'active' | 'archived';
