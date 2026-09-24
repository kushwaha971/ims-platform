import {
  fetchActors,
  fetchAuditRows,
} from 'modules/DigiKhaato/features/audit-log/redux/auditLogThunk';
import {
  confirmPasswordReset,
  passwordLogin,
  registerAccount,
  requestPasswordReset,
  setPassword,
} from 'modules/DigiKhaato/features/auth/redux/authThunk';
import {
  fetchSession,
  logout,
  switchTenant,
} from 'modules/DigiKhaato/features/auth/redux/sessionThunk';
import {
  fetchBranding,
  saveBranding,
} from 'modules/DigiKhaato/features/branding/redux/brandingThunk';
import {
  fetchBusinessProfile,
  saveBusinessProfile,
} from 'modules/DigiKhaato/features/business-profile/redux/businessProfileThunk';
import { fetchCashbook } from 'modules/DigiKhaato/features/expenses/redux/cashbookThunk';
import {
  createExpense,
  createExpenseCategory,
  fetchExpenseCategories,
  fetchExpenses,
  voidExpense,
} from 'modules/DigiKhaato/features/expenses/redux/expenseThunk';
import {
  exportListCsv,
  fetchExportJob,
} from 'modules/DigiKhaato/features/imports/redux/exportThunk';
import {
  cancelImportJob,
  commitImportJob,
  fetchImportJob,
  uploadImportFile,
} from 'modules/DigiKhaato/features/imports/redux/importThunk';
import {
  archiveItem,
  fetchItemDetail,
  fetchItemList,
  fetchItemMovements,
  restoreItem,
  saveItem,
} from 'modules/DigiKhaato/features/inventory/redux/itemThunk';
import {
  createCategory,
  createUnit,
  fetchCategories,
  fetchTaxRates,
  fetchUnits,
} from 'modules/DigiKhaato/features/inventory/redux/mastersThunk';
import {
  fetchLowStock,
  fetchStockAdjustment,
  fetchStockSummary,
  postStockAdjustment,
} from 'modules/DigiKhaato/features/inventory/redux/stockThunk';
import {
  fetchLedgerAging,
  fetchLedgerSummary,
} from 'modules/DigiKhaato/features/ledger/redux/agingThunk';
import {
  correctEntry,
  fetchEntryHistory,
  fetchPartyEntries,
  postEntry,
  postOpeningBalance,
  reverseEntry,
} from 'modules/DigiKhaato/features/ledger/redux/ledgerEntryThunk';
import {
  fetchPartyStatement,
  fetchStatementAllRows,
  fetchStatementShop,
} from 'modules/DigiKhaato/features/ledger/redux/statementThunk';
import {
  fetchNotifications,
  fetchUnreadCount,
  readAllNotifications,
  readNotification,
} from 'modules/DigiKhaato/features/notifications/redux/notificationThunk';
import {
  completeOnboarding,
  createTenant,
  findResumableBusiness,
  resumeOnboarding,
  saveAddressStep,
  saveBusinessStep,
  saveGstStep,
} from 'modules/DigiKhaato/features/onboarding/redux/onboardingThunk';
import {
  archiveParty,
  bulkArchiveParties,
  restoreParty,
} from 'modules/DigiKhaato/features/parties/redux/partyArchiveThunk';
import {
  fetchPartyDetail,
  saveCollectionDate,
} from 'modules/DigiKhaato/features/parties/redux/partyDetailThunk';
import { saveParty } from 'modules/DigiKhaato/features/parties/redux/partyFormThunk';
import { fetchPartyList } from 'modules/DigiKhaato/features/parties/redux/partyListThunk';
import {
  bulkTagPartiesThunk,
  createPartyTag,
  deletePartyTag,
  fetchPartyTags,
  mergePartyTags,
  updatePartyTag,
} from 'modules/DigiKhaato/features/parties/redux/partyTagThunk';
import { fetchPlanLimits } from 'modules/DigiKhaato/features/plan/redux/planThunk';
import {
  fetchCollectionSummary,
  fetchDueParties,
  fetchPartyReminders,
  fetchReminderHistory,
  fetchReminderPreview,
  fetchReminderSettings,
  markReminderStatus,
  saveReminderSettings,
  sendBulkStep,
  sendManualReminder,
  startBulkReminders,
} from 'modules/DigiKhaato/features/reminders/redux/reminderThunk';
import {
  createInvoiceShareLink,
  deleteInvoiceDraft,
  fetchInvoice,
  fetchInvoices,
  fetchPrintBranding,
  fetchSalesContext,
  fetchUpiIntent,
  issueInvoice,
  saveInvoiceDraft,
} from 'modules/DigiKhaato/features/sales/redux/salesThunk';
import {
  fetchDevices,
  logoutEverywhere,
  renameDevice,
  revokeDevice,
} from 'modules/DigiKhaato/features/sessions/redux/sessionsThunk';
import {
  fetchSettings,
  fetchSettingsDefaults,
  saveSettingsSection,
  toggleModules,
} from 'modules/DigiKhaato/features/settings/redux/settingsThunk';
import {
  fetchInvitations,
  inviteMember,
  revokeInvitation,
} from 'modules/DigiKhaato/features/team/redux/invitationThunk';
import {
  addMember,
  fetchMembers,
  regenerateCredentials,
} from 'modules/DigiKhaato/features/team/redux/memberThunk';
import {
  leaveTenant,
  setDefaultTenant,
} from 'modules/DigiKhaato/features/tenant-switcher/redux/tenantSwitcherThunk';

/**
 * Part 19 §19.3.6 — every async thunk in the codebase is registered exactly
 * once, as a QUERY or a MUTATION. This is what makes completeness CHECKABLE
 * rather than remembered: `invalidation.registry.test.ts` parses every
 * `features/**\/redux/*Thunk.ts`, collects every `createAsyncThunk(` call and
 * fails CI naming any thunk that is in neither list.
 *
 * Sprint 0 has exactly the thunks the chassis and the walking skeleton need.
 * The lists grow one line per thunk; the machinery does not.
 */
export const QUERIES = {
  // session
  fetchSession,
  // PLT-15 — the plan's modules and member count, read from /auth/me
  fetchPlanLimits,
  // parties (the walking skeleton, Part 32 S0-71)
  fetchPartyList,
  // PTY-03 — the khata page's header and info panel
  fetchPartyDetail,
  // PTY-05 — every tag in the tenant, held once for the session
  fetchPartyTags,
  // PLT-05 — the team screen's invitation list
  fetchInvitations,
  // DEC-012 — the team screen's member list
  fetchMembers,
  // LED-01 — one page of a party's khata
  fetchPartyEntries,
  // LED-03 — the correction chain behind ONE entry, for the history sheet
  fetchEntryHistory,
  // LED-04 — one page of a statement, and the whole period for print
  fetchPartyStatement,
  fetchStatementAllRows,
  // UAT D3 — the print sheet's letterhead (GET /tenants/current)
  fetchStatementShop,
  // LED-09 — the aging report, and the two figures above it
  fetchLedgerAging,
  fetchLedgerSummary,
  // PLT-03 FR-9 / NEW-1 — the wizard reads its business back after a reload
  resumeOnboarding,
  // M2 — which unfinished business "Add a business" would continue
  findResumableBusiness,
  // PLT-06 — the settings screen, and the product defaults "Reset" offers
  fetchSettings,
  fetchSettingsDefaults,
  // PLT-07 — the business profile (GET /tenants/current)
  fetchBusinessProfile,
  // WLB-01 — the resolved branding with each value's source
  fetchBranding,
  // PLT-08 — one page of the activity log, and its member filter
  fetchAuditRows,
  fetchActors,
  // PLT-09 — the caller's own live sessions
  fetchDevices,
  // INV-02 / INV-03 — the item list, one item, its movement history
  fetchItemList,
  fetchItemDetail,
  fetchItemMovements,
  // INV-04 — the masters, held once per session
  fetchUnits,
  fetchCategories,
  fetchTaxRates,
  // INV-06 / INV-07 / INV-08
  fetchStockAdjustment,
  fetchStockSummary,
  fetchLowStock,
  // EXP-01 / EXP-02 — the expense list and the category picker
  fetchExpenses,
  fetchExpenseCategories,
  // EXP-03 — the cashbook
  fetchCashbook,
  // LED-05/06/07 — the reminders screen, the khata's strip, the sheet's text
  fetchCollectionSummary,
  fetchDueParties,
  fetchReminderHistory,
  fetchPartyReminders,
  fetchReminderPreview,
  fetchReminderSettings,
  // NTF-01 — the bell's count and the inbox panel
  fetchUnreadCount,
  fetchNotifications,
  // SAL-02/03/06/08 — the bills list, the editor's context, the print sheet
  fetchInvoices,
  fetchInvoice,
  fetchSalesContext,
  fetchUpiIntent,
  fetchPrintBranding,
  // IMP-01 — the job the wizard polls; IMP-02 — a list's CSV and a stored export
  fetchImportJob,
  exportListCsv,
  fetchExportJob,
} as const;

export const MUTATIONS = {
  // platform & settings
  switchTenant,
  logout,
  // CR-2026-09-19-A — email + password sign-up replaces the OTP pair
  registerAccount,
  // DEC-012 — owner-issued credentials
  addMember,
  regenerateCredentials,
  // PLT-02 — password login, set and reset
  passwordLogin,
  setPassword,
  requestPasswordReset,
  confirmPasswordReset,
  // PLT-03 — the onboarding wizard, one mutation per step
  createTenant,
  saveBusinessStep,
  saveGstStep,
  saveAddressStep,
  completeOnboarding,
  // PLT-04 — multiple businesses
  setDefaultTenant,
  leaveTenant,
  // PLT-05 — the team screen
  inviteMember,
  revokeInvitation,
  // PTY-01 — create and edit a party
  saveParty,
  // PTY-03 — the khata page's one editable control
  saveCollectionDate,
  // LED-01 — the write everything else in the ledger is downstream of
  postEntry,
  // LED-02 — the first row of a khata migrated from paper
  postOpeningBalance,
  // LED-03 — the two writes that change a line already in the book
  reverseEntry,
  correctEntry,
  // PTY-04 — archive and restore
  archiveParty,
  restoreParty,
  bulkArchiveParties,
  // PTY-05 — tags
  createPartyTag,
  updatePartyTag,
  deletePartyTag,
  mergePartyTags,
  bulkTagPartiesThunk,
  // PLT-06 — a settings section, and the module switches
  saveSettingsSection,
  toggleModules,
  // PLT-07 — the business profile
  saveBusinessProfile,
  // WLB-01 — branding, and PLT-07's signature through the same endpoint
  saveBranding,
  // PLT-09 — devices
  renameDevice,
  revokeDevice,
  logoutEverywhere,
  // INV-01 / INV-02 — the item master
  saveItem,
  archiveItem,
  restoreItem,
  // INV-04 — inline and settings-page creates
  createUnit,
  createCategory,
  // INV-06 — the write every stock screen is downstream of
  postStockAdjustment,
  // EXP-01 / EXP-02 — record, void, and the inline category create
  createExpense,
  voidExpense,
  createExpenseCategory,
  // LED-06/07/08 — reminders and the two SMS switches
  sendManualReminder,
  startBulkReminders,
  sendBulkStep,
  markReminderStatus,
  saveReminderSettings,
  // NTF-01 — read state
  readNotification,
  readAllNotifications,
  // SAL-02/03/06 — drafts, the issue, the share link
  saveInvoiceDraft,
  issueInvoice,
  deleteInvoiceDraft,
  createInvoiceShareLink,
  // IMP-01 — upload, commit and cancel an import
  uploadImportFile,
  commitImportJob,
  cancelImportJob,
} as const;

export type TQueryName = keyof typeof QUERIES;
export type TMutationName = keyof typeof MUTATIONS;

/** Every registered thunk, for the completeness test and the listener. */
export const REGISTERED_THUNK_NAMES: readonly string[] = [
  ...Object.keys(QUERIES),
  ...Object.keys(MUTATIONS),
];
