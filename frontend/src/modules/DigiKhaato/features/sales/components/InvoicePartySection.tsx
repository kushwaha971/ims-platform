'use client';

import { useMemo } from 'react';

import { type UseFormReturn } from 'react-hook-form';

import {
  UbChoiceChips,
  UbDateInput,
  UbField,
  UbGrid,
  UbSelect,
  UbStack,
  UbText,
  UbTextInput,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import type { Locale } from 'src/types/domain.types';

import { ExpensePartyField } from '../../expenses/components/ExpensePartyField';
import { GST_STATES } from '../../onboarding/constants/gstStates';

import type { BillingMode, InvoiceFormValues } from '../view-model/invoiceForm';

/**
 * SAL-02 §7 / SAL-07 §7 — who the bill is for, when, and where it is supplied.
 *
 * Walk-in | Party is a segmented control (SAL-07 FR-1); walk-in name and mobile
 * are optional and never demanded before the items (speed first, §8). Picking
 * a party clears the place of supply so the server defaults it from the
 * party's state (FR-5); a walk-in bills at the shop's own state (BR-5).
 * Rendered inside the editor's `UbForm`, whose context every `UbField` reads.
 */
export function InvoicePartySection({
  form,
  today,
  tenantState,
  locale,
  disabled,
}: Readonly<{
  form: UseFormReturn<InvoiceFormValues>;
  today: string;
  tenantState: string;
  locale: Locale;
  disabled: boolean;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const { watch, setValue } = form;
  const mode = watch('mode');
  const partyName = watch('partyName');
  const documentDate = watch('documentDate');
  const pos = watch('placeOfSupplyState');
  const interState = !!pos && pos !== tenantState;

  const modeOptions = useMemo(
    () => [
      { value: 'walkIn' as BillingMode, label: t('sales.walkIn.label') },
      { value: 'party' as BillingMode, label: t('sales.editor.party') },
    ],
    [t]
  );
  const stateOptions = useMemo(
    () => GST_STATES.map((s) => ({ value: s.code, label: `${s[locale]} (${s.code})` })),
    [locale]
  );

  return (
    <UbStack gap={3}>
      <UbChoiceChips<BillingMode>
        ariaLabel={t('sales.editor.billTo')}
        value={mode}
        options={modeOptions}
        disabled={disabled}
        onChange={(next) => {
          setValue('mode', next, { shouldDirty: true });
          if (next === 'walkIn') {
            setValue('partyId', null, { shouldDirty: true });
            setValue('partyName', '');
            setValue('placeOfSupplyState', tenantState, { shouldDirty: true });
          }
        }}
      />
      {mode === 'party' ? (
        <UbField
          name="partyId"
          label={t('sales.editor.party')}
          placeholder={t('sales.editor.partyPlaceholder')}
        >
          {(field) => (
            <ExpensePartyField
              field={{ ...field, value: field.value ?? '' }}
              partyName={partyName}
              t={t}
              onPick={(id, name) => {
                field.onChange(id || null);
                setValue('partyName', name);
                setValue('placeOfSupplyState', '', { shouldDirty: true });
              }}
            />
          )}
        </UbField>
      ) : (
        <UbGrid columns={{ base: 1, sm: 2 }} gap={3}>
          <UbField
            name="walkInName"
            label={t('sales.walkIn.name')}
            placeholder={t('sales.walkIn.namePlaceholder')}
          >
            {(field) => <UbTextInput {...field} maxLength={120} disabled={disabled} />}
          </UbField>
          <UbField
            name="walkInMobile"
            label={t('sales.walkIn.mobile')}
            placeholder={t('sales.walkIn.mobilePlaceholder')}
          >
            {(field) => (
              <UbTextInput {...field} inputMode="tel" maxLength={13} disabled={disabled} />
            )}
          </UbField>
        </UbGrid>
      )}
      <UbGrid columns={{ base: 1, sm: 3 }} gap={3}>
        <UbField name="documentDate" label={t('sales.editor.date')}>
          {(field) => (
            <UbDateInput
              id={field.id}
              value={field.value as string}
              onChange={(next) => field.onChange(next ?? today)}
              max={today}
              disabled={disabled}
            />
          )}
        </UbField>
        {mode === 'party' && (
          <UbField
            name="dueOn"
            label={t('sales.editor.dueOn')}
            placeholder={t('sales.editor.dueOnPlaceholder')}
          >
            {(field) => (
              <UbDateInput
                id={field.id}
                value={(field.value as string) || null}
                onChange={(next) => field.onChange(next ?? '')}
                min={documentDate}
                placeholder={field.placeholder}
                disabled={disabled}
              />
            )}
          </UbField>
        )}
        <UbField name="placeOfSupplyState" label={t('sales.editor.pos')}>
          {(field) => (
            <UbSelect
              id={field.id}
              aria-label={t('sales.editor.pos')}
              value={(field.value as string) || null}
              placeholder={t('sales.editor.posFromParty')}
              options={stateOptions}
              onChange={field.onChange}
              disabled={disabled}
            />
          )}
        </UbField>
      </UbGrid>
      <UbText variant="caption" tone="tertiary">
        {interState ? t('sales.editor.interState') : t('sales.editor.intraState')}
      </UbText>
    </UbStack>
  );
}
