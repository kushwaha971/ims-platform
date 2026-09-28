/**
 * Part 19 §19.3.6 — every async thunk in the codebase is registered exactly
 * once, as a QUERY or a MUTATION. This is what makes completeness CHECKABLE
 * rather than remembered: `invalidation.registry.test.ts` parses every
 * `features/**\/redux/*Thunk.ts`, collects every `createAsyncThunk(` call and
 * fails CI naming any thunk that is in neither list.
 *
 * ── Why the values are STRINGS (W4-P, 28 Sep 2026) ──────────────────────────
 * Each entry maps the thunk's name to its `typePrefix` — the first argument of
 * its `createAsyncThunk` — and not to the thunk itself. The listener needs
 * nothing more: a mutation is recognised by `${typePrefix}/fulfilled`, which
 * is a string. Importing the thunks here put every one of them, their services
 * and the message ids they fall back to into the chunk `app/layout` loads —
 * the store imports the listener, the listener imported this file — so the
 * login screen downloaded 145 thunks it can never dispatch. Measured, the
 * thunk modules were ~20 KB gz of the 144.8 KB app shell.
 *
 * A string can drift from the thunk it names, which an import could not. So
 * `invalidation.registry.test.ts` imports every thunk module (tests may) and
 * fails on any entry whose string is not that thunk's `typePrefix`, and on any
 * thunk whose prefix is not here — the same guarantee, checked in CI instead of
 * paid for on every route.
 */
export const QUERIES = {
  // session
  fetchSession: 'session/fetchSession',
  // PLT-15 — the plan's modules and member count, read from /auth/me
  fetchPlanLimits: 'plan/fetchPlanLimits',
  // parties (the walking skeleton, Part 32 S0-71)
  fetchPartyList: 'partyList/fetchPartyList',
  // PTY-03 — the khata page's header and info panel
  fetchPartyDetail: 'partyDetail/fetchPartyDetail',
  // PTY-05 — every tag in the tenant, held once for the session
  fetchPartyTags: 'partyTag/fetchPartyTags',
  // PLT-05 — the team screen's invitation list
  fetchInvitations: 'invitation/fetchInvitations',
  // DEC-012 — the team screen's member list
  fetchMembers: 'member/fetchMembers',
  // LED-01 — one page of a party's khata
  fetchPartyEntries: 'ledgerEntry/fetchPartyEntries',
  // LED-03 — the correction chain behind ONE entry, for the history sheet
  fetchEntryHistory: 'ledgerEntry/fetchEntryHistory',
  // LED-04 — one page of a statement, and the whole period for print
  fetchPartyStatement: 'statement/fetchPartyStatement',
  fetchStatementAllRows: 'statement/fetchStatementAllRows',
  // UAT D3 — the print sheet's letterhead (GET /tenants/current)
  fetchStatementShop: 'statement/fetchStatementShop',
  // LED-09 — the aging report, and the two figures above it
  fetchLedgerAging: 'ledgerAging/fetchLedgerAging',
  fetchLedgerSummary: 'ledgerAging/fetchLedgerSummary',
  // PLT-03 FR-9 / NEW-1 — the wizard reads its business back after a reload
  resumeOnboarding: 'onboarding/resume',
  // M2 — which unfinished business "Add a business" would continue
  findResumableBusiness: 'onboarding/findResumable',
  // PLT-06 — the settings screen, and the product defaults "Reset" offers
  fetchSettings: 'settings/fetch',
  fetchSettingsDefaults: 'settings/fetchDefaults',
  // PLT-07 — the business profile (GET /tenants/current)
  fetchBusinessProfile: 'businessProfile/fetch',
  // WLB-01 — the resolved branding with each value's source
  fetchBranding: 'branding/fetch',
  // PLT-08 — one page of the activity log, and its member filter
  fetchAuditRows: 'auditLog/fetchRows',
  fetchActors: 'auditLog/fetchActors',
  // PLT-09 — the caller's own live sessions
  fetchDevices: 'sessions/fetchDevices',
  // INV-02 / INV-03 — the item list, one item, its movement history
  fetchItemList: 'itemList/fetchItemList',
  fetchItemDetail: 'itemDetail/fetchItemDetail',
  fetchItemMovements: 'itemDetail/fetchItemMovements',
  // INV-04 — the masters, held once per session
  fetchUnits: 'inventoryMasters/fetchUnits',
  fetchCategories: 'inventoryMasters/fetchCategories',
  fetchTaxRates: 'inventoryMasters/fetchTaxRates',
  // INV-06 / INV-07 / INV-08
  fetchStockAdjustment: 'stockAdjustment/fetchStockAdjustment',
  fetchStockSummary: 'stockSummary/fetchStockSummary',
  fetchLowStock: 'stockSummary/fetchLowStock',
  // EXP-01 / EXP-02 — the expense list and the category picker
  fetchExpenses: 'expenseList/fetchExpenses',
  fetchExpenseCategories: 'expenseForm/fetchExpenseCategories',
  // EXP-03 — the cashbook
  fetchCashbook: 'cashbook/fetchCashbook',
  // LED-05/06/07 — the reminders screen, the khata's strip, the sheet's text
  fetchCollectionSummary: 'reminders/fetchCollectionSummary',
  fetchDueParties: 'reminders/fetchDueParties',
  fetchReminderHistory: 'reminders/fetchReminderHistory',
  fetchPartyReminders: 'reminders/fetchPartyReminders',
  fetchReminderPreview: 'reminders/fetchReminderPreview',
  fetchReminderSettings: 'reminders/fetchReminderSettings',
  // NTF-01 — the bell's count and the inbox panel
  fetchUnreadCount: 'notifications/fetchUnreadCount',
  fetchNotifications: 'notifications/fetchNotifications',
  // SAL-02/03/06/08 — the bills list, the editor's context, the print sheet
  fetchInvoices: 'invoiceList/fetchInvoices',
  fetchInvoice: 'invoice/fetchInvoice',
  fetchSalesContext: 'invoiceEditor/fetchSalesContext',
  fetchUpiIntent: 'invoice/fetchUpiIntent',
  fetchPrintBranding: 'invoice/fetchPrintBranding',
  // PUR-01/03 — the bills list, one bill, the editor's context, the duplicate pre-check
  fetchPurchaseBillList: 'purchaseBillList/fetchPurchaseBillList',
  fetchPurchaseBill: 'purchaseBill/fetchPurchaseBill',
  fetchPurchaseContext: 'purchaseBillEditor/fetchPurchaseContext',
  checkDuplicateSupplierInvoice: 'purchaseBillEditor/checkDuplicateSupplierInvoice',
  // IMP-01 — the job the wizard polls; IMP-02 — a list's CSV and a stored export
  // PAY-01 … PAY-05 — the list, the receipt, the open bills, the Collect QR
  fetchPayments: 'paymentList/fetchPayments',
  fetchPayment: 'paymentReceipt/fetchPayment',
  fetchOpenDocuments: 'paymentForm/fetchOpenDocuments',
  fetchCollectQr: 'paymentForm/fetchCollectQr',
  fetchImportJob: 'importJob/fetchImportJob',
  exportListCsv: 'listExport/exportListCsv',
  fetchExportJob: 'listExport/fetchExportJob',
  // PLT-10 — "Your data": the page, one export's poll, the gate's re-read
  fetchAccountData: 'accountData/fetch',
  pollExport: 'accountData/pollExport',
  refreshDeletion: 'accountData/refreshDeletion',
  // PLT-14 — the console's reads
  fetchOverview: 'admin/fetchOverview',
  fetchTenants: 'admin/fetchTenants',
  fetchTenantDetail: 'admin/fetchTenantDetail',
  fetchPartners: 'admin/fetchPartners',
  fetchPlans: 'admin/fetchPlans',
  fetchHealth: 'admin/fetchHealth',
  // SAL-01/04/05 — estimates, credit notes, void (merged after W4-P)
  fetchFlowDocuments: 'salesDocList/fetchFlowDocuments',
  fetchFlowDocument: 'invoice/fetchFlowDocument',
  fetchCreditSource: 'creditNoteEditor/fetchCreditSource',
  fetchOpenInvoices: 'invoice/fetchOpenInvoices',
  // RPT-01/02/05/06/08 — dashboard, day book, reports
  fetchDashboard: 'reportDashboard/fetchDashboard',
  fetchDayBook: 'reportDayBook/fetchDayBook',
} as const;

export const MUTATIONS = {
  // platform & settings
  switchTenant: 'session/switchTenant',
  logout: 'session/logout',
  // CR-2026-09-19-A — email + password sign-up replaces the OTP pair
  registerAccount: 'auth/registerAccount',
  // DEC-012 — owner-issued credentials
  addMember: 'member/addMember',
  regenerateCredentials: 'member/regenerateCredentials',
  // PLT-02 — password login, set and reset
  passwordLogin: 'auth/passwordLogin',
  setPassword: 'auth/setPassword',
  requestPasswordReset: 'auth/requestPasswordReset',
  confirmPasswordReset: 'auth/confirmPasswordReset',
  // PLT-03 — the onboarding wizard, one mutation per step
  createTenant: 'onboarding/createTenant',
  saveBusinessStep: 'onboarding/saveBusinessStep',
  saveGstStep: 'onboarding/saveGstStep',
  saveAddressStep: 'onboarding/saveAddressStep',
  completeOnboarding: 'onboarding/completeOnboarding',
  // PLT-04 — multiple businesses
  setDefaultTenant: 'tenantSwitcher/setDefaultTenant',
  leaveTenant: 'tenantSwitcher/leaveTenant',
  // PLT-05 — the team screen
  inviteMember: 'invitation/inviteMember',
  revokeInvitation: 'invitation/revokeInvitation',
  // PTY-01 — create and edit a party
  saveParty: 'partyForm/save',
  // PTY-03 — the khata page's one editable control
  saveCollectionDate: 'partyDetail/saveCollectionDate',
  // LED-01 — the write everything else in the ledger is downstream of
  postEntry: 'ledgerEntry/postEntry',
  // LED-02 — the first row of a khata migrated from paper
  postOpeningBalance: 'ledgerEntry/postOpeningBalance',
  // LED-03 — the two writes that change a line already in the book
  reverseEntry: 'ledgerEntry/reverseEntry',
  correctEntry: 'ledgerEntry/correctEntry',
  // PTY-04 — archive and restore
  archiveParty: 'partyArchive/archiveParty',
  restoreParty: 'partyArchive/restoreParty',
  bulkArchiveParties: 'partyArchive/bulkArchive',
  // PTY-05 — tags
  createPartyTag: 'partyTag/createPartyTag',
  updatePartyTag: 'partyTag/updatePartyTag',
  deletePartyTag: 'partyTag/deletePartyTag',
  mergePartyTags: 'partyTag/mergePartyTags',
  bulkTagPartiesThunk: 'partyTag/bulkTagParties',
  // PLT-06 — a settings section, and the module switches
  saveSettingsSection: 'settings/saveSection',
  toggleModules: 'settings/toggleModules',
  // PLT-07 — the business profile
  saveBusinessProfile: 'businessProfile/save',
  // WLB-01 — branding, and PLT-07's signature through the same endpoint
  saveBranding: 'branding/save',
  // PLT-09 — devices
  renameDevice: 'sessions/renameDevice',
  revokeDevice: 'sessions/revokeDevice',
  logoutEverywhere: 'sessions/logoutEverywhere',
  // INV-01 / INV-02 — the item master
  saveItem: 'itemForm/saveItem',
  archiveItem: 'itemForm/archiveItem',
  restoreItem: 'itemForm/restoreItem',
  // INV-04 — inline and settings-page creates
  createUnit: 'inventoryMasters/createUnit',
  createCategory: 'inventoryMasters/createCategory',
  // INV-06 — the write every stock screen is downstream of
  postStockAdjustment: 'stockAdjustment/postStockAdjustment',
  // EXP-01 / EXP-02 — record, void, and the inline category create
  createExpense: 'expenseForm/createExpense',
  voidExpense: 'expenseForm/voidExpense',
  createExpenseCategory: 'expenseForm/createExpenseCategory',
  // LED-06/07/08 — reminders and the two SMS switches
  sendManualReminder: 'reminders/sendManualReminder',
  startBulkReminders: 'reminders/startBulkReminders',
  sendBulkStep: 'reminders/sendBulkStep',
  markReminderStatus: 'reminders/markReminderStatus',
  saveReminderSettings: 'reminders/saveReminderSettings',
  // NTF-01 — read state
  readNotification: 'notifications/readNotification',
  readAllNotifications: 'notifications/readAllNotifications',
  // SAL-02/03/06 — drafts, the issue, the share link
  saveInvoiceDraft: 'invoiceEditor/saveInvoiceDraft',
  issueInvoice: 'invoiceEditor/issueInvoice',
  deleteInvoiceDraft: 'invoiceEditor/deleteInvoiceDraft',
  createInvoiceShareLink: 'invoice/createInvoiceShareLink',
  recordPayment: 'paymentForm/recordPayment',
  voidPayment: 'paymentReceipt/voidPayment',
  shareReceipt: 'paymentReceipt/shareReceipt',
  // PUR-01/04 — bill drafts, record and void
  savePurchaseBillDraft: 'purchaseBillEditor/savePurchaseBillDraft',
  deletePurchaseBillDraft: 'purchaseBillEditor/deletePurchaseBillDraft',
  recordPurchaseBill: 'purchaseBillEditor/recordPurchaseBill',
  voidPurchaseBill: 'purchaseBill/voidPurchaseBill',
  // IMP-01 — upload, commit and cancel an import
  uploadImportFile: 'importJob/uploadImportFile',
  commitImportJob: 'importJob/commitImportJob',
  cancelImportJob: 'importJob/cancelImportJob',
  // PLT-10 — export, deletion and its cancel, and the owner's consent
  requestExport: 'accountData/requestExport',
  requestDeletion: 'accountData/requestDeletion',
  cancelDeletion: 'accountData/cancelDeletion',
  decideSupportAccess: 'accountData/decideSupport',
  // PLT-14 — the console's writes
  updateTenant: 'admin/updateTenant',
  requestSupportAccess: 'admin/requestAccess',
  startImpersonation: 'admin/startImpersonation',
  endImpersonation: 'admin/endImpersonation',
  // SAL-01/04/05 — estimates, credit notes, void (merged after W4-P)
  saveEstimateDraft: 'invoiceEditor/saveEstimateDraft',
  deleteEstimateDraft: 'invoiceEditor/deleteEstimateDraft',
  moveEstimate: 'invoice/moveEstimate',
  convertEstimate: 'invoice/convertEstimate',
  issueCreditNote: 'creditNoteEditor/issueCreditNote',
  applyCreditNote: 'invoice/applyCreditNote',
  voidInvoice: 'invoice/voidInvoice',
  voidCreditNote: 'invoice/voidCreditNote',
} as const;

export type TQueryName = keyof typeof QUERIES;
export type TMutationName = keyof typeof MUTATIONS;

/** Every registered thunk, for the completeness test and the listener. */
export const REGISTERED_THUNK_NAMES: readonly string[] = [
  ...Object.keys(QUERIES),
  ...Object.keys(MUTATIONS),
];
