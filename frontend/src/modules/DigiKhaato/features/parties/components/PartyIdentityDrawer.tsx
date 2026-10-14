'use client';

import { useId } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';

import {
  UbButton,
  UbDrawer,
  UbField,
  UbForm,
  UbPhoneInput,
  UbText,
  UbTextInput,
} from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useDegradedNetwork } from 'src/hooks/useDegradedNetwork';
import { useIsOwnerOrAdmin } from 'src/hooks/useIsOwnerOrAdmin';
import { usePermissions } from 'src/hooks/usePermissions';
import { useTranslation } from 'src/hooks/useTranslation';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import { applyServerErrors } from 'src/utils/applyServerErrors';

import { selectPartyFormStatus } from '../redux/partyFormSlice';
import { saveParty } from '../redux/partyFormThunk';
import { usePartyIdentitySchema } from '../validation/partySchemas';

import type { PartyIdentityValues } from '../types/party.types';

import 'src/i18n/catalogues/parties';
import 'src/i18n/catalogues/validation';

/** Shared name/mobile editor that can open in any person's app workspace. */
export function PartyIdentityDrawer({
  party,
  onClose,
}: Readonly<{
  party: { readonly id: string; readonly name: string; readonly mobile: string | null };
  onClose: () => void;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const status = useAppSelector(selectPartyFormStatus);
  const isManager = useIsOwnerOrAdmin();
  const { can } = usePermissions();
  const { canWrite } = useDegradedNetwork();
  const schema = usePartyIdentitySchema();
  const formId = useId();
  const busy = status === 'loading';
  const allowed = isManager && can('parties.party.write') && canWrite('deferred');
  const form = useForm<PartyIdentityValues>({
    resolver: yupResolver(schema),
    defaultValues: { name: party.name, mobile: party.mobile ?? '' },
    mode: 'onTouched',
  });
  const save = async (values: PartyIdentityValues): Promise<void> => {
    if (!allowed || busy) return;
    if (values.name.trim() === party.name && values.mobile?.trim() === (party.mobile ?? '')) {
      onClose();
      return;
    }
    const result = await dispatch(saveParty({ partyId: party.id, identity: values }));
    if (saveParty.fulfilled.match(result)) {
      dispatch(
        showSnackbar({
          severity: 'success',
          id: 'parties.form.saved',
          params: { name: result.payload.party.name },
        })
      );
      onClose();
      return;
    }
    const error = result.payload;
    if (!error) return;
    if (error.code === 'validation_error') {
      const unanchored = applyServerErrors(error, form.setError, ['name', 'mobile']);
      if (unanchored.length === 0) return;
    }
    dispatch(
      showSnackbar({ severity: 'error', message: error.message, requestId: error.requestId })
    );
  };
  return (
    <UbDrawer
      open
      onOpenChange={(open) => !open && !busy && onClose()}
      title={t('parties.identity.title')}
      closeLabel={t('common.action.close')}
      footer={
        <>
          <UbButton variant="secondary" onClick={onClose} disabled={busy}>
            {t('common.action.cancel')}
          </UbButton>
          <UbButton
            type="submit"
            form={formId}
            busy={busy}
            disabled={!allowed}
            data-testid="party-identity-save"
          >
            {t('parties.form.submit.edit')}
          </UbButton>
        </>
      }
    >
      <UbForm id={formId} form={form} onSubmit={save}>
        <UbText variant="body-sm" tone="tertiary">
          {t('parties.identity.shared')}
        </UbText>
        <UbField name="name" label={t('parties.form.name.label')} required>
          {(field) => <UbTextInput {...field} disabled={!allowed || busy} autoComplete="name" />}
        </UbField>
        <UbField
          name="mobile"
          label={t('parties.form.mobile.label')}
          optionalLabel={t('common.field.optional')}
        >
          {(field) => <UbPhoneInput {...field} disabled={!allowed || busy} />}
        </UbField>
      </UbForm>
    </UbDrawer>
  );
}
