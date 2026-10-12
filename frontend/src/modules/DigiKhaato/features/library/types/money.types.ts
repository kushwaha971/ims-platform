/** Library P0 — a period's money: fees collected by kind, expenses by category, what is left. */
export interface LibraryMoney {
  readonly from: string;
  readonly to: string;
  readonly income: readonly { readonly kind: string; readonly amount: string }[];
  readonly incomeTotal: string;
  readonly expenses: readonly { readonly category: string; readonly amount: string }[];
  readonly expensesTotal: string;
  readonly profit: string;
  /**
   * `meta.has_any` — has the room EVER taken a fee or recorded an expense,
   * whatever the period (approved designs, 12 Oct 2026). Absent from an older
   * server, which must then never be read as "no".
   */
  readonly hasAny?: boolean;
}
