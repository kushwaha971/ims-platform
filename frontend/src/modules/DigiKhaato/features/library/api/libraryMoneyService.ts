import { api } from 'src/api/AxiosInstances';
import { toQueryString } from 'src/utils/queryString';

import { LIBRARY_PATHS } from './libraryPaths';

import type { LibraryMoney } from '../types/money.types';

type Wire = Record<string, unknown>;
const s = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

/** Library P0 — `GET /library/profit?from&to`. */
export const getLibraryMoney = async (
  from: string,
  to: string,
  signal?: AbortSignal
): Promise<LibraryMoney> => {
  const response = await api.get<{ data: Wire }>(
    `${LIBRARY_PATHS.PROFIT}${toQueryString({ from, to })}`,
    { signal }
  );
  const d = response.data.data;
  return {
    from: s(d.from),
    to: s(d.to),
    income: ((d.income ?? []) as Wire[]).map((r) => ({ kind: s(r.kind), amount: s(r.amount) })),
    incomeTotal: s(d.income_total),
    expenses: ((d.expenses ?? []) as Wire[]).map((r) => ({
      category: s(r.category),
      amount: s(r.amount),
    })),
    expensesTotal: s(d.expenses_total),
    profit: s(d.profit),
  };
};
