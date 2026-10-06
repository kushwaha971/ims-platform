import { API_PATHS } from 'src/api/APIPaths';
import { api, ubConfig } from 'src/api/AxiosInstances';

/**
 * docs/platform/15 §1.4 item 1 — what a bill made. Money stays a string
 * (Part 19 money rule); `null` is "cost not known", never zero.
 */
export interface ProfitLine {
  readonly lineNo: number;
  readonly description: string;
  readonly qty: string;
  readonly returnedQty: string;
  readonly saleValue: string;
  readonly cost: string | null;
  readonly profit: string | null;
  readonly marginPct: string | null;
}

export interface InvoiceProfit {
  readonly lines: readonly ProfitLine[];
  readonly totals: {
    readonly saleValue: string;
    readonly cost: string;
    readonly profit: string;
    readonly marginPct: string | null;
  };
  readonly linesWithoutCost: number;
}

interface Wire {
  readonly lines: readonly {
    line_no: number;
    description: string;
    qty: string;
    returned_qty: string;
    sale_value: string;
    cost: string | null;
    profit: string | null;
    margin_pct: string | null;
  }[];
  readonly totals: { sale_value: string; cost: string; profit: string; margin_pct: string | null };
  readonly lines_without_cost: number;
}

/** GET /sales/invoices/{id}/profit — quiet: the bill reads fine without it. */
export const getInvoiceProfit = async (
  id: string,
  signal?: AbortSignal
): Promise<InvoiceProfit> => {
  const { data } = (
    await api.get<{ data: Wire }>(
      `${API_PATHS.SALES_INVOICE(id)}/profit`,
      ubConfig({ signal, suppressErrorSnackbar: true })
    )
  ).data;
  return {
    lines: data.lines.map((row) => ({
      lineNo: row.line_no,
      description: row.description,
      qty: row.qty,
      returnedQty: row.returned_qty,
      saleValue: row.sale_value,
      cost: row.cost,
      profit: row.profit,
      marginPct: row.margin_pct,
    })),
    totals: {
      saleValue: data.totals.sale_value,
      cost: data.totals.cost,
      profit: data.totals.profit,
      marginPct: data.totals.margin_pct,
    },
    linesWithoutCost: data.lines_without_cost,
  };
};
