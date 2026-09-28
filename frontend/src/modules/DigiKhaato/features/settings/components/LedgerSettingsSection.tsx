'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm, useWatch } from 'react-hook-form';

import {
  UbButton,
  UbCard,
  UbConfirmDialog,
  UbField,
  UbForm,
  UbPanel,
  UbPanelSection,
  UbRadioGroup,
  UbStack,
  UbText,
  UbTextArea,
} from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectActiveTenant } from 'src/redux/slice/sessionSlice';
import { formatInr } from 'src/utils/money';

import {
  CREDIT_MODES,
  useSettingsSchemas,
  type LedgerSettingsFormValues,
} from '../validation/settingsSchemas';
import {
  insertAt,
  REMINDER_MAX_CHARS,
  REMINDER_PLACEHOLDERS,
  renderTemplatePreview,
  type ReminderPlaceholder,
} from '../view-model/settingsDisplay';

import type { UseTenantSettingsResult } from '../hooks/useTenantSettings';
import type { CreditLimitMode, ReminderTemplates } from '../types/settings.types';

const toForm = (values: UseTenantSettingsResult['data']): LedgerSettingsFormValues => {
  const mode = values?.values['ledger.credit_limit_mode']?.mode ?? 'warn';
  const templates = values?.values['ledger.reminder_templates'] ?? { en: '', hi: '' };
  return { creditMode: mode, templateEn: templates.en ?? '', templateHi: templates.hi ?? '' };
};

/**
 * PLT-06 FR-1 "Ledger" — how the credit limit behaves (US-3, PTY-06) and the
 * reminder message customers receive, in both languages (US-4, FR-5).
 *
 * One `UbForm` with its own Save (FR-8). Read-only for the accountant (§9
 * "Disabled"): every control disabled and a "View only" note, rather than a
 * page that pretends to be editable and then refuses the save.
 */
export function LedgerSettingsSection({
  settings,
  canEdit,
}: Readonly<{ settings: UseTenantSettingsResult; canEdit: boolean }>): React.JSX.Element {
  const { t } = useTranslation();
  const { ledgerSettingsSchema } = useSettingsSchemas();
  const formId = useId();
  const [confirmReset, setConfirmReset] = useState(false);

  const defaults = useMemo(() => toForm(settings.data), [settings.data]);
  const form = useForm<LedgerSettingsFormValues>({
    resolver: yupResolver(ledgerSettingsSchema),
    mode: 'onTouched',
    defaultValues: defaults,
  });
  const { reset, setValue, control, formState } = form;

  useEffect(() => {
    reset(defaults);
  }, [defaults, reset]);

  const [templateEn, templateHi] = useWatch({ control, name: ['templateEn', 'templateHi'] });

  // QA D6 — the preview is the merchant's own message, so {business_name} is
  // THEIR business, not the sample "Kirana Bhandar". The sample stays only as
  // the fallback for a session that has not loaded a business yet.
  const businessName = useAppSelector(selectActiveTenant)?.name;
  const sample = useMemo(
    () => ({
      party_name: t('settings.template.sample.party'),
      business_name: businessName || t('settings.template.sample.business'),
      amount: formatInr('2300'),
      due_date: '30/09/2026',
      upi_link: 'upi://pay?pa=shop@okaxis',
    }),
    [t, businessName]
  );

  const submit = useCallback(
    async (values: LedgerSettingsFormValues) => {
      const templates: ReminderTemplates = { en: values.templateEn, hi: values.templateHi };
      const saved = await settings.saveSection('ledger', {
        'ledger.credit_limit_mode': { mode: values.creditMode },
        'ledger.reminder_templates': templates,
      });
      if (saved) reset(values);
    },
    [settings, reset]
  );

  // QA D7 — a chip inserts at the caret, not at the end. The textarea keeps its
  // selection after it loses focus to the chip, so it is read at click time;
  // afterwards the caret is put back just after the inserted placeholder.
  const areas = useRef<Partial<Record<'templateEn' | 'templateHi', HTMLTextAreaElement | null>>>(
    {}
  );
  const insertInto = useCallback(
    (field: 'templateEn' | 'templateHi', current: string, placeholder: ReminderPlaceholder) => {
      const area = areas.current[field];
      const caret = area ? area.selectionStart : null;
      const next = insertAt(current, placeholder, caret);
      setValue(field, next.text, {
        shouldDirty: true,
        shouldValidate: true,
      });
      if (area) {
        requestAnimationFrame(() => {
          area.focus();
          area.setSelectionRange(next.caret, next.caret);
        });
      }
    },
    [setValue]
  );

  const applyDefaults = useCallback(async () => {
    setConfirmReset(false);
    const values = await settings.loadDefaults();
    if (!values) return;
    const mode = (values['ledger.credit_limit_mode'] as { mode?: CreditLimitMode } | undefined)
      ?.mode;
    const templates = values['ledger.reminder_templates'] as ReminderTemplates | undefined;
    reset(
      {
        creditMode: mode ?? 'warn',
        templateEn: templates?.en ?? '',
        templateHi: templates?.hi ?? '',
      },
      { keepDefaultValues: true }
    );
  }, [settings, reset]);

  const modeOptions = useMemo(
    () =>
      CREDIT_MODES.map((mode) => ({
        value: mode,
        label: t(`settings.creditLimit.${mode}`),
        hint: t(`settings.creditLimit.${mode}.hint`),
      })),
    [t]
  );

  const disabled = !canEdit;
  const saving = settings.savingSection === 'ledger';

  const templateField = (field: 'templateEn' | 'templateHi', lang: 'en' | 'hi', value: string) => (
    <UbStack gap={2}>
      <UbField
        name={field}
        label={t(`settings.template.${lang}`)}
        placeholder={t('settings.template.placeholder')}
        hint={t('settings.template.hint')}
      >
        {(props) => (
          <UbTextArea
            {...props}
            ref={(element: HTMLTextAreaElement | null) => {
              props.ref(element);
              areas.current[field] = element;
            }}
            lang={lang}
            maxLength={REMINDER_MAX_CHARS}
            // `{count}`/`{max}` pass through as literal text for the control
            // to fill, as the grid's `pageOf` does.
            counterLabel={t('settings.template.counter', { count: '{count}', max: '{max}' })}
            disabled={disabled}
          />
        )}
      </UbField>
      <UbStack direction="row" gap={1} wrap aria-label={t('settings.template.insert')}>
        {REMINDER_PLACEHOLDERS.map((placeholder) => (
          <UbButton
            key={placeholder}
            variant="secondary"
            size="sm"
            disabled={disabled}
            onClick={() => insertInto(field, value ?? '', placeholder)}
          >
            {t(`settings.template.placeholder.${placeholder}`)}
          </UbButton>
        ))}
      </UbStack>
      <UbCard padded>
        <UbStack gap={1}>
          <UbText variant="caption" tone="tertiary">
            {t('settings.template.preview')}
          </UbText>
          <UbText variant="body" lang={lang} className="whitespace-pre-wrap break-words">
            {renderTemplatePreview(value ?? '', sample) || t('settings.template.previewEmpty')}
          </UbText>
        </UbStack>
      </UbCard>
    </UbStack>
  );

  return (
    <UbPanel as="section">
      <UbPanelSection
        title={t('settings.section.ledger')}
        badge={disabled ? t('settings.viewOnly') : undefined}
        action={
          canEdit ? (
            <UbButton variant="ghost" size="sm" onClick={() => setConfirmReset(true)}>
              {t('settings.reset.action')}
            </UbButton>
          ) : undefined
        }
      >
        <UbForm id={formId} form={form} onSubmit={submit}>
          {/* The radio group names itself (a fieldset legend), so the field's
              own <label> is suppressed and the visible heading is text. */}
          <UbText variant="label">{t('settings.creditLimit.label')}</UbText>
          <UbField name="creditMode" label={t('settings.creditLimit.label')} controlOwnsLabel>
            {(props) => (
              <UbRadioGroup<CreditLimitMode>
                name={props.name}
                value={props.value as CreditLimitMode}
                onChange={props.onChange}
                options={modeOptions.map((option) => ({ ...option, disabled }))}
                ariaLabel={t('settings.creditLimit.label')}
                variant="card"
              />
            )}
          </UbField>
          {templateField('templateEn', 'en', templateEn)}
          {templateField('templateHi', 'hi', templateHi)}
          {canEdit && (
            <UbStack direction="row" justify="end">
              <UbButton
                type="submit"
                busy={saving}
                busyLabel={t('settings.action.saving')}
                disabled={!settings.canWrite || !formState.isDirty}
              >
                {t('settings.action.save')}
              </UbButton>
            </UbStack>
          )}
        </UbForm>
      </UbPanelSection>

      <UbConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title={t('settings.reset.title')}
        description={t('settings.reset.body')}
        confirmLabel={t('settings.reset.confirm')}
        cancelLabel={t('common.action.cancel')}
        closeLabel={t('common.action.close')}
        onConfirm={() => void applyDefaults()}
      />
    </UbPanel>
  );
}
