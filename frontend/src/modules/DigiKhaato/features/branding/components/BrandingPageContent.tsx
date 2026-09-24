'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { Lock } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';

import {
  UbButton,
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
  UbSkeleton,
  UbStack,
  UbStatusBadge,
  UbText,
  UbTextArea,
  UbTextInput,
} from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectActiveTenant } from 'src/redux/slice/sessionSlice';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';

import { useSettingsAccess } from '../../settings/hooks/useSettingsAccess';
import { useBranding } from '../hooks/useBranding';
import {
  APP_NAME_MAX,
  DOC_FOOTER_MAX,
  DOC_HEADER_MAX,
  useBrandingSchemas,
  type BrandingFormValues,
} from '../validation/brandingSchemas';

import { BrandingPreview } from './BrandingPreview';
import { ColourField } from './ColourField';

import type {
  Branding,
  BrandingChanges,
  BrandingTextKey,
  LockableKey,
} from '../types/branding.types';

const LOGO_MAX_BYTES = 2 * 1024 * 1024;

const FIELD_KEY: Readonly<Record<keyof BrandingFormValues, BrandingTextKey>> = {
  primaryHex: 'primary_hex',
  appName: 'app_name',
  docHeader: 'doc_header',
  docFooter: 'doc_footer',
};

const toForm = (branding: Branding | null): BrandingFormValues => ({
  primaryHex: branding?.primaryHex ?? '#4A47D6',
  appName: branding?.appName ?? '',
  docHeader: branding?.docHeader ?? '',
  docFooter: branding?.docFooter ?? '',
});

/**
 * WLB-01 — Settings → Branding. Logo, brand colour, app name, and the two
 * lines printed on bills, with a live preview (FR-10).
 *
 * Every field says where its value comes from: the shop's own ("Reset" hands
 * it back), the partner's or the product's default ("Using … default"), or a
 * partner lock (disabled, with the reason — the server refuses it anyway).
 * Owner and admin edit (`platform.branding.manage`); everyone else who opens
 * the page reads it.
 */
export function BrandingPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const access = useSettingsAccess();
  const tenant = useAppSelector(selectActiveTenant);
  const branding = useBranding();
  const { data, status, error, refetch } = branding;
  const { brandingSchema } = useBrandingSchemas();

  const defaults = useMemo(() => toForm(data), [data]);
  const form = useForm<BrandingFormValues>({
    resolver: yupResolver(brandingSchema),
    mode: 'onTouched',
    defaultValues: defaults,
  });
  const { reset, control, formState } = form;
  useEffect(() => {
    reset(defaults);
  }, [defaults, reset]);

  const [logoFile, setLogoFile] = useState<File | null>(null);
  // The chosen file's preview URL is derived, and released when it changes or
  // the page unmounts — an object URL is a blob held until revoked.
  const logoPreview = useMemo(() => (logoFile ? URL.createObjectURL(logoFile) : null), [logoFile]);
  useEffect(
    () => () => {
      if (logoPreview) URL.revokeObjectURL(logoPreview);
    },
    [logoPreview]
  );

  const watched = useWatch({ control });
  const canEdit = access.canEditBranding;
  const locked = useCallback((key: LockableKey) => Boolean(data?.lockedKeys.includes(key)), [data]);

  const submit = useCallback(
    async (values: BrandingFormValues) => {
      if (!data) return;
      const changes: { -readonly [K in keyof BrandingChanges]: BrandingChanges[K] } = {};
      (Object.keys(FIELD_KEY) as (keyof BrandingFormValues)[]).forEach((field) => {
        if (values[field] !== defaults[field] && !locked(FIELD_KEY[field] as LockableKey)) {
          changes[field] = values[field];
        }
      });
      if (logoFile) changes.logo = logoFile;
      const saved = await branding.save(changes);
      if (saved) setLogoFile(null);
    },
    [branding, data, defaults, locked, logoFile]
  );

  const resetKey = useCallback(
    (key: BrandingTextKey | 'logo') => void branding.save({ reset: [key] }, 'branding.resetDone'),
    [branding]
  );

  const rejectLogo = useCallback(
    (reason: 'too_large' | 'wrong_type') =>
      dispatch(
        showSnackbar({
          severity: 'error',
          id: reason === 'too_large' ? 'branding.logo.tooLarge' : 'branding.logo.wrongType',
        })
      ),
    [dispatch]
  );

  const sourceBadge = (key: BrandingTextKey | 'logo', lockKey?: LockableKey) => {
    if (!data) return null;
    if (lockKey && locked(lockKey)) {
      return (
        <UbStack direction="row" gap={1} align="center">
          <Lock aria-hidden className="h-3.5 w-3.5 text-text-tertiary" />
          <UbText variant="caption" tone="tertiary">
            {t('branding.locked', { partner: data.partnerName })}
          </UbText>
        </UbStack>
      );
    }
    const source = data.sources[key];
    if (source === 'tenant') {
      return canEdit ? (
        <UbButton
          variant="ghost"
          size="sm"
          onClick={() => resetKey(key)}
          disabled={branding.isSaving}
        >
          {t('branding.reset')}
        </UbButton>
      ) : null;
    }
    return (
      <UbStatusBadge
        tone="neutral"
        label={t('branding.usingDefault', {
          source: source === 'partner' ? data.partnerName : t('app.name'),
        })}
      />
    );
  };

  const header = <UbPageHeader title={t('branding.title')} subtitle={t('branding.subtitle')} />;

  if (status === 'failed') {
    return (
      <UbPageShell header={header}>
        <UbEmptyState
          variant="error"
          title={t('branding.error.title')}
          description={error?.message ?? t('branding.error.body')}
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
  if (!data) {
    return (
      <UbPageShell header={header}>
        <UbSkeleton variant="form" count={5} />
      </UbPageShell>
    );
  }

  const logoSrc = logoPreview ?? data.logoUrl;
  const disabled = !canEdit;

  return (
    <UbPageShell header={header}>
      <UbGrid columns={{ base: 1, lg: 2 }} gap={6}>
        <UbForm form={form} onSubmit={submit}>
          <UbPanel as="section">
            <UbPanelSection title={t('branding.logo.label')} action={sourceBadge('logo', 'logo')}>
              <UbStack direction="row" gap={3} align="center" wrap>
                <UbImagePreview
                  src={logoSrc}
                  alt={t('branding.logo.alt')}
                  emptyLabel={t('branding.logo.none')}
                  size="lg"
                />
                <UbStack gap={2}>
                  <UbFileUpload
                    label={
                      data.logoUrl || logoFile
                        ? t('branding.logo.replace')
                        : t('branding.logo.upload')
                    }
                    onSelect={setLogoFile}
                    onReject={rejectLogo}
                    maxBytes={LOGO_MAX_BYTES}
                    disabled={disabled || locked('logo')}
                  />
                  <UbText variant="caption" tone="tertiary">
                    {t('branding.logo.hint')}
                  </UbText>
                </UbStack>
              </UbStack>
            </UbPanelSection>
            <UbPanelSection
              title={t('branding.colour.label')}
              action={sourceBadge('primary_hex', 'primary_hex')}
            >
              <UbField
                name="primaryHex"
                label={t('branding.colour.hex')}
                placeholder={t('branding.colour.placeholder')}
                labelHidden
              >
                {(field) => (
                  <ColourField
                    field={field}
                    disabled={disabled || locked('primary_hex')}
                    suggestedHex={branding.suggestedHex}
                  />
                )}
              </UbField>
            </UbPanelSection>
            <UbPanelSection
              title={t('branding.appName.label')}
              action={sourceBadge('app_name', 'app_name')}
            >
              <UbField
                name="appName"
                label={t('branding.appName.label')}
                placeholder={t('branding.appName.placeholder')}
                hint={t('branding.appName.hint')}
                labelHidden
              >
                {(field) => (
                  <UbTextInput
                    {...field}
                    maxLength={APP_NAME_MAX}
                    disabled={disabled || locked('app_name')}
                  />
                )}
              </UbField>
            </UbPanelSection>
            <UbPanelSection
              title={t('branding.docHeader.label')}
              action={sourceBadge('doc_header')}
            >
              <UbField
                name="docHeader"
                label={t('branding.docHeader.label')}
                placeholder={t('branding.docHeader.placeholder')}
                labelHidden
              >
                {(field) => (
                  <UbTextArea
                    {...field}
                    rows={2}
                    maxLength={DOC_HEADER_MAX}
                    counterLabel={t('branding.counter', { count: '{count}', max: '{max}' })}
                    disabled={disabled}
                  />
                )}
              </UbField>
            </UbPanelSection>
            <UbPanelSection
              title={t('branding.docFooter.label')}
              action={sourceBadge('doc_footer', 'doc_footer')}
            >
              <UbField
                name="docFooter"
                label={t('branding.docFooter.label')}
                placeholder={t('branding.docFooter.placeholder')}
                hint={data.legalFooter ? t('branding.docFooter.legalHint') : undefined}
                labelHidden
              >
                {(field) => (
                  <UbTextArea
                    {...field}
                    rows={3}
                    maxLength={DOC_FOOTER_MAX}
                    counterLabel={t('branding.counter', { count: '{count}', max: '{max}' })}
                    disabled={disabled || locked('doc_footer')}
                  />
                )}
              </UbField>
            </UbPanelSection>
          </UbPanel>
          {canEdit && (
            <UbStack direction="row" justify="end">
              <UbButton
                type="submit"
                busy={branding.isSaving}
                busyLabel={t('settings.action.saving')}
                disabled={!branding.canWrite || (!formState.isDirty && !logoFile)}
              >
                {t('settings.action.save')}
              </UbButton>
            </UbStack>
          )}
        </UbForm>

        <UbStack gap={4} className="lg:sticky lg:top-4 lg:self-start">
          <BrandingPreview
            primaryHex={watched.primaryHex ?? defaults.primaryHex}
            appName={watched.appName || data.appName}
            businessName={tenant?.name ?? data.appName}
            docHeader={watched.docHeader ?? ''}
            docFooter={watched.docFooter ?? ''}
            legalFooter={data.legalFooter}
            logoSrc={logoSrc}
            labels={{
              title: t('branding.preview.title'),
              appHeader: t('branding.preview.app'),
              billHeader: t('branding.preview.bill'),
              sampleButton: t('branding.preview.button'),
              noLogo: t('branding.logo.none'),
              logoAlt: t('branding.logo.alt'),
            }}
          />
        </UbStack>
      </UbGrid>
    </UbPageShell>
  );
}
