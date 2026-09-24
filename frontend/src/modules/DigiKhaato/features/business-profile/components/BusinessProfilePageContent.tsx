'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm, useWatch } from 'react-hook-form';

import {
  UbButton,
  UbConfirmDialog,
  UbEmptyState,
  UbField,
  UbFileUpload,
  UbForm,
  UbGrid,
  UbImagePreview,
  UbPageHeader,
  UbPageShell,
  UbPanel,
  UbPanelSection,
  UbPhoneInput,
  UbRadioGroup,
  UbSelect,
  UbSkeleton,
  UbStack,
  UbStatusBanner,
  UbText,
  UbTextInput,
} from 'src/design-system';
import { useAppDispatch } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import type { Locale } from 'src/types/domain.types';
import { applyServerErrors } from 'src/utils/applyServerErrors';

import { useBranding } from '../../branding/hooks/useBranding';
import {
  BUSINESS_TYPE_CONFIG,
  BUSINESS_TYPES,
  GST_TYPES,
  type GstType,
} from '../../onboarding/constants/businessTypes';
import { GST_STATES, stateName } from '../../onboarding/constants/gstStates';
import { useSettingsAccess } from '../../settings/hooks/useSettingsAccess';
import { useBusinessProfile } from '../hooks/useBusinessProfile';
import {
  PROFILE_FIELDS,
  useBusinessProfileSchemas,
  type BusinessProfileFormValues,
} from '../validation/businessProfileSchemas';
import {
  formToProfile,
  headerAddressLines,
  headerGstinLine,
  profileToForm,
} from '../view-model/profileDisplay';

import { DocumentHeaderPreview } from './DocumentHeaderPreview';

const SIGNATURE_MAX_BYTES = 2 * 1024 * 1024;

/**
 * PLT-07 — Settings → Business profile: the identity every bill prints.
 *
 * Owner and admin edit; the accountant reads it with the bank account number
 * and PAN masked by the SERVER (§12) — the client never holds the full number
 * for a role that may not see it. A GST type change is confirmed first (§8),
 * because it changes what kind of bill the business issues.
 *
 * FR-5's live UPI QR is not here: the encoder is PAY-03's, blocked on its own
 * ADR (Part 43 C3), and a QR drawn by anything else is a QR nobody has proven
 * scans. The VPA is validated to the server's pattern instead.
 */
export function BusinessProfilePageContent(): React.JSX.Element {
  const { t, locale } = useTranslation();
  const dispatch = useAppDispatch();
  const access = useSettingsAccess();
  const profile = useBusinessProfile();
  const branding = useBranding();
  const { businessProfileSchema } = useBusinessProfileSchemas();
  const { data, status, error, refetch } = profile;

  const defaults = useMemo(() => (data ? profileToForm(data) : undefined), [data]);
  const form = useForm<BusinessProfileFormValues>({
    resolver: yupResolver(businessProfileSchema),
    mode: 'onTouched',
    defaultValues: defaults,
  });
  const { reset, control, setError, formState } = form;
  useEffect(() => {
    if (defaults) reset(defaults);
  }, [defaults, reset]);

  const [formErrors, setFormErrors] = useState<readonly string[]>([]);
  const [pending, setPending] = useState<BusinessProfileFormValues | null>(null);
  const watched = useWatch({ control });
  const canEdit = access.canEdit;

  const commit = useCallback(
    async (values: BusinessProfileFormValues) => {
      setFormErrors([]);
      const refusal = await profile.save(formToProfile(values));
      if (refusal?.code === 'validation_error') {
        setFormErrors(applyServerErrors(refusal, setError, [...PROFILE_FIELDS], t));
      }
    },
    [profile, setError, t]
  );

  const submit = useCallback(
    async (values: BusinessProfileFormValues) => {
      // §8: a GST type change is the one edit here that is confirmed first.
      if (data && values.gstType !== data.gstType) {
        setPending(values);
        return;
      }
      await commit(values);
    },
    [commit, data]
  );

  const confirmGst = useCallback(() => {
    const values = pending;
    setPending(null);
    if (values) void commit(values);
  }, [commit, pending]);

  const uploadSignature = useCallback(
    (file: File) => void branding.save({ signature: file }, 'settings.profile.signature.saved'),
    [branding]
  );
  const rejectSignature = useCallback(
    (reason: 'too_large' | 'wrong_type') =>
      dispatch(
        showSnackbar({
          severity: 'error',
          id: reason === 'too_large' ? 'branding.logo.tooLarge' : 'branding.logo.wrongType',
        })
      ),
    [dispatch]
  );

  const typeOptions = useMemo(
    () =>
      BUSINESS_TYPES.map((type) => ({ value: type, label: t(BUSINESS_TYPE_CONFIG[type].labelId) })),
    [t]
  );
  const gstOptions = useMemo(
    () =>
      GST_TYPES.map((type) => ({
        value: type,
        label: t(`onboarding.gst.${type}`),
        hint: t(`onboarding.gst.${type}.hint`),
        disabled: !canEdit,
      })),
    [t, canEdit]
  );
  const stateOptions = useMemo(
    () =>
      GST_STATES.map((state) => ({
        value: state.code,
        label: `${stateName(state.code, locale as Locale)} (${state.code})`,
      })),
    [locale]
  );

  const header = (
    <UbPageHeader title={t('settings.profile.title')} subtitle={t('settings.profile.subtitle')} />
  );

  if (status === 'failed') {
    return (
      <UbPageShell header={header}>
        <UbEmptyState
          variant="error"
          title={t('settings.profile.error.title')}
          description={error?.message ?? t('settings.profile.error.body')}
          requestId={error?.requestId ?? null}
          requestIdLabel={t('common.error.reference')}
          action={
            <UbButton variant="secondary" onClick={refetch}>
              {t('common.action.retry')}
            </UbButton>
          }
        />
      </UbPageShell>
    );
  }
  if (!data || !defaults) {
    return (
      <UbPageShell header={header}>
        <UbSkeleton variant="form" count={6} />
      </UbPageShell>
    );
  }

  const disabled = !canEdit;
  const text = (
    name: keyof BusinessProfileFormValues,
    options: { upper?: boolean; type?: 'text' | 'email'; max?: number; mono?: boolean } = {}
  ) => (
    <UbField
      name={name}
      label={t(`settings.profile.field.${name}`)}
      placeholder={t(`settings.profile.field.${name}.placeholder`)}
    >
      {(field) => (
        <UbTextInput
          {...field}
          type={options.type ?? 'text'}
          uppercase={options.upper}
          maxLength={options.max}
          className={options.mono ? 'font-mono' : undefined}
          disabled={disabled}
        />
      )}
    </UbField>
  );
  const registered = watched.gstType !== 'unregistered';
  const mismatch = profile.warnings.find((warning) => warning.code === 'gstin_state_mismatch');

  return (
    <UbPageShell header={header}>
      <UbGrid columns={{ base: 1, lg: 2 }} gap={6}>
        <UbForm form={form} onSubmit={submit} formErrors={formErrors}>
          {mismatch?.gstinStateCode && (
            <UbStatusBanner
              tone="warning"
              title={t('onboarding.gstin.stateMismatch', {
                state: stateName(mismatch.gstinStateCode, locale as Locale),
              })}
            />
          )}
          <UbPanel as="section">
            <UbPanelSection
              title={t('settings.profile.section.identity')}
              badge={disabled ? t('settings.viewOnly') : undefined}
            >
              <UbStack gap={4}>
                {text('name', { max: 160 })}
                {text('legalName', { max: 200 })}
                <UbField
                  name="businessType"
                  label={t('onboarding.type.label')}
                  placeholder={t('settings.profile.field.businessType.placeholder')}
                  hint={t('onboarding.type.hint')}
                >
                  {(field) => <UbSelect {...field} options={typeOptions} disabled={disabled} />}
                </UbField>
              </UbStack>
            </UbPanelSection>
            <UbPanelSection title={t('settings.profile.section.gst')}>
              <UbStack gap={4}>
                <UbText variant="label">{t('onboarding.gst.label')}</UbText>
                <UbField name="gstType" label={t('onboarding.gst.label')} controlOwnsLabel>
                  {(field) => (
                    <UbRadioGroup<GstType>
                      name={field.name}
                      value={field.value as GstType}
                      onChange={field.onChange}
                      options={gstOptions}
                      ariaLabel={t('onboarding.gst.label')}
                    />
                  )}
                </UbField>
                {registered && text('gstin', { upper: true, max: 15, mono: true })}
                {text('pan', { upper: true, max: 10, mono: true })}
                <UbField
                  name="stateCode"
                  label={t('settings.profile.field.stateCode')}
                  placeholder={t('settings.profile.field.stateCode.placeholder')}
                >
                  {(field) => <UbSelect {...field} options={stateOptions} disabled={disabled} />}
                </UbField>
              </UbStack>
            </UbPanelSection>
            <UbPanelSection title={t('settings.profile.section.address')}>
              <UbStack gap={4}>
                {text('addressLine1', { max: 120 })}
                {text('addressLine2', { max: 120 })}
                <UbGrid columns={{ base: 1, sm: 2 }} gap={4}>
                  {text('city', { max: 120 })}
                  {text('pincode', { max: 6 })}
                </UbGrid>
              </UbStack>
            </UbPanelSection>
            <UbPanelSection title={t('settings.profile.section.contact')}>
              <UbStack gap={4}>
                <UbField
                  name="phone"
                  label={t('settings.profile.field.phone')}
                  placeholder={t('settings.profile.field.phone.placeholder')}
                  hint={t('settings.profile.field.phone.hint')}
                >
                  {(field) => <UbPhoneInput {...field} disabled={disabled} />}
                </UbField>
                {text('email', { type: 'email', max: 254 })}
              </UbStack>
            </UbPanelSection>
            <UbPanelSection title={t('settings.profile.section.bank')}>
              <UbStack gap={4}>
                {data.bankMasked && (
                  <UbText variant="caption" tone="tertiary">
                    {t('settings.profile.bank.masked')}
                  </UbText>
                )}
                {text('accountName', { max: 120 })}
                {text('accountNumber', { max: 18, mono: true })}
                <UbGrid columns={{ base: 1, sm: 2 }} gap={4}>
                  {text('ifsc', { upper: true, max: 11, mono: true })}
                  {text('bankName', { max: 80 })}
                </UbGrid>
                {text('branch', { max: 80 })}
                {text('upiVpa', { max: 80 })}
              </UbStack>
            </UbPanelSection>
            <UbPanelSection title={t('settings.profile.signature.label')}>
              <UbStack direction="row" gap={3} align="center" wrap>
                <UbImagePreview
                  src={branding.data?.signatureUrl ?? null}
                  alt={t('settings.profile.signature.alt')}
                  emptyLabel={t('settings.profile.signature.none')}
                  size="md"
                />
                <UbStack gap={2}>
                  <UbFileUpload
                    label={
                      branding.data?.signatureUrl
                        ? t('settings.profile.signature.replace')
                        : t('settings.profile.signature.upload')
                    }
                    onSelect={uploadSignature}
                    onReject={rejectSignature}
                    maxBytes={SIGNATURE_MAX_BYTES}
                    disabled={!access.canEditBranding || branding.isSaving || !branding.canWrite}
                  />
                  <UbText variant="caption" tone="tertiary">
                    {t('settings.profile.signature.hint')}
                  </UbText>
                </UbStack>
              </UbStack>
            </UbPanelSection>
          </UbPanel>
          {canEdit && (
            <UbStack direction="row" justify="end">
              <UbButton
                type="submit"
                busy={profile.isSaving}
                busyLabel={t('settings.action.saving')}
                disabled={!profile.canWrite || !formState.isDirty}
              >
                {t('settings.action.save')}
              </UbButton>
            </UbStack>
          )}
        </UbForm>

        <UbStack gap={4} className="lg:sticky lg:top-4 lg:self-start">
          <DocumentHeaderPreview
            logoSrc={branding.data?.logoUrl ?? null}
            name={watched.name ?? ''}
            legalName={watched.legalName ?? ''}
            addressLines={headerAddressLines(watched, locale as Locale)}
            gstinLine={headerGstinLine(watched, t('onboarding.gstin.label'))}
            phone={watched.phone ?? ''}
            email={watched.email ?? ''}
            labels={{
              title: t('settings.profile.preview.title'),
              placeholderName: t('settings.profile.preview.placeholder'),
              noLogo: t('branding.logo.none'),
              logoAlt: t('branding.logo.alt'),
            }}
          />
        </UbStack>
      </UbGrid>

      <UbConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={t('settings.profile.gst.confirm.title')}
        description={t(`settings.profile.gst.confirm.${pending?.gstType ?? 'regular'}`)}
        confirmLabel={t('settings.profile.gst.confirm.action')}
        cancelLabel={t('common.action.cancel')}
        closeLabel={t('common.action.close')}
        onConfirm={confirmGst}
      />
    </UbPageShell>
  );
}
