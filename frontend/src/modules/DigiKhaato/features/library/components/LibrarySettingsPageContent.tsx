'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';

import dynamic from 'next/dynamic';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm, type FieldErrors } from 'react-hook-form';

import {
  UbActionLink,
  UbBottomBar,
  UbButton,
  UbCard,
  UbEmptyState,
  UbField,
  UbForm,
  UbMoneyInput,
  UbPageHeader,
  UbPageShell,
  UbPageSkeleton,
  UbRadioGroup,
  UbStack,
  UbSwitch,
  UbTabs,
  UbText,
  UbTextInput,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { ROUTES } from 'src/routes';
import { applyServerErrors } from 'src/utils/applyServerErrors';

import { useLibrarySettings } from '../hooks/useLibrarySettings';
import {
  FINE_ROUNDINGS,
  LIBRARY_SETTINGS_TABS,
  LOST_FOUND_PAID,
  OVERDUE_ISSUE_RULES,
  RENEW_FROM,
  RENEW_OVERDUE,
  type LibraryNumberKind,
  type LibrarySettingsFormValues,
  type LibrarySettingsTab,
} from '../types/settings.types';
import { useLibrarySettingsSchemas } from '../validation/settingsSchemas';
import { FIELD_TAB, fromSettingsForm, toSettingsForm } from '../view-model/settingsDisplay';

/** The counter dialog loads with the tap that opens it (CLAUDE.md). */
const RaiseNumberDialogLazy = dynamic(
  () => import('./RaiseNumberDialog').then((m) => m.RaiseNumberDialog),
  { ssr: false }
);

const FIELDS = Object.keys(FIELD_TAB) as (keyof LibrarySettingsFormValues)[];

/**
 * F02 (LIB-01 §7, §8) — `/library/settings`: how the library lends, fines,
 * charges a lost book and keeps a reserved one, and where its two counters
 * stand. One form across five tabs with one Save, because the row is saved
 * whole with its `version`: a tab that saved alone would race the next.
 *
 * Read-only for a library reader without `library.settings.manage` (§6): the
 * controls are disabled and there is no Save, rather than a page that refuses
 * the save afterwards. Closed weekdays are shown, not edited — they are the
 * core calendar's (G8), and the link goes there.
 */
export function LibrarySettingsPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const settings = useLibrarySettings();
  const { librarySettingsSchema } = useLibrarySettingsSchemas();
  const formId = useId();
  const [tab, setTab] = useState<LibrarySettingsTab>('general');
  const [raising, setRaising] = useState<LibraryNumberKind | null>(null);
  const bundle = settings.bundle;

  const defaults = useMemo(() => (bundle ? toSettingsForm(bundle.settings) : undefined), [bundle]);
  const form = useForm<LibrarySettingsFormValues>({
    resolver: yupResolver(librarySettingsSchema),
    mode: 'onTouched',
    defaultValues: defaults,
  });
  const { reset, setError, formState } = form;
  useEffect(() => {
    if (defaults) reset(defaults);
  }, [defaults, reset]);

  const submit = useCallback(
    async (values: LibrarySettingsFormValues) => {
      if (!bundle) return;
      const outcome = await settings.save(fromSettingsForm(values, bundle.settings.version));
      if (outcome.ok || !outcome.error || outcome.error.code !== 'validation_error') return;
      applyServerErrors(outcome.error, setError, FIELDS);
      const first = FIELDS.find((field) => field in (outcome.error?.details ?? {}));
      if (first) setTab(FIELD_TAB[first] as LibrarySettingsTab);
    },
    [bundle, settings, setError]
  );

  // A client-side refusal opens the tab its first field is on, so the red
  // message is never on a tab the librarian is not looking at.
  const onInvalid = useCallback((errors: FieldErrors<LibrarySettingsFormValues>) => {
    const first = FIELDS.find((field) => field in errors);
    if (first) setTab(FIELD_TAB[first] as LibrarySettingsTab);
  }, []);

  if (!settings.canRead) {
    return (
      <UbPageShell>
        <UbEmptyState
          variant="firstUse"
          title={t('library.noAccess.title')}
          description={t('library.noAccess.body')}
        />
      </UbPageShell>
    );
  }
  if (settings.status === 'failed' && !bundle) {
    return (
      <UbPageShell>
        <UbEmptyState
          variant="error"
          title={t('library.settings.error.title')}
          description={settings.error?.message}
          requestId={settings.error?.requestId ?? null}
          requestIdLabel={t('common.error.reference')}
          action={
            <UbButton variant="secondary" onClick={settings.refetch}>
              {t('common.action.retry')}
            </UbButton>
          }
        />
      </UbPageShell>
    );
  }
  if (!bundle || !defaults) return <UbPageSkeleton variant="form" />;

  const disabled = !settings.canManage || settings.saving;
  const tabs = LIBRARY_SETTINGS_TABS.map((value) => ({
    value,
    label: t(`library.settings.tab.${value}`),
  }));

  const choice = <K extends keyof LibrarySettingsFormValues>(
    name: K,
    values: readonly string[]
  ): React.JSX.Element => (
    <UbField name={name} label={t(`library.settings.${name}`)} controlOwnsLabel>
      {(field) => (
        <UbStack gap={2}>
          <UbText variant="label">{t(`library.settings.${name}`)}</UbText>
          <UbRadioGroup<string>
            name={field.name}
            value={String(field.value)}
            onChange={field.onChange}
            ariaLabel={t(`library.settings.${name}`)}
            variant="card"
            options={values.map((value) => ({
              value,
              label: t(`library.settings.${name}.${value}`),
              hint: t(`library.settings.${name}.${value}.hint`),
              disabled,
            }))}
          />
        </UbStack>
      )}
    </UbField>
  );

  const toggle = (name: keyof LibrarySettingsFormValues): React.JSX.Element => (
    <UbField name={name} label={t(`library.settings.${name}`)} controlOwnsLabel>
      {(field) => (
        <UbSwitch
          id={field.id}
          checked={Boolean(field.value)}
          onCheckedChange={field.onChange}
          label={t(`library.settings.${name}`)}
          description={t(`library.settings.${name}.hint`)}
          disabled={disabled}
        />
      )}
    </UbField>
  );

  const text = (
    name: keyof LibrarySettingsFormValues,
    placeholder: string,
    inputMode: 'numeric' | 'decimal' | 'text' = 'numeric'
  ): React.JSX.Element => (
    <UbField
      name={name}
      label={t(`library.settings.${name}`)}
      hint={t(`library.settings.${name}.hint`)}
      placeholder={placeholder}
    >
      {(field) => (
        <UbTextInput
          {...field}
          value={String(field.value ?? '')}
          inputMode={inputMode}
          disabled={disabled}
        />
      )}
    </UbField>
  );

  const money = (name: keyof LibrarySettingsFormValues, optional = false): React.JSX.Element => (
    <UbField
      name={name}
      label={t(`library.settings.${name}`)}
      hint={t(`library.settings.${name}.hint`)}
      placeholder="0.00"
      optionalLabel={optional ? t('common.field.optional') : undefined}
    >
      {(field) => (
        <UbMoneyInput
          {...field}
          value={field.value as string}
          onChange={field.onChange}
          inputMode="decimal"
          disabled={disabled}
        />
      )}
    </UbField>
  );

  const counter = (kind: LibraryNumberKind, next: string): React.JSX.Element => (
    <UbCard padded>
      <UbStack direction="row" justify="between" align="center" gap={3}>
        <UbStack gap={1}>
          <UbText variant="caption" tone="tertiary">
            {t(`library.settings.number.${kind}`)}
          </UbText>
          <UbText variant="metric-lg" data-testid={`library-next-${kind}`}>
            {next}
          </UbText>
        </UbStack>
        {settings.canManage && (
          <UbButton variant="secondary" size="sm" onClick={() => setRaising(kind)}>
            {t('library.settings.number.change')}
          </UbButton>
        )}
      </UbStack>
    </UbCard>
  );

  const panels: Record<LibrarySettingsTab, React.JSX.Element> = {
    general: (
      <UbStack gap={4}>
        {counter('library_accession', String(bundle.numbering.accessionNext))}
        {counter('library_member', bundle.numbering.memberDisplay)}
        {choice('overdueIssueRule', OVERDUE_ISSUE_RULES)}
        {toggle('lostCountsTowardLimit')}
      </UbStack>
    ),
    loans: (
      <UbStack gap={4}>
        {choice('renewFrom', RENEW_FROM)}
        {choice('renewOverdue', RENEW_OVERDUE)}
        <UbText variant="body-sm" tone="secondary">
          {t('library.settings.loanRulesNote')}
        </UbText>
      </UbStack>
    ),
    fines: (
      <UbStack gap={4}>
        {toggle('fineSkipClosedDays')}
        <UbStack gap={1}>
          <UbText variant="body-sm" tone="secondary">
            {bundle.closedWeekdays.length
              ? t('library.settings.closedWeekdays', {
                  days: bundle.closedWeekdays
                    .map((day) => t(`library.settings.weekday.${day}`))
                    .join(', '),
                })
              : t('library.settings.closedWeekdays.none')}
          </UbText>
          <UbActionLink href={ROUTES.SETTINGS_BUSINESS_DAYS} variant="link">
            {t('library.settings.closedWeekdays.edit')}
          </UbActionLink>
        </UbStack>
        {choice('fineRounding', FINE_ROUNDINGS)}
        {money('waiverCeiling', true)}
      </UbStack>
    ),
    lost: (
      <UbStack gap={4}>
        {text('lostMultiplier', '1', 'decimal')}
        {money('lostProcessingFee')}
        {money('fallbackPrice', true)}
        {choice('lostFoundPaid', LOST_FOUND_PAID)}
        {money('damageMinorAmount')}
        {text('damageMajorPercent', '50')}
      </UbStack>
    ),
    holds: (
      <UbStack gap={4}>
        {text('holdPickupDays', '3')}
        {text('overdueReminderDays', '1, 7, 14, 30', 'text')}
        {toggle('remindDayBefore')}
      </UbStack>
    ),
  };

  return (
    <UbPageShell width="measure">
      <UbPageHeader title={t('library.settings.title')} />
      <UbForm id={formId} form={form} onSubmit={submit} onInvalid={onInvalid}>
        <UbTabs<LibrarySettingsTab>
          value={tab}
          onValueChange={setTab}
          tabs={tabs}
          ariaLabel={t('library.settings.title')}
          layout="fit"
        >
          {panels[tab]}
        </UbTabs>
      </UbForm>
      {settings.canManage && (
        <UbBottomBar className="flex justify-end border-t border-border-hairline bg-surface-card px-4 py-3">
          <UbButton
            type="submit"
            form={formId}
            busy={settings.saving}
            busyLabel={t('library.working')}
            disabled={!formState.isDirty}
            data-testid="library-settings-save"
          >
            {t('library.form.save')}
          </UbButton>
        </UbBottomBar>
      )}
      {raising && (
        <RaiseNumberDialogLazy
          kind={raising}
          current={
            raising === 'library_accession'
              ? bundle.numbering.accessionNext
              : bundle.numbering.memberNext
          }
          busy={settings.raising}
          onClose={() => setRaising(null)}
          onSubmit={async (next) => {
            const outcome = await settings.raise(raising, next);
            if (outcome.ok) setRaising(null);
            return outcome;
          }}
        />
      )}
    </UbPageShell>
  );
}
