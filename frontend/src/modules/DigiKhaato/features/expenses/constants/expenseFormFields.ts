/**
 * The expense form's field names, in a module that imports NOTHING — the
 * party form's lesson: importing field names from the file that holds the Yup
 * schema drags Yup into whatever chunk wanted the names (17 KB, measured).
 */
export const EXPENSE_FORM_FIELDS = [
  'amount',
  'categoryId',
  'expenseDate',
  'paid',
  'mode',
  'upiApp',
  'reference',
  'partyId',
  'dueOn',
  'note',
] as const;

/** Server `details` keys → form field names. */
export const SERVER_FIELD_TO_FORM: Readonly<Record<string, string>> = {
  amount: 'amount',
  category_id: 'categoryId',
  expense_date: 'expenseDate',
  mode: 'mode',
  upi_app: 'upiApp',
  reference: 'reference',
  party_id: 'partyId',
  due_on: 'dueOn',
  note: 'note',
};
