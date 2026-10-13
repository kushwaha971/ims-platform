/**
 * DEC-019 (QA B10) — the apps that keep expenses, each its own. The open app is
 * sent with every expense and every list request, so the Library's rent never
 * lands in the Shop's cashbook or the Shop's stock in the Library's profit. An
 * app that keeps none (the Udhaar book) sends nothing and the server decides.
 */
export const EXPENSE_APPS: readonly string[] = ['shop', 'library', 'lending'];

/** The open app's code when it is one that keeps expenses, else `undefined`. */
export const expenseAppOf = (app: string | null | undefined): string | undefined =>
  app && EXPENSE_APPS.includes(app) ? app : undefined;
