'use client';

import { useMemo, useState } from 'react';

import { useFieldArray, useForm } from 'react-hook-form';

import {
  UbAsyncCombobox,
  UbCard,
  UbLineItemsEditor,
  UbQuantityInput,
  UbStack,
  UbText,
  UbTextInput,
  type UbLineItemsColumn,
} from 'src/design-system';

/**
 * Sprint 4 (INV) — the line-items editor and the two controls it is built
 * from, in the gallery. The editor's first product caller is INV-06's stock
 * adjustment drawer; SAL-02 and PUR-01 reuse it with more columns. The demo
 * keeps its own tiny catalogue so the gallery makes no request.
 */
const CATALOGUE = [
  { value: 'rice', label: 'Basmati Rice', description: 'BASMATI-RICE-0001 · KGS' },
  { value: 'dal', label: 'Toor Dal', description: 'TOOR-DAL-0001 · KGS' },
  { value: 'soap', label: 'Bath Soap 100g', description: 'BATH-SOAP-0001 · NOS' },
];

interface DemoLine {
  item: string;
  qty: string;
}

export function DesignSystemLineItemsGallery(): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [qty, setQty] = useState('');
  const { control } = useForm<{ lines: DemoLine[] }>({
    defaultValues: { lines: [{ item: 'Basmati Rice', qty: '2.5' }] },
  });
  const fieldArray = useFieldArray({ control, name: 'lines', keyName: 'key' });

  const options = CATALOGUE.filter((option) =>
    option.label.toLowerCase().includes(query.trim().toLowerCase())
  );

  const columns = useMemo<UbLineItemsColumn[]>(
    () => [
      {
        id: 'item',
        header: 'Item',
        field: 'item',
        card: 'title',
        track: 'minmax(10rem,3fr)',
        render: ({ field, id, label }) => (
          <UbTextInput
            id={id}
            aria-label={label}
            placeholder="Item name"
            value={String(field?.value ?? '')}
            onChange={(value) => field?.onChange(value)}
          />
        ),
      },
      {
        id: 'qty',
        header: 'Qty',
        field: 'qty',
        align: 'end',
        render: ({ field, id, label }) => (
          <UbQuantityInput
            id={id}
            aria-label={label}
            placeholder="0"
            unit="KGS"
            value={String(field?.value ?? '')}
            onChange={(value) => field?.onChange(value)}
          />
        ),
      },
    ],
    []
  );

  return (
    <>
      <UbCard
        title="UbLineItemsEditor"
        description="Enter → next cell (a new line from the last one) · ↑/↓ same column · Alt+N add · Alt+Backspace remove · Ctrl+Enter submit. Cards below md."
      >
        <UbLineItemsEditor<{ lines: DemoLine[] }, 'lines'>
          control={control}
          name="lines"
          fieldArray={fieldArray}
          columns={columns}
          newLine={() => ({ item: '', qty: '' })}
          labels={{
            addLine: 'Add line',
            removeLine: (n) => `Remove line ${n}`,
            lineLabel: (n) => `line ${n}`,
            empty: 'No lines yet',
          }}
        />
      </UbCard>
      <UbCard
        title="UbAsyncCombobox · UbQuantityInput"
        description="A server-backed picker (the caller owns the query and filtering; Enter on a query is a scan) and a quantity that refuses what its unit cannot hold."
      >
        <UbStack gap={3} className="max-w-sm">
          <UbAsyncCombobox
            aria-label="Item"
            value={picked}
            selectedLabel={CATALOGUE.find((option) => option.value === picked)?.label}
            query={query}
            onQueryChange={setQuery}
            options={options}
            onSelect={(option) => setPicked(option.value)}
            onCreate={() => setPicked(null)}
            createLabel={(text) => `Create item "${text}"`}
            placeholder="Search or scan an item"
            searchPlaceholder="Name, SKU or barcode"
            emptyLabel="No item matches"
          />
          <UbQuantityInput
            aria-label="Whole-number quantity"
            placeholder="0"
            decimals={0}
            unit="NOS"
            value={qty}
            onChange={setQty}
          />
          <UbText variant="caption" tone="tertiary">
            {`picked=${picked ?? '—'} · qty=${qty || '—'}`}
          </UbText>
        </UbStack>
      </UbCard>
    </>
  );
}
