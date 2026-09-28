'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm, useWatch } from 'react-hook-form';

import {
  UbAsyncCombobox,
  UbButton,
  UbChoiceChips,
  UbCombobox,
  UbDateInput,
  UbDisclosure,
  UbDrawer,
  UbField,
  UbForm,
  UbMoneyInput,
  UbQuantityInput,
  UbSelect,
  UbStatusBanner,
  UbSwitch,
  UbText,
  UbTextInput,
  isoFinancialYearStart,
  isoToday,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';

import { lookupItemByBarcode } from '../api/itemService';
import { searchHsn } from '../api/mastersService';
import { DEFAULT_TAX_CODE, DEFAULT_UNIT_CODE } from '../constants/inventoryConstants';
import { useInventoryMasters } from '../hooks/useInventoryMasters';
import { useInventorySchemas } from '../validation/inventorySchemas';
import { looksLikeBarcode, skuPrefix } from '../view-model/itemDisplay';

import type { UseItemFormResult } from '../hooks/useItemForm';
import type { HsnCode, ItemFormValues } from '../types/item.types';

/**
 * INV-01 — create and edit an item, in a drawer (`dynamic()` from the pages
 * that open it: react-hook-form, Yup and a dozen controls belong in the chunk
 * that OPENS the form, not in the list a merchant opens to read).
 *
 * The fast path is name → type → unit → price → save; everything else sits in
 * disclosures below. Category and unit create inline (FR-9); the HSN picker
 * fills the GST rate unless the merchant already chose one (FR-5); a scanner
 * Enter inside Barcode checks for a duplicate instead of submitting (FR-11).
 */
export function ItemFormDrawer({
  form: itemForm,
}: Readonly<{ form: UseItemFormResult }>): React.JSX.Element {
  const { t } = useTranslation();
  const formId = useId();
  const {
    open,
    isEdit,
    editing,
    prefillBarcode,
    prefillName,
    isSaving,
    canWrite,
    canAdjust,
    formErrors,
    staleVersion,
    close,
    submit,
  } = itemForm;
  const masters = useInventoryMasters({
    includeTaxCode: editing?.taxCode ?? null,
    withTaxRates: open,
  });
  const { itemSchema } = useInventorySchemas(masters.units);

  const defaultUnitId = useMemo(
    () => masters.units.find((unit) => unit.code === DEFAULT_UNIT_CODE)?.id ?? '',
    [masters.units]
  );

  const defaults = useMemo<ItemFormValues>(
    () => ({
      name: editing?.name ?? prefillName,
      itemType: editing?.itemType ?? 'goods',
      categoryId: editing?.category?.id ?? '',
      unitId: editing?.unit.id ?? defaultUnitId,
      sku: editing?.sku ?? '',
      barcode: editing?.barcode ?? prefillBarcode,
      hsnSac: editing?.hsnSac ?? '',
      taxCode: editing?.taxCode ?? DEFAULT_TAX_CODE,
      taxInclusiveSelling: editing?.taxInclusiveSelling ?? false,
      sellingPrice: editing?.sellingPrice ?? '',
      purchasePrice: editing?.purchasePrice ?? '',
      mrp: editing?.mrp ?? '',
      trackStock: editing?.trackStock ?? true,
      reorderPoint: editing?.reorderPoint ?? '',
      description: editing?.description ?? '',
      openingQty: '',
      openingCost: '',
      openingAsOf: isoToday(),
    }),
    [editing, prefillBarcode, prefillName, defaultUnitId]
  );

  const form = useForm<ItemFormValues>({
    resolver: yupResolver(itemSchema),
    mode: 'onTouched',
    defaultValues: defaults,
  });
  const { reset, setError, setValue, getValues, formState, control } = form;

  useEffect(() => {
    if (open) reset(defaults);
  }, [open, reset, defaults]);

  const itemType = useWatch({ control, name: 'itemType' });
  const trackStock = useWatch({ control, name: 'trackStock' });
  const unitId = useWatch({ control, name: 'unitId' });
  const name = useWatch({ control, name: 'name' });
  const isService = itemType === 'service';
  const unit = masters.units.find((row) => row.id === unitId);
  const decimals = unit?.allowDecimal ? 3 : 0;
  const showOpening =
    !isService && trackStock && (!isEdit || (editing !== null && !editing.trackStock));

  // ── HSN picker (FR-4/FR-5) ────────────────────────────────────────────────
  const [hsnQuery, setHsnQuery] = useState('');
  const [hsnResults, setHsnResults] = useState<readonly HsnCode[]>([]);
  const [hsnHint, setHsnHint] = useState<string | null>(null);
  useEffect(() => {
    const term = hsnQuery.trim();
    if (!term) return undefined;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      searchHsn(term, controller.signal)
        .then(setHsnResults)
        .catch(() => undefined);
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [hsnQuery]);
  const hsnOptions = useMemo(
    () =>
      (hsnQuery.trim() ? hsnResults : []).map((row) => ({
        value: row.code,
        label: `${row.code} — ${row.description}`,
      })),
    [hsnResults, hsnQuery]
  );
  const pickHsn = useCallback(
    (code: string) => {
      setValue('hsnSac', code, { shouldDirty: true, shouldValidate: true });
      const row = hsnResults.find((candidate) => candidate.code === code);
      if (row?.defaultTaxCode && !formState.dirtyFields.taxCode) {
        setValue('taxCode', row.defaultTaxCode, { shouldDirty: false });
        setHsnHint(t('items.form.tax.fromHsn', { code }));
      }
    },
    [setValue, hsnResults, formState.dirtyFields.taxCode, t]
  );

  // ── Barcode duplicate check (FR-11) ───────────────────────────────────────
  const [barcodeHint, setBarcodeHint] = useState<{ tone: 'ok' | 'taken'; text: string } | null>(
    null
  );
  const checkBarcode = useCallback(async () => {
    const code = getValues('barcode').trim();
    if (code.length < 4) return;
    const hit = await lookupItemByBarcode(code).catch(() => null);
    if (hit && hit.id !== editing?.id) {
      setBarcodeHint({ tone: 'taken', text: t('items.form.barcode.taken', { name: hit.name }) });
    } else {
      setBarcodeHint({ tone: 'ok', text: t('items.form.barcode.available') });
    }
  }, [getValues, editing, t]);

  const taxOptions = useMemo(
    () =>
      masters.taxRates.map((rate) => ({
        value: rate.code,
        label: rate.isCurrent ? rate.name : t('items.form.tax.legacyOption', { name: rate.name }),
      })),
    [masters.taxRates, t]
  );
  const unitOptions = useMemo(
    () => masters.units.map((row) => ({ value: row.id, label: `${row.code} — ${row.name}` })),
    [masters.units]
  );
  const legacyRate = masters.taxRates.find(
    (rate) => rate.code === editing?.taxCode && !rate.isCurrent
  );

  const createCategoryInline = useCallback(
    async (text: string) => {
      const category = await masters.addCategory(text).catch(() => null);
      if (category) setValue('categoryId', category.id, { shouldDirty: true });
    },
    [masters, setValue]
  );
  const createUnitInline = useCallback(
    async (text: string) => {
      const code = text
        .replace(/[^A-Za-z0-9]/g, '')
        .toUpperCase()
        .slice(0, 8);
      const created = await masters
        .addUnit({ code: code || 'UNIT', name: text, allowDecimal: false })
        .catch(() => null);
      if (created) setValue('unitId', created.id, { shouldDirty: true, shouldValidate: true });
    },
    [masters, setValue]
  );

  const handleSubmit = useCallback(
    async (values: ItemFormValues) => {
      await submit(values, setError);
    },
    [submit, setError]
  );

  const typeOptions = useMemo(
    () => [
      { value: 'goods' as const, label: t('items.form.type.goods') },
      { value: 'service' as const, label: t('items.form.type.service') },
    ],
    [t]
  );

  return (
    <UbDrawer
      open={open}
      onOpenChange={(next) => (next ? undefined : close())}
      title={isEdit ? t('items.form.title.edit') : t('items.form.title.new')}
      closeLabel={t('common.action.close')}
      dismissOnBackdrop={!formState.isDirty}
      footer={
        <>
          <UbButton variant="secondary" onClick={close} disabled={isSaving}>
            {t('common.action.cancel')}
          </UbButton>
          <UbButton
            type="submit"
            form={formId}
            busy={isSaving}
            busyLabel={t('items.form.saving')}
            disabled={!canWrite}
          >
            {t('items.form.save')}
          </UbButton>
        </>
      }
    >
      <UbForm id={formId} form={form} onSubmit={handleSubmit} formErrors={formErrors}>
        {staleVersion && (
          <UbStatusBanner
            tone="warning"
            title={t('items.form.stale.title')}
            description={t('items.form.stale.body')}
          />
        )}

        <UbField
          name="name"
          label={t('items.form.name.label')}
          placeholder={t('items.form.name.placeholder')}
          required
        >
          {(field) => <UbTextInput {...field} autoFocus autoComplete="off" maxLength={160} />}
        </UbField>
        {looksLikeBarcode(name ?? '') && !isService && (
          <UbStatusBanner
            tone="info"
            title={t('items.form.name.looksLikeBarcode')}
            action={
              <UbButton
                variant="secondary"
                size="sm"
                onClick={() => {
                  setValue('barcode', getValues('name').trim(), { shouldDirty: true });
                  setValue('name', '', { shouldDirty: true });
                }}
              >
                {t('items.form.name.moveToBarcode')}
              </UbButton>
            }
          />
        )}

        <UbField name="itemType" label={t('items.form.type.label')}>
          {(field) => (
            <UbChoiceChips<'goods' | 'service'>
              value={field.value as 'goods' | 'service'}
              onChange={(next) => {
                field.onChange(next);
                if (next === 'service') setValue('trackStock', false);
                else if (!isEdit) setValue('trackStock', true);
              }}
              options={typeOptions}
              ariaLabel={t('items.form.type.label')}
              disabled={isEdit}
            />
          )}
        </UbField>

        <UbField
          name="unitId"
          label={t('items.form.unit.label')}
          placeholder={t('items.form.unit.placeholder')}
          required
        >
          {(field) => (
            <UbCombobox
              {...field}
              value={field.value as string}
              options={unitOptions}
              searchPlaceholder={t('items.form.unit.search')}
              emptyLabel={t('items.form.unit.empty')}
              onCreate={masters.canWrite ? createUnitInline : undefined}
              createLabel={(text) => t('items.form.createInline', { text })}
              disabled={isEdit && Boolean(editing?.hasMovements)}
            />
          )}
        </UbField>

        <UbField
          name="sellingPrice"
          label={t('items.form.sellingPrice.label')}
          placeholder={t('items.form.price.placeholder')}
        >
          {(field) => <UbMoneyInput {...field} />}
        </UbField>

        <UbField
          name="categoryId"
          label={t('items.form.category.label')}
          placeholder={t('items.form.category.placeholder')}
        >
          {(field) => (
            <UbCombobox
              {...field}
              value={field.value as string}
              options={masters.categoryOptions}
              searchPlaceholder={t('items.form.category.search')}
              emptyLabel={t('items.form.category.empty')}
              onCreate={masters.canWrite ? createCategoryInline : undefined}
              createLabel={(text) => t('items.form.createInline', { text })}
            />
          )}
        </UbField>

        <UbDisclosure
          label={t('items.form.section.tax')}
          open={Boolean(formState.errors.hsnSac || formState.errors.taxCode) || undefined}
        >
          <UbField
            name="hsnSac"
            label={t(isService ? 'items.form.sac.label' : 'items.form.hsn.label')}
            placeholder={t('items.form.hsn.placeholder')}
          >
            {(field) => (
              <UbAsyncCombobox
                id={field.id}
                value={(field.value as string) || null}
                selectedLabel={field.value as string}
                query={hsnQuery}
                onQueryChange={setHsnQuery}
                options={hsnOptions}
                onSelect={(option) => pickHsn(option.value)}
                onSubmitQuery={(typed) => pickHsn(typed)}
                onCreate={(typed) => pickHsn(typed)}
                createLabel={(typed) => t('items.form.hsn.useTyped', { code: typed })}
                placeholder={t('items.form.hsn.placeholder')}
                searchPlaceholder={t('items.form.hsn.search')}
                emptyLabel={t('items.form.hsn.empty')}
                invalid={field.invalid}
                aria-describedby={field['aria-describedby']}
              />
            )}
          </UbField>
          <UbField
            name="taxCode"
            label={t('items.form.tax.label')}
            hint={
              hsnHint ??
              (legacyRate
                ? t('items.form.tax.legacy', { date: legacyRate.effectiveTo ?? '' })
                : undefined)
            }
          >
            {(field) => (
              <UbSelect
                {...field}
                value={field.value as string}
                onChange={(next) => {
                  field.onChange(next);
                  setHsnHint(null);
                }}
                options={taxOptions}
              />
            )}
          </UbField>
          <UbField
            name="taxInclusiveSelling"
            label={t('items.form.taxInclusive.label')}
            controlOwnsLabel
          >
            {(field) => (
              <UbSwitch
                id={field.id}
                checked={Boolean(field.value)}
                onCheckedChange={field.onChange}
                label={t('items.form.taxInclusive.label')}
              />
            )}
          </UbField>
        </UbDisclosure>

        <UbDisclosure label={t('items.form.section.pricing')}>
          {/* Withheld from this member (INV-08 EC-4): an empty box would read
              as "no purchase price" and the save leaves it untouched anyway. */}
          {editing?.purchasePrice !== null && (
            <UbField
              name="purchasePrice"
              label={t('items.form.purchasePrice.label')}
              placeholder={t('items.form.price.placeholder')}
              hint={t('items.form.purchasePrice.hint')}
            >
              {(field) => <UbMoneyInput {...field} />}
            </UbField>
          )}
          {!isService && (
            <UbField
              name="mrp"
              label={t('items.form.mrp.label')}
              placeholder={t('items.form.price.placeholder')}
            >
              {(field) => <UbMoneyInput {...field} />}
            </UbField>
          )}
        </UbDisclosure>

        {!isService && (
          <UbDisclosure
            label={t('items.form.section.stock')}
            open={
              Boolean(
                formState.errors.reorderPoint ||
                formState.errors.openingQty ||
                formState.errors.openingCost
              ) || undefined
            }
          >
            <UbField name="trackStock" label={t('items.form.trackStock.label')} controlOwnsLabel>
              {(field) => (
                <UbSwitch
                  id={field.id}
                  checked={Boolean(field.value)}
                  onCheckedChange={field.onChange}
                  label={t('items.form.trackStock.label')}
                  description={t('items.form.trackStock.hint')}
                  disabled={
                    isEdit &&
                    editing?.trackStock === true &&
                    editing.onHand !== null &&
                    Number(editing.onHand) !== 0
                  }
                />
              )}
            </UbField>
            {trackStock && (
              <UbField
                name="reorderPoint"
                label={t('items.form.reorderPoint.label')}
                placeholder={t('items.form.qty.placeholder')}
                hint={t('items.form.reorderPoint.hint')}
              >
                {(field) => (
                  <UbQuantityInput
                    {...field}
                    value={field.value as string}
                    decimals={decimals}
                    unit={unit?.code}
                  />
                )}
              </UbField>
            )}
            {showOpening && (isEdit ? canAdjust : true) && (
              <>
                <UbText variant="body-sm-medium">{t('items.opening.title')}</UbText>
                <UbField
                  name="openingQty"
                  label={t('items.form.opening.qty')}
                  placeholder={t('items.form.qty.placeholder')}
                >
                  {(field) => (
                    <UbQuantityInput
                      {...field}
                      value={field.value as string}
                      decimals={decimals}
                      unit={unit?.code}
                    />
                  )}
                </UbField>
                <UbField
                  name="openingCost"
                  label={t('items.form.opening.cost')}
                  placeholder={t('items.form.opening.cost.placeholder')}
                  hint={t('items.form.opening.cost.hint', { unit: unit?.code ?? '' })}
                >
                  {(field) => <UbMoneyInput {...field} decimalPlaces={4} />}
                </UbField>
                <UbField
                  name="openingAsOf"
                  label={t('items.form.opening.asOf')}
                  placeholder={t('items.form.date.placeholder')}
                >
                  {(field) => (
                    <UbDateInput
                      {...field}
                      value={field.value as string}
                      max={isoToday()}
                      quickChoicesLabel={t('items.form.opening.quickDates')}
                      quickChoices={[
                        { label: t('items.form.opening.today'), date: isoToday() },
                        { label: t('items.form.opening.fyStart'), date: isoFinancialYearStart() },
                      ]}
                    />
                  )}
                </UbField>
              </>
            )}
          </UbDisclosure>
        )}

        <UbDisclosure
          label={t('items.form.section.identifiers')}
          open={Boolean(formState.errors.sku || formState.errors.barcode) || undefined}
        >
          <UbField
            name="sku"
            label={t('items.form.sku.label')}
            placeholder={t('items.form.sku.placeholder', { prefix: skuPrefix(name ?? '') })}
            hint={isEdit ? undefined : t('items.form.sku.hint')}
          >
            {(field) => (
              <UbTextInput {...field} autoComplete="off" maxLength={48} className="ds-mono" />
            )}
          </UbField>
          {!isService && (
            <UbField
              name="barcode"
              label={t('items.form.barcode.label')}
              placeholder={t('items.form.barcode.placeholder')}
              hint={barcodeHint?.text}
            >
              {(field) => (
                <UbTextInput
                  {...field}
                  autoComplete="off"
                  inputMode="numeric"
                  maxLength={48}
                  onBlur={() => {
                    field.onBlur();
                    void checkBarcode();
                  }}
                  onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
                    /* FR-11 — the scanner's Enter is not a submit. */
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      (event.target as HTMLInputElement).blur();
                    }
                  }}
                />
              )}
            </UbField>
          )}
        </UbDisclosure>

        <UbDisclosure label={t('items.form.section.more')}>
          <UbField
            name="description"
            label={t('items.form.description.label')}
            placeholder={t('items.form.description.placeholder')}
          >
            {(field) => <UbTextInput {...field} autoComplete="off" maxLength={2000} />}
          </UbField>
        </UbDisclosure>
      </UbForm>
    </UbDrawer>
  );
}
