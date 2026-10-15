'use client';

import { useId, useMemo } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm, useWatch } from 'react-hook-form';

import {
  UbButton,
  UbChoiceChips,
  UbField,
  UbForm,
  UbStack,
  UbText,
  UbTextArea,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';

import {
  WITHDRAW_REASONS,
  type WithdrawFormValues,
  type WithdrawReason,
} from '../types/catalogue.types';
import { useCatalogueSchemas } from '../validation/catalogueSchemas';
import { noteRequired } from '../view-model/copyDisplay';

// Loaded with dynamic(), so its words come with its own chunk.
import { LibraryDialog } from './LibraryOverlays';

import 'src/i18n/catalogues/library';
import 'src/i18n/catalogues/validation';

/**
 * F03 (LIB-02 FR-6, §2 "Withdraw") — why this copy leaves stock. A reason chip
 * is required and "Other" needs a note; the copy stays in the register as
 * withdrawn and its number is never reused, which the dialog says before the
 * merchant confirms rather than after.
 *
 * Written here rather than as a design-system `UbReasonDialog`: the FRD names
 * one, and the attendance UI will want one too, but a shared control is
 * better designed once with its two callers in view than guessed at with one
 * (the reasoning CLAUDE.md records for the snackbar's Undo).
 */
export function WithdrawCopyDialog({
  number,
  busy,
  onClose,
  onSubmit,
}: Readonly<{
  number: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (values: WithdrawFormValues) => Promise<void>;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const formId = useId();
  const { withdrawSchema } = useCatalogueSchemas();
  const form = useForm<WithdrawFormValues>({
    resolver: yupResolver(withdrawSchema),
    mode: 'onTouched',
    defaultValues: { reason: '', note: '' },
  });
  const reason = useWatch({ control: form.control, name: 'reason' });
  const options = useMemo(
    () =>
      WITHDRAW_REASONS.map((value) => ({ value, label: t(`library.withdraw.reason.${value}`) })),
    [t]
  );

  return (
    <LibraryDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={t('library.withdraw.title', { number })}
      closeLabel={t('common.action.close')}
      footer={
        <>
          <UbButton variant="secondary" onClick={onClose} disabled={busy} autoFocus>
            {t('common.action.cancel')}
          </UbButton>
          <UbButton
            type="submit"
            form={formId}
            variant="destructive"
            busy={busy}
            busyLabel={t('library.working')}
            data-testid="library-withdraw-confirm"
          >
            {t('library.copy.withdrawAction')}
          </UbButton>
        </>
      }
    >
      <UbStack gap={4}>
        <UbText variant="body-sm" tone="secondary">
          {t('library.withdraw.body')}
        </UbText>
        <UbForm id={formId} form={form} onSubmit={onSubmit}>
          <UbField name="reason" label={t('library.withdraw.reason')} required controlOwnsLabel>
            {(field) => (
              <UbChoiceChips<WithdrawReason>
                id={field.id}
                ariaLabel={t('library.withdraw.reason')}
                value={field.value as WithdrawReason | ''}
                onChange={(next) => field.onChange(next)}
                onBlur={field.onBlur}
                options={options}
                invalid={field.invalid}
                describedBy={field['aria-describedby']}
                disabled={busy}
              />
            )}
          </UbField>
          <UbField name="note" label={t('library.withdraw.note')} required={noteRequired(reason)}>
            {(field) => <UbTextArea {...field} rows={2} maxLength={160} disabled={busy} />}
          </UbField>
        </UbForm>
      </UbStack>
    </LibraryDialog>
  );
}
