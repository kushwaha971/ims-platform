'use client';

import { useMemo } from 'react';


import { UbField, UbGrid, UbSelect, UbStack, UbTextInput } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';

import { CHALLAN_TYPES } from '../types/salesFlows.types';

import type { InvoiceFormValues } from '../view-model/invoiceForm';
import type { UseFormReturn } from 'react-hook-form';

/**
 * Shop item 4 — SAL-09 FR-2: why the goods are leaving and who carries them. The
 * transporter, vehicle and e-way bill number print on the challan the driver
 * carries; none of them is required, because a sample handed over the counter has
 * no lorry. Rendered inside the editor's `UbForm`, whose context every field reads.
 */
export function ChallanDetailsSection({
  form,
  disabled,
}: Readonly<{ form: UseFormReturn<InvoiceFormValues>; disabled: boolean }>): React.JSX.Element {
  const { t } = useTranslation();
  const type = form.watch('challanType');
  const options = useMemo(
    () => CHALLAN_TYPES.map((value) => ({ value, label: t(`sales.challan.type.${value}`) })),
    [t]
  );
  return (
    <UbStack gap={3} className="p-4" data-testid="challan-details">
      <UbField name="challanType" label={t('sales.challan.type.label')}>
        {(field) => (
          <UbSelect
            id={field.id}
            value={type}
            options={options}
            onChange={(next) =>
              form.setValue('challanType', next as InvoiceFormValues['challanType'], {
                shouldDirty: true,
              })
            }
            disabled={disabled}
          />
        )}
      </UbField>
      <UbGrid columns={{ base: 1, sm: 3 }} gap={3}>
        <UbField name="transporter" label={t('sales.challan.transporter')}>
          {(field) => <UbTextInput {...field} maxLength={60} disabled={disabled} />}
        </UbField>
        <UbField
          name="vehicleNumber"
          label={t('sales.challan.vehicle')}
          placeholder={t('sales.challan.vehiclePlaceholder')}
        >
          {(field) => (
            <UbTextInput {...field} maxLength={20} autoComplete="off" disabled={disabled} />
          )}
        </UbField>
        <UbField name="ewayBillNumber" label={t('sales.challan.eway')}>
          {(field) => (
            <UbTextInput {...field} maxLength={20} autoComplete="off" disabled={disabled} />
          )}
        </UbField>
      </UbGrid>
    </UbStack>
  );
}
