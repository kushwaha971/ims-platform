'use client';

import { useCallback, useEffect, useMemo } from 'react';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';

import {
  selectCategories,
  selectCategoriesStatus,
  selectMastersStatus,
  selectTaxRates,
  selectUnits,
} from '../redux/inventoryMastersSlice';
import {
  createCategory,
  createUnit,
  fetchCategories,
  fetchTaxRates,
  fetchUnits,
} from '../redux/mastersThunk';

import type { Category, TaxRate, Unit } from '../types/item.types';

/**
 * Units, categories and tax rates for whichever screen needs them. Each is
 * fetched once per session (the thunks' `condition`), so the list, the form
 * and the masters page asking at once still cost one request each.
 *
 * `includeTaxCode` keeps a legacy slab already on the item in the select.
 */
export interface UseInventoryMastersResult {
  readonly units: readonly Unit[];
  readonly categories: readonly Category[];
  /** Top-level and children flattened, children labelled "Parent › Child". */
  readonly categoryOptions: readonly { readonly value: string; readonly label: string }[];
  readonly taxRates: readonly TaxRate[];
  readonly loading: boolean;
  readonly categoriesLoading: boolean;
  readonly canWrite: boolean;
  readonly addUnit: (input: { code: string; name: string; allowDecimal: boolean }) => Promise<Unit>;
  readonly addCategory: (name: string, parentId?: string | null) => Promise<Category>;
  readonly reloadCategories: () => void;
}

export const flattenCategories = (
  categories: readonly Category[]
): readonly { readonly value: string; readonly label: string }[] =>
  categories.flatMap((parent) => [
    { value: parent.id, label: parent.name },
    ...parent.children.map((child) => ({
      value: child.id,
      label: `${parent.name} › ${child.name}`,
    })),
  ]);

export function useInventoryMasters(
  options: { readonly includeTaxCode?: string | null; readonly withTaxRates?: boolean } = {}
): UseInventoryMastersResult {
  const dispatch = useAppDispatch();
  const { can } = usePermissions();
  const units = useAppSelector(selectUnits);
  const categories = useAppSelector(selectCategories);
  const taxRates = useAppSelector(selectTaxRates);
  const status = useAppSelector(selectMastersStatus);
  const categoriesStatus = useAppSelector(selectCategoriesStatus);
  const { includeTaxCode = null, withTaxRates = false } = options;

  useEffect(() => {
    void dispatch(fetchUnits());
    void dispatch(fetchCategories());
  }, [dispatch]);

  useEffect(() => {
    if (!withTaxRates) return undefined;
    const promise = dispatch(fetchTaxRates({ include: includeTaxCode ? [includeTaxCode] : [] }));
    return () => promise.abort();
  }, [dispatch, withTaxRates, includeTaxCode]);

  const addUnit = useCallback(
    (input: { code: string; name: string; allowDecimal: boolean }) =>
      dispatch(createUnit(input)).unwrap(),
    [dispatch]
  );
  const addCategory = useCallback(
    async (name: string, parentId?: string | null) =>
      (await dispatch(createCategory({ name, parentId })).unwrap()).category,
    [dispatch]
  );
  const reloadCategories = useCallback(() => {
    void dispatch(fetchCategories({ force: true }));
  }, [dispatch]);

  const categoryOptions = useMemo(() => flattenCategories(categories), [categories]);

  return useMemo(
    () => ({
      units,
      categories,
      categoryOptions,
      taxRates,
      loading: status === 'loading' || status === 'idle',
      categoriesLoading: categoriesStatus === 'loading' || categoriesStatus === 'idle',
      canWrite: can('inventory.item.write'),
      addUnit,
      addCategory,
      reloadCategories,
    }),
    [
      units,
      categories,
      categoryOptions,
      taxRates,
      status,
      categoriesStatus,
      can,
      addUnit,
      addCategory,
      reloadCategories,
    ]
  );
}
