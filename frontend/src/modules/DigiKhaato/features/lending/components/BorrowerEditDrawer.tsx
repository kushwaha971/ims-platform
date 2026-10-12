'use client';

import { useId, useState, type RefObject } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';

import {
  UbButton,
  UbDrawer,
  UbField,
  UbForm,
  UbPhoneInput,
  UbTextArea,
  UbTextInput,
} from 'src/design-system';
import { useAppDispatch } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import { applyServerErrors } from 'src/utils/applyServerErrors';

import { fetchLendingBorrower, updateLendingBorrower } from '../redux/lendingThunk';
import { useLendingSchemas } from '../validation/lendingSchemas';

import type { BorrowerEditValues, BorrowerRow } from '../types/lending.types';

// Loaded with dynamic(), so its own words come with its own chunk.
import 'src/i18n/catalogues/lending';
import 'src/i18n/catalogues/validation';

const FIELDS: readonly (keyof BorrowerEditValues)[] = ['name', 'mobile', 'area', 'notes'];

/**
 * Edit a borrower (owner, 12 Oct 2026; owner or admin only — the page does not
 * mount this for anybody else, and the server refuses them regardless).
 *
 * Name and mobile are the PARTY's: the server changes them through the
 * parties app's own service, so the khata and every loan show the new ones,
 * and a number another person already has comes back on the mobile field.
 *
 * The version the page loaded is sent with the save. If somebody else saved
 * in between, the server says so; the page reloads the borrower and the
 * snackbar asks for the change to be made again, rather than writing over
 * theirs.
 */
export function BorrowerEditDrawer({
  borrower,
  onClose,
  returnFocusRef,
}: Readonly<{
  borrower: BorrowerRow;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const formId = useId();
  const { borrowerEditSchema } = useLendingSchemas();
  const [busy, setBusy] = useState(false);
  const [formErrors, setFormErrors] = useState<readonly string[]>([]);
  const form = useForm<BorrowerEditValues>({
    resolver: yupResolver(borrowerEditSchema),
    mode: 'onTouched',
    defaultValues: {
      name: borrower.name,
      mobile: borrower.mobile ?? '',
      area: borrower.area,
      notes: borrower.notes,
    },
  });

  const save = async (values: BorrowerEditValues) => {
    setBusy(true);
    setFormErrors([]);
    const result = await dispatch(
      updateLendingBorrower({ id: borrower.id, values, version: borrower.version })
    );
    setBusy(false);
    if (updateLendingBorrower.fulfilled.match(result)) {
      dispatch(
        showSnackbar({
          severity: 'success',
          id: 'lending.borrower.edit.done',
          params: { name: result.payload.name },
        })
      );
      onClose();
      return;
    }
    const failure = result.payload;
    if (!failure) return;
    if (failure.code === 'stale_version') {
      // Somebody else saved first: show theirs, and say so.
      void dispatch(fetchLendingBorrower(borrower.id));
      dispatch(showSnackbar({ severity: 'warning', id: 'lending.borrower.edit.stale' }));
      onClose();
      return;
    }
    const unanchored = applyServerErrors(failure, form.setError, FIELDS, t);
    if (unanchored.length > 0) setFormErrors(unanchored);
    else if (failure.status !== 400) {
      // A refusal with no field to sit on (an archived person, a lost
      // connection) is said once, by the global snackbar.
      dispatch(showSnackbar({ severity: 'error', message: failure.message }));
    }
  };

  return (
    <UbDrawer
      open
      onOpenChange={(next) => !next && onClose()}
      title={t('lending.borrower.edit.title')}
      closeLabel={t('common.action.close')}
      dismissOnBackdrop={!form.formState.isDirty}
      returnFocusRef={returnFocusRef}
      footer={
        <>
          <UbButton variant="secondary" onClick={onClose} disabled={busy}>
            {t('common.action.cancel')}
          </UbButton>
          <UbButton
            type="submit"
            form={formId}
            busy={busy}
            busyLabel={t('lending.end.working')}
            data-testid="lending-borrower-edit-save"
          >
            {t('lending.borrower.edit.save')}
          </UbButton>
        </>
      }
    >
      <UbForm id={formId} form={form} onSubmit={save} formErrors={formErrors}>
        <UbField
          name="name"
          label={t('lending.form.name')}
          placeholder={t('lending.form.name.placeholder')}
          required
        >
          {(field) => <UbTextInput {...field} autoComplete="off" disabled={busy} />}
        </UbField>
        <UbField
          name="mobile"
          label={t('lending.form.mobile')}
          placeholder={t('lending.form.mobile.placeholder')}
          optionalLabel={t('common.field.optional')}
        >
          {(field) => <UbPhoneInput {...field} disabled={busy} />}
        </UbField>
        <UbField
          name="area"
          label={t('lending.form.area')}
          placeholder={t('lending.form.area.placeholder')}
          optionalLabel={t('common.field.optional')}
        >
          {(field) => <UbTextInput {...field} autoComplete="off" maxLength={60} disabled={busy} />}
        </UbField>
        <UbField
          name="notes"
          label={t('lending.form.notes')}
          placeholder={t('lending.form.notes.placeholder')}
          optionalLabel={t('common.field.optional')}
        >
          {(field) => <UbTextArea {...field} maxLength={500} disabled={busy} />}
        </UbField>
      </UbForm>
    </UbDrawer>
  );
}
