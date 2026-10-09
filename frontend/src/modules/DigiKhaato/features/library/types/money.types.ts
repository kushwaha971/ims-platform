/** Library P0 — a period's money: fees collected by kind, expenses by category, what is left. */
export interface LibraryMoney {
  readonly from: string;
  readonly to: string;
  readonly income: readonly { readonly kind: string; readonly amount: string }[];
  readonly incomeTotal: string;
  readonly expenses: readonly { readonly category: string; readonly amount: string }[];
  readonly expensesTotal: string;
  readonly profit: string;
}
