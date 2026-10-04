'use client';

import { useId, useMemo } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';

import {
  UbButton,
  UbDialog,
  UbField,
  UbForm,
  UbStack,
  UbText,
  UbTextInput,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { readDetailNumber } from 'src/utils/errorDetails';

import { useLibrarySettingsSchemas } from '../validation/settingsSchemas';

import type { SaveOutcome } from '../hooks/useLibrarySettings';
import type { LibraryNumberKind, RaiseNumberFormValues } from '../types/settings.types';

// Loaded with dynamic(), so its words come with its own chunk.
import 'src/i18n/catalogues/library';
import 'src/i18n/catalogues/validation';

/**
 * F02 (LIB-01 §2 "Continue a paper register", BR-2) — move a counter forward
 * so the next book continues the paper register. Numbers are never reused, so
 * the dialog says so before Save; a number already passed is refused inline
 * with the lowest number that would be accepted.
 */
export function RaiseNumberDialog({
  kind,
  current,
  busy,
  onClose,
  onSubmit,
}: Readonly<{
  kind: LibraryNumberKind;
  current: number;
  busy: boolean;
  onClose: () => void;
  onSubmit: (next: number) => Promise<SaveOutcome>;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const formId = useId();
  const { raiseNumberSchema } = useLibrarySettingsSchemas();
  const schema = useMemo(() => raiseNumberSchema(current), [raiseNumberSchema, current]);
  const form = useForm<RaiseNumberFormValues>({
    resolver: yupResolver(schema),
    mode: 'onTouched',
    defaultValues: { nextNumber: String(current) },
  });

  const submit = async (values: RaiseNumberFormValues): Promise<void> => {
    const outcome = await onSubmit(Number(values.nextNumber));
    if (outcome.ok || !outcome.error) return;
    if (outcome.error.code === 'sequence_backwards') {
      const lowest = readDetailNumber(outcome.error.details, 'current') ?? current;
      form.setError('nextNumber', {
        message: t('library.settings.number.backwards', { current: lowest }),
      });
      return;
    }
    form.setError('nextNumber', { message: outcome.error.message });
  };

  return (
    <UbDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={t(`library.settings.number.${kind}`)}
      closeLabel={t('common.action.close')}
      footer={
        <>
          <UbButton variant="secondary" onClick={onClose} disabled={busy}>
            {t('common.action.cancel')}
          </UbButton>
          <UbButton type="submit" form={formId} busy={busy} busyLabel={t('library.working')}>
            {t('library.form.save')}
          </UbButton>
        </>
      }
    >
      <UbStack gap={4}>
        <UbText variant="body-sm" tone="secondary">
          {t('library.settings.number.neverReused')}
        </UbText>
        <UbForm id={formId} form={form} onSubmit={submit}>
          <UbField
            name="nextNumber"
            label={t('library.settings.number.next')}
            placeholder={String(current)}
            required
          >
            {(field) => <UbTextInput {...field} inputMode="numeric" autoFocus disabled={busy} />}
          </UbField>
        </UbForm>
      </UbStack>
    </UbDialog>
  );
}
