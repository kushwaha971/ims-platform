'use client';

import { type UseFormReturn } from 'react-hook-form';

import {
  UbDateInput,
  UbDisclosure,
  UbField,
  UbGrid,
  UbLink,
  UbStack,
  UbSwitch,
  UbText,
  UbTextInput,
  useIsMobileLayer,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { ROUTES } from 'src/routes';
import { formatBusinessDate } from 'src/utils/dates';

import { SUPPLIER_INVOICE_MAX } from '../constants/purchaseConstants';
import { defaultDueOn, type PurchaseBillFormValues } from '../view-model/purchaseBillForm';

import { PurchaseSupplierField } from './PurchaseSupplierField';

import type { DuplicateSupplierInvoice } from '../types/purchase.types';

/**
 * PUR-01 FR-2 / §7 — who the bill is from, their own invoice number and date,
 * our bill date and due date, and the two GST switches. ITC is shown only to a
 * regular shop (FR-11: "hidden and false for others"). The duplicate warning
 * (FR-7) sits under the invoice number with a link to the bill it repeats.
 * Rendered inside the editor's `UbForm`, whose context every `UbField` reads.
 */
export function PurchaseBillHeaderSection({
  form,
  today,
  regular,
  interState,
  duplicate,
  disabled,
  onPickSupplier,
  onInvoiceNumberBlur,
  order = false,
}: Readonly<{
  form: UseFormReturn<PurchaseBillFormValues>;
  today: string;
  regular: boolean;
  interState: boolean;
  duplicate: DuplicateSupplierInvoice | null;
  disabled: boolean;
  onPickSupplier: (id: string, name: string) => void;
  onInvoiceNumberBlur: () => void;
  /** Shop item 3 — an order has no supplier bill yet, no ITC, and an "Expected by" date. */
  order?: boolean;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const isMobileLayer = useIsMobileLayer();
  const { watch, setValue } = form;
  const partyName = watch('partyName');
  const partyId = watch('partyId');
  const documentDate = watch('documentDate');
  const creditDays = watch('partyCreditDays');
  const itcEligible = watch('itcEligible');
  const reverseCharge = watch('reverseCharge');
  const dueHint = order
    ? t('purchases.order.expectedHint')
    : partyId
      ? t('purchases.editor.dueDefault', {
          date: formatBusinessDate(defaultDueOn(documentDate, creditDays)),
        })
      : undefined;

  return (
    <UbStack gap={3} className="p-4">
      <UbField
        name="partyId"
        label={t('purchases.editor.supplier')}
        placeholder={t('purchases.editor.supplierPlaceholder')}
        required
      >
        {(field) => (
          <PurchaseSupplierField
            field={{ ...field, value: field.value ?? '' }}
            supplierName={partyName}
            disabled={disabled}
            t={t}
            onPick={(id, name) => {
              field.onChange(id || null);
              onPickSupplier(id, name);
            }}
          />
        )}
      </UbField>
      {/* docs/mobile-redesign (A14) — on a phone the supplier's invoice number,
          the dates and the tax switches fold under one line that says what
          they hold, so the items come first. A desktop renders them as before. */}
      {(() => {
        const details = (
          <>
            <UbGrid columns={{ base: 1, sm: 2 }} gap={3}>
              {!order && (
                <>
                  <UbStack gap={1}>
                    <UbField
                      name="supplierInvoiceNumber"
                      label={t('purchases.editor.supplierInvoice')}
                      placeholder={t('purchases.editor.supplierInvoicePlaceholder')}
                    >
                      {(field) => (
                        <UbTextInput
                          {...field}
                          maxLength={SUPPLIER_INVOICE_MAX}
                          autoComplete="off"
                          disabled={disabled}
                          onBlur={() => {
                            field.onBlur();
                            onInvoiceNumberBlur();
                          }}
                        />
                      )}
                    </UbField>
                    {duplicate && (
                      <UbText
                        variant="caption"
                        tone="warning"
                        role="status"
                        data-testid="duplicate-warning"
                      >
                        {t('purchases.editor.duplicate', {
                          number: duplicate.number,
                          date: formatBusinessDate(duplicate.documentDate),
                        })}{' '}
                        <UbLink href={`${ROUTES.PURCHASE_BILLS}/${duplicate.id}`} variant="caption">
                          {t('purchases.editor.duplicateOpen')}
                        </UbLink>
                      </UbText>
                    )}
                  </UbStack>
                  <UbField
                    name="supplierInvoiceDate"
                    label={t('purchases.editor.supplierInvoiceDate')}
                    placeholder={t('purchases.editor.datePlaceholder')}
                  >
                    {(field) => (
                      <UbDateInput
                        id={field.id}
                        value={(field.value as string) || null}
                        onChange={(next) => field.onChange(next ?? '')}
                        max={today}
                        placeholder={field.placeholder}
                        disabled={disabled}
                      />
                    )}
                  </UbField>
                </>
              )}
              <UbField
                name="documentDate"
                label={t(order ? 'purchases.order.date' : 'purchases.editor.billDate')}
              >
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
              <UbField
                name="dueOn"
                label={t(order ? 'purchases.order.expectedBy' : 'purchases.editor.dueOn')}
                placeholder={t('purchases.editor.datePlaceholder')}
                hint={dueHint}
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
            </UbGrid>
            <UbGrid columns={{ base: 1, sm: 2 }} gap={3}>
              {regular && !order && (
                <UbSwitch
                  checked={itcEligible}
                  onCheckedChange={(checked) =>
                    setValue('itcEligible', checked, { shouldDirty: true })
                  }
                  label={t('purchases.editor.itc')}
                  description={t('purchases.editor.itcHint')}
                  disabled={disabled}
                />
              )}
              <UbSwitch
                checked={reverseCharge}
                onCheckedChange={(checked) =>
                  setValue('reverseCharge', checked, { shouldDirty: true })
                }
                label={t('purchases.editor.reverseCharge')}
                description={t('purchases.editor.reverseChargeHint')}
                disabled={disabled}
              />
            </UbGrid>
            {partyId && (
              <UbText variant="caption" tone="tertiary">
                {interState ? t('purchases.editor.interState') : t('purchases.editor.intraState')}
              </UbText>
            )}
          </>
        );
        if (!isMobileLayer) return details;
        return (
          <UbDisclosure
            label={t('purchases.editor.moreDetails')}
            hint={formatBusinessDate(documentDate)}
          >
            <UbStack gap={3}>{details}</UbStack>
          </UbDisclosure>
        );
      })()}
    </UbStack>
  );
}
