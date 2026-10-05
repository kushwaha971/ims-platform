'use client';

import { useId } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';

import {
  UbButton,
  UbChoiceChips,
  UbDialog,
  UbField,
  UbForm,
  UbMoneyInput,
  UbStack,
  UbTextInput,
} from 'src/design-system';
import { useAppDispatch } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import { applyServerErrors } from 'src/utils/applyServerErrors';

import { saveLibraryPlan } from '../redux/libraryMemberThunk';
import { PLAN_LENGTHS, type PlanFormValues } from '../types/plan.types';
import { useSeatSchemas } from '../validation/seatSchemas';

import type { MembershipType } from '../types/member.types';

// Loaded with dynamic(), so its words come with its own chunk.
import 'src/i18n/catalogues/library';
import 'src/i18n/catalogues/validation';

/** Server field → this form's field. */
const SERVER_FIELD: Readonly<Record<string, keyof PlanFormValues>> = {
  name: 'name',
  fee_amount: 'feeAmount',
  validity_months: 'validityMonths',
  admission_fee: 'admissionFee',
  deposit_amount: 'depositAmount',
};

/**
 * W03 — a fee plan: its name, the fee, how long it runs (Monthly, Quarterly,
 * Half-yearly, Yearly), and what joining costs once — an admission fee and a
 * refundable security deposit. Renewing charges the fee again for the length.
 */
export function PlanDialog({
  plan,
  onClose,
}: Readonly<{ plan: MembershipType | null; onClose: () => void }>): React.JSX.Element {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const formId = useId();
  const { planSchema } = useSeatSchemas();
  const form = useForm<PlanFormValues>({
    resolver: yupResolver(planSchema),
    mode: 'onTouched',
    defaultValues: {
      name: plan?.name ?? '',
      feeAmount: plan?.feeAmount ?? '',
      validityMonths: String(plan?.validityMonths ?? 1),
      admissionFee: plan && Number(plan.admissionFee) ? plan.admissionFee : '',
      depositAmount: plan && Number(plan.depositAmount) ? plan.depositAmount : '',
    },
  });
  const busy = form.formState.isSubmitting;

  const save = async (values: PlanFormValues) => {
    const result = await dispatch(
      saveLibraryPlan({
        body: {
          name: values.name,
          feeAmount: values.feeAmount,
          validityMonths: Number(values.validityMonths),
          admissionFee: values.admissionFee ?? '',
          depositAmount: values.depositAmount ?? '',
        },
        existing: plan ? { id: plan.id, version: plan.version } : undefined,
      })
    );
    if (saveLibraryPlan.fulfilled.match(result)) {
      dispatch(
        showSnackbar({
          severity: 'success',
          id: 'library.plans.saved',
          params: { name: result.payload.name },
        })
      );
      onClose();
      return;
    }
    if (!result.payload) return;
    const details = Object.fromEntries(
      Object.entries(result.payload.details ?? {}).map(([key, messages]) => [
        SERVER_FIELD[key] ?? key,
        messages,
      ])
    );
    applyServerErrors({ ...result.payload, details }, form.setError, Object.values(SERVER_FIELD));
  };

  const money = (name: 'feeAmount' | 'admissionFee' | 'depositAmount', required = false) => (
    <UbField
      name={name}
      label={t(`library.plans.field.${name}`)}
      required={required}
      optionalLabel={required ? undefined : t('common.field.optional')}
      placeholder="0.00"
      className="flex-1"
    >
      {(field) => (
        <UbMoneyInput
          {...field}
          value={field.value as string}
          onChange={field.onChange}
          inputMode="decimal"
          disabled={busy}
        />
      )}
    </UbField>
  );

  return (
    <UbDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={t(plan ? 'library.plans.edit' : 'library.plans.add')}
      closeLabel={t('common.action.close')}
      footer={
        <>
          <UbButton variant="secondary" onClick={onClose} disabled={busy}>
            {t('common.action.cancel')}
          </UbButton>
          <UbButton type="submit" form={formId} busy={busy} data-testid="library-plan-save">
            {t('library.plans.save')}
          </UbButton>
        </>
      }
    >
      <UbForm id={formId} form={form} onSubmit={save}>
        <UbField
          name="name"
          label={t('library.plans.field.name')}
          placeholder={t('library.plans.field.name.placeholder')}
          required
        >
          {(field) => <UbTextInput {...field} autoComplete="off" disabled={busy} />}
        </UbField>
        <UbField name="validityMonths" label={t('library.plans.field.length')} controlOwnsLabel>
          {(field) => (
            <UbChoiceChips<string>
              id={field.id}
              ariaLabel={t('library.plans.field.length')}
              value={String(field.value)}
              onChange={(next) => field.onChange(next)}
              onBlur={field.onBlur}
              options={PLAN_LENGTHS.map((months) => ({
                value: months,
                label: t(`library.plans.lengthName.${months}`),
              }))}
              disabled={busy}
            />
          )}
        </UbField>
        {money('feeAmount', true)}
        <UbStack direction="row" gap={3} className="max-sm:flex-col">
          {money('admissionFee')}
          {money('depositAmount')}
        </UbStack>
      </UbForm>
    </UbDialog>
  );
}
