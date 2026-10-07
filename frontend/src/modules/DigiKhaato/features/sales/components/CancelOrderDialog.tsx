'use client';

import { useCallback, useId, useState } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm, useWatch } from 'react-hook-form';

import {
  UbButton,
  UbDialog,
  UbField,
  UbForm,
  UbStack,
  UbText,
  UbTextArea,
} from 'src/design-system';
import { useAppDispatch } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';

import { moveEstimate } from '../redux/salesFlowThunk';
import { useSalesFlowSchemas } from '../validation/salesFlowSchemas';

import type { SalesDocument } from '../types/sales.types';
import 'src/i18n/catalogues/sales';
import 'src/i18n/catalogues/validation';

/**
 * Shop item 3 — "Cancel order SO/26-27/0004?" with the customer's reason (three
 * characters at least, the void's own rule and schema). A cancelled order keeps
 * its number and is never billed; nothing else moves, because an order never
 * moved anything.
 */
export function CancelOrderDialog({
  doc,
  onClose,
}: Readonly<{ doc: SalesDocument; onClose: () => void }>): React.JSX.Element {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { voidReasonSchema } = useSalesFlowSchemas();
  const formId = useId();
  const [busy, setBusy] = useState(false);
  const rhf = useForm<{ reason: string }>({
    resolver: yupResolver(voidReasonSchema),
    mode: 'onTouched',
    defaultValues: { reason: '' },
  });
  const reason = useWatch({ control: rhf.control, name: 'reason' }) ?? '';

  const submit = useCallback(
    async (values: { reason: string }) => {
      setBusy(true);
      const result = await dispatch(
        moveEstimate({ id: doc.id, move: 'cancel', note: values.reason.trim() })
      );
      setBusy(false);
      if (!moveEstimate.fulfilled.match(result)) return;
      dispatch(
        showSnackbar({
          severity: 'success',
          id: 'sales.order.cancel.done',
          params: { number: doc.number ?? '' },
        })
      );
      onClose();
    },
    [dispatch, doc.id, doc.number, onClose]
  );

  return (
    <UbDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={t('sales.order.cancel.title', { number: doc.number ?? '' })}
      closeLabel={t('common.action.close')}
      footer={
        <>
          <UbButton variant="secondary" onClick={onClose} disabled={busy}>
            {t('sales.order.cancel.keep')}
          </UbButton>
          <UbButton
            type="submit"
            form={formId}
            variant="destructive"
            busy={busy}
            busyLabel={t('sales.order.cancel.working')}
            disabled={reason.trim().length < 3}
            data-testid="order-cancel-confirm"
          >
            {t('sales.order.cancel.action')}
          </UbButton>
        </>
      }
    >
      <UbForm id={formId} form={rhf} onSubmit={submit}>
        <UbStack gap={3}>
          <UbText variant="body-sm">{t('sales.order.cancel.body')}</UbText>
          <UbField
            name="reason"
            label={t('sales.order.cancel.reason')}
            placeholder={t('sales.order.cancel.reasonPlaceholder')}
            required
          >
            {(field) => <UbTextArea {...field} maxLength={160} rows={2} />}
          </UbField>
        </UbStack>
      </UbForm>
    </UbDialog>
  );
}
