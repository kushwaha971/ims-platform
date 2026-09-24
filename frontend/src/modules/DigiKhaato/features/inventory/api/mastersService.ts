import { API_PATHS } from 'src/api/APIPaths';
import { api, ubConfig } from 'src/api/AxiosInstances';
import { toQueryString } from 'src/utils/queryString';

import type { Category, HsnCode, TaxRate, Unit } from '../types/item.types';

/** INV-04 masters and the tax reference reads the item form needs. */

interface UnitWire {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly allow_decimal: boolean;
  readonly is_system: boolean;
  readonly is_uqc: boolean;
}

interface CategoryWire {
  readonly id: string;
  readonly name: string;
  readonly parent_id: string | null;
  readonly item_count: number;
  readonly children?: readonly CategoryWire[];
}

interface TaxRateWire {
  readonly code: string;
  readonly name: string;
  readonly rate: string;
  readonly cess_rate: string;
  readonly effective_from: string;
  readonly effective_to: string | null;
  readonly is_current: boolean;
}

export const toUnit = (row: UnitWire): Unit => ({
  id: row.id,
  code: row.code,
  name: row.name,
  allowDecimal: row.allow_decimal,
  isSystem: row.is_system,
  isUqc: row.is_uqc,
});

const toCategory = (row: CategoryWire): Category => ({
  id: row.id,
  name: row.name,
  parentId: row.parent_id,
  itemCount: row.item_count,
  children: (row.children ?? []).map(toCategory),
});

export const listUnits = async (signal?: AbortSignal): Promise<readonly Unit[]> => {
  const response = await api.get<{ data: readonly UnitWire[] }>(
    API_PATHS.UNITS,
    ubConfig({ signal })
  );
  return response.data.data.map(toUnit);
};

export const createUnit = async (input: {
  readonly code: string;
  readonly name: string;
  readonly allowDecimal: boolean;
}): Promise<Unit> => {
  const response = await api.post<{ data: UnitWire }>(API_PATHS.UNITS, {
    code: input.code,
    name: input.name,
    allow_decimal: input.allowDecimal,
  });
  return toUnit(response.data.data);
};

export const listCategories = async (signal?: AbortSignal): Promise<readonly Category[]> => {
  const response = await api.get<{ data: readonly CategoryWire[] }>(
    API_PATHS.CATEGORIES,
    ubConfig({ signal })
  );
  return response.data.data.map(toCategory);
};

/** POST /categories — a case-insensitive sibling match answers 200 with the existing row (EC-2). */
export const createCategory = async (input: {
  readonly name: string;
  readonly parentId?: string | null;
}): Promise<{ readonly category: Category; readonly created: boolean }> => {
  const response = await api.post<{ data: CategoryWire; meta?: { created?: boolean } }>(
    API_PATHS.CATEGORIES,
    { name: input.name, parent_id: input.parentId ?? null }
  );
  return { category: toCategory(response.data.data), created: response.data.meta?.created ?? true };
};

export const listTaxRates = async (
  asOf: string | undefined,
  include: readonly string[],
  signal?: AbortSignal
): Promise<readonly TaxRate[]> => {
  const response = await api.get<{ data: readonly TaxRateWire[] }>(
    `${API_PATHS.TAX_RATES}${toQueryString({ as_of: asOf, include: include.join(',') || undefined })}`,
    ubConfig({ signal })
  );
  return response.data.data.map((row) => ({
    code: row.code,
    name: row.name,
    rate: row.rate,
    cessRate: row.cess_rate,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    isCurrent: row.is_current,
  }));
};

export const searchHsn = async (q: string, signal?: AbortSignal): Promise<readonly HsnCode[]> => {
  const response = await api.get<{
    data: readonly {
      code: string;
      description: string;
      default_tax_code: string | null;
      is_service: boolean;
    }[];
  }>(`${API_PATHS.TAX_HSN}${toQueryString({ q })}`, ubConfig({ signal }));
  return response.data.data.map((row) => ({
    code: row.code,
    description: row.description,
    defaultTaxCode: row.default_tax_code,
    isService: row.is_service,
  }));
};
