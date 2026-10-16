'use client';

import { UbAsyncCombobox } from 'src/design-system';
import { useAppDispatch } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import { comboPaging } from 'src/utils/searchPaging';

import { useItemSearch } from '../hooks/useItemSearch';

import type { ItemListRow } from '../types/item.types';

/**
 * The item cell of a bill line — search by name or SKU, and the scanner path
 * on Enter (SAL-02 FR-2 / FR-18, PUR-01 FR-3 / AC-2). The sales invoice and
 * the purchase bill drew the same cell twice, word for word but the copy keys.
 *
 * `focusNext` is the line editor's: after a pick, by list or by scanner, the
 * caret goes on to Qty the way a till does. Left on the item trigger, the
 * quantity typed next reopened the search with that digit in it (WP-05).
 */
export function ItemLineCell({
  id,
  label,
  invalid,
  line,
  disabled,
  placeholder,
  emptyLabel,
  onPick,
  focusNext,
}: Readonly<{
  id: string;
  label: string;
  invalid: boolean;
  line: { readonly itemId: string | null; readonly description: string } | undefined;
  disabled: boolean;
  placeholder: string;
  emptyLabel: string;
  onPick: (row: ItemListRow) => void;
  focusNext: () => void;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const search = useItemSearch();
  return (
    <UbAsyncCombobox
      id={id}
      aria-label={label}
      value={line?.itemId ?? null}
      selectedLabel={line?.description}
      query={search.query}
      onQueryChange={search.setQuery}
      onOpen={search.activate}
      paging={comboPaging(search, t)}
      options={search.options}
      loading={search.status === 'loading'}
      pending={search.pending}
      disabled={disabled}
      onSelect={(option) => {
        const row = search.find(option.value);
        if (row) onPick(row);
      }}
      afterPick={focusNext}
      onSubmitQuery={(code) => {
        void search.lookup(code).then((row) => {
          if (row) {
            onPick(row);
            focusNext();
          } else
            dispatch(
              showSnackbar({ severity: 'warning', id: 'items.scan.notFound', params: { code } })
            );
        });
      }}
      placeholder={placeholder}
      searchPlaceholder={t('items.list.searchPlaceholder')}
      emptyLabel={emptyLabel}
      loadingLabel={t('common.loading')}
      invalid={invalid}
    />
  );
}
