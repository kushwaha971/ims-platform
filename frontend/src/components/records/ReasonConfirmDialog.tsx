'use client';

import { useCallback, useId, useMemo, type ReactNode, type RefObject } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';
import * as Yup from 'yup';

import {
  UbButton,
  UbDialog,
  UbField,
  UbForm,
  UbPressable,
  UbStack,
  UbTag,
  UbText,
  UbTextArea,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { useValidationSchemas } from 'src/hooks/useValidationSchemas';
import { REASON_MAX_CHARS } from 'src/utils/reason';

import 'src/i18n/catalogues/validation';

/**
 * WP-03 D-04c — "Void this? Say why." The one shell for every destructive
 * change that takes a written reason: a sales bill or credit note voided, an
 * order cancelled, a purchase bill or debit note voided, an expense or payment
 * voided, a khata entry reversed. The CONSEQUENCES stay with each feature, as
 * `children`; the shell owns what was the same in all of them and had drifted:
 *
 *  · the reason is the shared rule (`useValidationSchemas().reasonText`, three
 *    to 160 characters, `utils/reason.ts`), opens with the caret in it, and is
 *    sent trimmed;
 *  · the confirm button is never greyed for a missing reason: tapping it says
 *    why under the field, which is the product's rule for a button that
 *    cannot act yet (three of seven dialogs greyed it silently);
 *  · while the request runs, Escape, ✕ and Cancel do nothing — all seven
 *    closed mid-request, so the refusal or the "voided" snackbar arrived with
 *    the dialog already gone;
 *  · Cancel first and the destructive action last, in the dialog footer.
 *
 * `confirmDisabled` is for a state the feature knows makes the action
 * impossible (a credit note against the bill, an origin lock), which it
 * explains in `children`; it is not for a missing reason.
 */
export interface ReasonConfirmDialogProps {
  readonly title: string;
  readonly description?: string;
  readonly confirmLabel: string;
  readonly workingLabel: string;
  /** Defaults to "Cancel". */
  readonly keepLabel?: string;
  readonly reasonLabel: string;
  readonly reasonPlaceholder?: string;
  readonly reasonHint?: string;
  /** The message for an empty or too-short reason, in the feature's words. */
  readonly requiredMessageId: string;
  readonly busy: boolean;
  /** Called with the trimmed reason once it passes the rule. */
  readonly onConfirm: (reason: string) => void | Promise<unknown>;
  readonly onClose: () => void;
  readonly confirmDisabled?: boolean;
  /** One-tap reasons that fill the field (the payment void's chips). */
  readonly suggestions?: readonly string[];
  /** Server field errors, shown on the form as every form shows them. */
  readonly formErrors?: readonly string[];
  /** The consequences and any refusal, above the reason. */
  readonly children?: ReactNode;
  /** A note under the reason. */
  readonly footnote?: ReactNode;
  readonly confirmTestId?: string;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
  /** The dialog's classes, for an app's own overlay sizing. */
  readonly className?: string;
}

interface ReasonValues {
  readonly reason: string;
}

export function ReasonConfirmDialog({
  title,
  description,
  confirmLabel,
  workingLabel,
  keepLabel,
  reasonLabel,
  reasonPlaceholder,
  reasonHint,
  requiredMessageId,
  busy,
  onConfirm,
  onClose,
  confirmDisabled = false,
  suggestions,
  formErrors,
  children,
  footnote,
  confirmTestId,
  returnFocusRef,
  className,
}: Readonly<ReasonConfirmDialogProps>): React.JSX.Element {
  const { t } = useTranslation();
  const v = useValidationSchemas();
  const formId = useId();
  const schema = useMemo(
    () => Yup.object({ reason: v.reasonText(requiredMessageId) }) as Yup.ObjectSchema<ReasonValues>,
    [v, requiredMessageId]
  );
  const form = useForm<ReasonValues>({
    resolver: yupResolver(schema),
    mode: 'onTouched',
    defaultValues: { reason: '' },
  });

  const submit = useCallback(
    async (values: ReasonValues) => {
      await onConfirm(values.reason.trim());
    },
    [onConfirm]
  );
  const close = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);

  return (
    <UbDialog
      open
      onOpenChange={(next) => !next && close()}
      title={title}
      description={description}
      closeLabel={t('common.action.close')}
      returnFocusRef={returnFocusRef}
      className={className}
      footer={
        <>
          <UbButton variant="secondary" onClick={close} disabled={busy}>
            {keepLabel ?? t('common.action.cancel')}
          </UbButton>
          <UbButton
            type="submit"
            form={formId}
            variant="destructive"
            busy={busy}
            busyLabel={workingLabel}
            disabled={confirmDisabled}
            data-testid={confirmTestId}
          >
            {confirmLabel}
          </UbButton>
        </>
      }
    >
      <UbForm id={formId} form={form} onSubmit={submit} formErrors={formErrors}>
        {children}
        {suggestions && suggestions.length > 0 ? (
          <UbStack direction="row" className="flex-wrap gap-2">
            {suggestions.map((text) => (
              <UbPressable
                key={text}
                onClick={() =>
                  form.setValue('reason', text, { shouldDirty: true, shouldValidate: true })
                }
              >
                <UbTag name={text} />
              </UbPressable>
            ))}
          </UbStack>
        ) : null}
        <UbField
          name="reason"
          label={reasonLabel}
          placeholder={reasonPlaceholder}
          hint={reasonHint}
          required
        >
          {(field) => <UbTextArea {...field} maxLength={REASON_MAX_CHARS} rows={2} autoFocus />}
        </UbField>
        {typeof footnote === 'string' ? (
          <UbText variant="caption" tone="tertiary">
            {footnote}
          </UbText>
        ) : (
          footnote
        )}
      </UbForm>
    </UbDialog>
  );
}
