/**
 * The form's field names, in a module that imports NOTHING.
 *
 * They lived next to the Yup schema, which is where they belong by subject and
 * exactly the wrong place by dependency: `usePartyForm` needs only these two
 * constants, and importing them from `partySchemas.ts` pulled Yup and the whole
 * central validation hook into the `/parties` route chunk — 17 KB gz paid by
 * every merchant opening the list to READ it, for a form most of them never
 * open.
 *
 * Module-level imports tree-shake BETWEEN modules and not within one, so the
 * only fix is a module boundary. This is it.
 */

/** The RHF paths this form owns, so `applyServerErrors()` knows what to anchor. */
export const PARTY_FIELDS = [
  'name',
  'mobile',
  'altPhone',
  'email',
  'displayCode',
  'gstin',
  'stateCode',
  'billingLine1',
  'billingCity',
  'billingPincode',
  'notes',
  'creditLimit',
  'creditDays',
  'collectionDate',
  'openingAmount',
] as const;

/**
 * Server field names that are not the form's own path, mapped back.
 *
 * `billing_address` anchors on the line-1 field rather than an invented
 * "address" path, because that is the box a merchant will look at when told the
 * address is wrong.
 */
export const SERVER_FIELD_TO_FORM: Readonly<Record<string, string>> = {
  alt_phone: 'altPhone',
  display_code: 'displayCode',
  state_code: 'stateCode',
  credit_limit: 'creditLimit',
  credit_days: 'creditDays',
  collection_date: 'collectionDate',
  billing_address: 'billingLine1',
  opening_balance_amount: 'openingAmount',
};
