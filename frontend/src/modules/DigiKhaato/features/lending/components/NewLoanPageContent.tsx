'use client';

import { useEffect, useId, useMemo, useState } from 'react';

import { useRouter, useSearchParams } from 'next/navigation';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm, useWatch } from 'react-hook-form';

import {
  UbButton,
  UbCard,
  UbChoiceChips,
  UbDateInput,
  UbEmptyState,
  UbField,
  UbForm,
  UbMoneyInput,
  UbNativeSelect,
  UbPageHeader,
  UbPageShell,
  UbPhoneInput,
  UbStack,
  UbStatusBanner,
  UbText,
  UbTextInput,
} from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useIdempotencyKey } from 'src/hooks/useIdempotencyKey';
import { usePermissions } from 'src/hooks/usePermissions';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectTenantTimezone } from 'src/redux/slice/sessionSlice';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import { ROUTES } from 'src/routes';
import { applyServerErrors } from 'src/utils/applyServerErrors';
import { formatBusinessDate, todayInTenantTz } from 'src/utils/dates';
import { formatInr } from 'src/utils/money';

import { toTermsBody } from '../api/lendingService';
import { selectLendingForm } from '../redux/lendingFormSlice';
import {
  createLendingLoan,
  fetchLendingBorrowers,
  fetchLendingRoutes,
  previewLendingLoan,
} from '../redux/lendingThunk';
import { selectLendingToday } from '../redux/lendingTodaySlice';
import {
  LATE_FEE_KINDS,
  PAYMENT_MODES,
  PLAN_FREQUENCIES,
  PLAN_TYPES,
  type LendingPaymentMode,
  type LoanFormValues,
  type PlanType,
} from '../types/lending.types';
import { useLendingSchemas } from '../validation/lendingSchemas';
import { WEEKDAY_BITS } from '../view-model/lendingDisplay';

const PREVIEW_DEBOUNCE_MS = 400;
const MON_TO_SAT = 63;
const SHOWN_ROWS = 5;

const addDays = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Server field → this form's field. */
const SERVER_FIELD: Readonly<Record<string, keyof LoanFormValues>> = {
  principal: 'principal',
  rate: 'rate',
  instalment_count: 'instalmentCount',
  per_instalment_amount: 'perInstalmentAmount',
  first_due_on: 'firstDueOn',
  disbursed_on: 'disbursedOn',
  'party.name': 'name',
  'party.mobile': 'mobile',
  borrower_id: 'borrowerId',
  deductions: 'fileCharge',
  'deductions.0.amount': 'fileCharge',
  collection_weekdays: 'collectionWeekdays',
};

/**
 * `/lending/loans/new` (FRD LEN-03, LEN-04; the agreed wireframe): who, the
 * plan, the money, and the live preview the server computes — the schedule,
 * the total to collect, the cash handed over and the effective yearly rate,
 * shown before anything is saved and never hidden behind a tap.
 */
export function NewLoanPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const formId = useId();
  const timezone = useAppSelector(selectTenantTimezone);
  const today = todayInTenantTz(timezone ?? undefined);
  const { preview, previewStatus, previewError, borrowers, saving } =
    useAppSelector(selectLendingForm);
  const { routes } = useAppSelector(selectLendingToday);
  const { can, hasModule } = usePermissions();
  const canLend = hasModule('lending') && can('lending.loan.create');
  const { key, rotate } = useIdempotencyKey();
  const { loanSchema } = useLendingSchemas();
  const [showAll, setShowAll] = useState(false);
  // "+ Loan" on a borrower's page opens this form with that person chosen
  // (`?borrower=<id>&name=<name>`); the name seeds the search so the picker's
  // first page holds them however long the book is.
  const params = useSearchParams();
  const givenBorrower = params.get('borrower') ?? '';
  const [search, setSearch] = useState(givenBorrower ? (params.get('name') ?? '') : '');

  const form = useForm<LoanFormValues>({
    resolver: yupResolver(loanSchema),
    mode: 'onTouched',
    defaultValues: {
      borrowerMode: givenBorrower ? 'existing' : 'new',
      borrowerId: givenBorrower,
      borrowerName: '',
      name: '',
      mobile: '',
      area: '',
      routeId: '',
      planType: 'fixed_daily',
      principal: '',
      fileCharge: '',
      rate: '2',
      rateUnit: 'per_month',
      frequency: 'daily',
      instalmentCount: '100',
      perInstalmentAmount: '',
      disbursedOn: today,
      firstDueOn: addDays(today, 1),
      collectionWeekdays: MON_TO_SAT,
      paymentMode: 'cash',
      notes: '',
      lateFeeKind: 'none',
      lateFeeValue: '',
      lateFeeCap: '',
      lateFeeGraceDays: '0',
    },
  });
  const values = useWatch({ control: form.control }) as LoanFormValues;
  const plan = values.planType;

  useEffect(() => {
    void dispatch(fetchLendingRoutes());
  }, [dispatch]);
  useEffect(() => {
    if (values.borrowerMode !== 'existing') return undefined;
    const promise = dispatch(fetchLendingBorrowers(search));
    return () => promise.abort();
  }, [dispatch, search, values.borrowerMode]);

  // The preview: debounced, the previous request cancelled, so a slow answer
  // never overwrites a newer one (FRD LEN-03 §7).
  const terms = useMemo(() => JSON.stringify(toTermsBody(values)), [values]);
  useEffect(() => {
    if (!(Number(values.principal) > 0)) return undefined;
    let request: { abort: () => void } | null = null;
    const id = window.setTimeout(() => {
      request = dispatch(previewLendingLoan(JSON.parse(terms) as Record<string, unknown>));
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(id);
      request?.abort();
    };
  }, [dispatch, terms, values.principal]);

  const save = async (data: LoanFormValues) => {
    const result = await dispatch(createLendingLoan({ values: data, key }));
    rotate();
    if (createLendingLoan.fulfilled.match(result)) {
      dispatch(
        showSnackbar({
          severity: 'success',
          id: 'lending.loan.saved',
          params: { number: result.payload.number, name: result.payload.borrower.name },
        })
      );
      router.push(`${ROUTES.LENDING_LOANS}/${result.payload.id}`);
      return;
    }
    const failure = result.payload;
    if (!failure) return;
    const details = Object.fromEntries(
      Object.entries(failure.details ?? {}).map(([k, m]) => [SERVER_FIELD[k] ?? k, m])
    );
    applyServerErrors({ ...failure, details }, form.setError, Object.values(SERVER_FIELD));
  };

  if (!canLend) {
    return (
      <UbPageShell>
        <UbEmptyState
          variant="firstUse"
          title={t('lending.noAccess.title')}
          description={t('lending.noAccess.body')}
        />
      </UbPageShell>
    );
  }

  const rows = preview?.schedule ?? [];
  const shown = showAll ? rows : rows.slice(0, SHOWN_ROWS);

  const money = (
    name: 'principal' | 'fileCharge' | 'perInstalmentAmount' | 'lateFeeValue' | 'lateFeeCap',
    required = false
  ) => (
    <UbField
      name={name}
      label={t(`lending.form.${name}`)}
      hint={name === 'fileCharge' ? t('lending.form.fileCharge.hint') : undefined}
      required={required}
      optionalLabel={required ? undefined : t('common.field.optional')}
      placeholder="0.00"
      className="flex-1"
    >
      {(field) => (
        <UbMoneyInput
          {...field}
          value={field.value as string}
          onChange={field.onChange}
          inputMode="decimal"
          disabled={saving}
        />
      )}
    </UbField>
  );

  return (
    <UbPageShell>
      <UbPageHeader title={t('lending.loan.new')} />
      <UbStack gap={4} className="lg:grid lg:grid-cols-[3fr_2fr] lg:items-start lg:gap-6">
        <UbForm id={formId} form={form} onSubmit={save}>
          <UbCard padded>
            <UbStack gap={1}>
              <UbText variant="label">{t('lending.form.who')}</UbText>
              <UbField name="borrowerMode" label={t('lending.form.who')} controlOwnsLabel>
                {(field) => (
                  <UbChoiceChips<'new' | 'existing'>
                    id={field.id}
                    ariaLabel={t('lending.form.who')}
                    value={field.value as 'new' | 'existing'}
                    onChange={(next) => field.onChange(next)}
                    options={[
                      { value: 'new', label: t('lending.form.who.new') },
                      { value: 'existing', label: t('lending.form.who.existing') },
                    ]}
                  />
                )}
              </UbField>
              {values.borrowerMode === 'new' ? (
                <>
                  <UbField
                    name="name"
                    label={t('lending.form.name')}
                    placeholder={t('lending.form.name.placeholder')}
                    required
                  >
                    {(field) => <UbTextInput {...field} autoComplete="off" disabled={saving} />}
                  </UbField>
                  <UbStack direction="row" gap={3} className="max-sm:flex-col">
                    <UbField
                      name="mobile"
                      label={t('lending.form.mobile')}
                      placeholder={t('lending.form.mobile.placeholder')}
                      optionalLabel={t('common.field.optional')}
                      className="flex-1"
                    >
                      {(field) => <UbPhoneInput {...field} disabled={saving} />}
                    </UbField>
                    <UbField
                      name="area"
                      label={t('lending.form.area')}
                      placeholder={t('lending.form.area.placeholder')}
                      optionalLabel={t('common.field.optional')}
                      className="flex-1"
                    >
                      {(field) => <UbTextInput {...field} autoComplete="off" disabled={saving} />}
                    </UbField>
                  </UbStack>
                </>
              ) : (
                <UbField name="borrowerId" label={t('lending.form.borrower')} required>
                  {(field) => (
                    <UbStack gap={2}>
                      <UbTextInput
                        id="lending-borrower-search"
                        name="lending-borrower-search"
                        aria-label={t('lending.form.borrower.search')}
                        placeholder={t('lending.form.borrower.search')}
                        value={search}
                        onChange={setSearch}
                      />
                      <UbNativeSelect
                        id={field.id}
                        name={field.name}
                        aria-label={t('lending.form.borrower')}
                        value={String(field.value ?? '')}
                        onChange={field.onChange}
                        invalid={field.invalid}
                        placeholder={t('lending.form.borrower.placeholder')}
                        options={borrowers.map((b) => ({
                          value: b.id,
                          label: `${b.name} · ${b.number}`,
                        }))}
                      />
                    </UbStack>
                  )}
                </UbField>
              )}
              {routes.length > 0 && (
                <UbField
                  name="routeId"
                  label={t('lending.route.label')}
                  optionalLabel={t('common.field.optional')}
                >
                  {(field) => (
                    <UbNativeSelect
                      id={field.id}
                      name={field.name}
                      aria-label={t('lending.route.label')}
                      value={String(field.value ?? '')}
                      onChange={field.onChange}
                      placeholder={t('lending.route.none')}
                      options={routes
                        .filter((r) => r.isActive)
                        .map((r) => ({ value: r.id, label: r.name }))}
                    />
                  )}
                </UbField>
              )}
            </UbStack>
          </UbCard>

          <UbCard padded>
            <UbStack gap={1}>
              <UbText variant="label">{t('lending.form.plan')}</UbText>
              <UbField name="planType" label={t('lending.form.plan')} controlOwnsLabel>
                {(field) => (
                  <UbChoiceChips<PlanType>
                    id={field.id}
                    ariaLabel={t('lending.form.plan')}
                    value={field.value as PlanType}
                    onChange={(next) => {
                      field.onChange(next);
                      form.setValue('frequency', PLAN_FREQUENCIES[next][0] ?? 'monthly');
                      if (next === 'flexible') form.setValue('firstDueOn', addDays(today, 90));
                    }}
                    options={PLAN_TYPES.map((p) => ({ value: p, label: t(`lending.plan.${p}`) }))}
                  />
                )}
              </UbField>
              <UbText variant="caption" tone="tertiary">
                {t(`lending.plan.${plan}.hint`)}
              </UbText>
              <UbStack direction="row" gap={3} className="max-sm:flex-col">
                {money('principal', true)}
                {money('fileCharge')}
              </UbStack>
              {plan !== 'flexible' && PLAN_FREQUENCIES[plan].length > 1 && (
                <UbField name="frequency" label={t('lending.form.frequency')} controlOwnsLabel>
                  {(field) => (
                    <UbChoiceChips<string>
                      id={field.id}
                      ariaLabel={t('lending.form.frequency')}
                      value={String(field.value)}
                      onChange={(next) => field.onChange(next)}
                      options={PLAN_FREQUENCIES[plan].map((f) => ({
                        value: f,
                        label: t(`lending.frequency.${f}`),
                      }))}
                    />
                  )}
                </UbField>
              )}
              {plan === 'fixed_daily' ? (
                <UbStack direction="row" gap={3} className="max-sm:flex-col">
                  {money('perInstalmentAmount', true)}
                  <UbField
                    name="instalmentCount"
                    label={t('lending.form.count')}
                    required
                    className="flex-1"
                  >
                    {(field) => <UbTextInput {...field} inputMode="numeric" autoComplete="off" />}
                  </UbField>
                </UbStack>
              ) : (
                <UbStack direction="row" gap={3} className="max-sm:flex-col">
                  <UbField
                    name="rate"
                    label={t('lending.form.rate')}
                    hint={t('lending.form.rate.hint')}
                    className="flex-1"
                  >
                    {(field) => <UbTextInput {...field} inputMode="decimal" autoComplete="off" />}
                  </UbField>
                  <UbField name="rateUnit" label={t('lending.form.rateUnit')} className="flex-1">
                    {(field) => (
                      <UbNativeSelect
                        id={field.id}
                        name={field.name}
                        aria-label={t('lending.form.rateUnit')}
                        value={String(field.value)}
                        onChange={field.onChange}
                        options={[
                          { value: 'per_month', label: t('lending.rate.per_month') },
                          { value: 'per_year', label: t('lending.rate.per_year') },
                        ]}
                      />
                    )}
                  </UbField>
                  {plan !== 'flexible' && (
                    <UbField
                      name="instalmentCount"
                      label={t('lending.form.count')}
                      required
                      className="flex-1"
                    >
                      {(field) => <UbTextInput {...field} inputMode="numeric" autoComplete="off" />}
                    </UbField>
                  )}
                </UbStack>
              )}
              <UbStack direction="row" gap={3} className="max-sm:flex-col">
                <UbField
                  name="disbursedOn"
                  label={t('lending.form.disbursedOn')}
                  className="flex-1"
                >
                  {(field) => (
                    <UbDateInput
                      id={field.id}
                      name={field.name}
                      aria-label={t('lending.form.disbursedOn')}
                      value={String(field.value ?? '')}
                      max={today}
                      onChange={(v: string | null) => field.onChange(v ?? '')}
                    />
                  )}
                </UbField>
                <UbField
                  name="firstDueOn"
                  label={t(plan === 'flexible' ? 'lending.form.endOn' : 'lending.form.firstDueOn')}
                  className="flex-1"
                >
                  {(field) => (
                    <UbDateInput
                      id={field.id}
                      name={field.name}
                      aria-label={t('lending.form.firstDueOn')}
                      value={String(field.value ?? '')}
                      min={values.disbursedOn}
                      onChange={(v: string | null) => field.onChange(v ?? '')}
                    />
                  )}
                </UbField>
              </UbStack>
              {values.frequency === 'daily' && (
                <UbField
                  name="collectionWeekdays"
                  label={t('lending.form.weekdays')}
                  controlOwnsLabel
                >
                  {(field) => (
                    <UbStack gap={1}>
                      <UbText variant="body-sm-medium">{t('lending.form.weekdays')}</UbText>
                      <UbStack direction="row" gap={1} wrap>
                        {WEEKDAY_BITS.map((bit, i) => {
                          const on = (Number(field.value) & bit) !== 0;
                          return (
                            <UbButton
                              key={bit}
                              size="sm"
                              variant={on ? 'primary' : 'secondary'}
                              aria-pressed={on}
                              onClick={() => field.onChange(Number(field.value) ^ bit)}
                            >
                              {t(`lending.weekday.${i}`)}
                            </UbButton>
                          );
                        })}
                      </UbStack>
                    </UbStack>
                  )}
                </UbField>
              )}
            </UbStack>
          </UbCard>

          {/* LEN-09 FR-1 — a late fee is charged only when the borrower agreed to one
              here; the rule is frozen with the terms. */}
          <UbCard padded>
            <UbStack gap={3} data-testid="lending-late-fee-terms">
              <UbField name="lateFeeKind" label={t('lending.form.lateFeeKind')}>
                {(field) => (
                  <UbNativeSelect
                    id={field.id}
                    value={String(field.value ?? 'none')}
                    onChange={field.onChange}
                    options={LATE_FEE_KINDS.map((kind) => ({
                      value: kind,
                      label: t(`lending.lateFee.kind.${kind}`),
                    }))}
                  />
                )}
              </UbField>
              {values.lateFeeKind && values.lateFeeKind !== 'none' && (
                <UbStack direction="row" gap={3} className="max-sm:flex-col">
                  {values.lateFeeKind === 'simple_interest' ? (
                    <UbField
                      name="lateFeeValue"
                      label={t('lending.form.lateFeeRate')}
                      required
                      className="flex-1"
                    >
                      {(field) => <UbTextInput {...field} inputMode="decimal" autoComplete="off" />}
                    </UbField>
                  ) : (
                    money('lateFeeValue', true)
                  )}
                  {values.lateFeeKind !== 'flat_once' && money('lateFeeCap', true)}
                  <UbField
                    name="lateFeeGraceDays"
                    label={t('lending.form.lateFeeGraceDays')}
                    className="flex-1"
                  >
                    {(field) => <UbTextInput {...field} inputMode="numeric" autoComplete="off" />}
                  </UbField>
                </UbStack>
              )}
            </UbStack>
          </UbCard>

          <UbCard padded>
            <UbStack gap={1}>
              <UbField name="paymentMode" label={t('lending.form.givenBy')} controlOwnsLabel>
                {(field) => (
                  <UbStack gap={1}>
                    <UbText variant="body-sm-medium">{t('lending.form.givenBy')}</UbText>
                    <UbChoiceChips<LendingPaymentMode>
                      id={field.id}
                      ariaLabel={t('lending.form.givenBy')}
                      value={field.value as LendingPaymentMode}
                      onChange={(next) => field.onChange(next)}
                      options={PAYMENT_MODES.map((m) => ({
                        value: m,
                        label: t(`lending.mode.${m}`),
                      }))}
                    />
                  </UbStack>
                )}
              </UbField>
              <UbField
                name="notes"
                label={t('lending.form.notes')}
                placeholder={t('lending.form.notes.placeholder')}
                optionalLabel={t('common.field.optional')}
              >
                {(field) => <UbTextInput {...field} autoComplete="off" disabled={saving} />}
              </UbField>
            </UbStack>
          </UbCard>
        </UbForm>

        <UbStack gap={3} className="lg:sticky lg:top-4">
          <UbCard padded>
            <UbStack gap={2} data-testid="lending-loan-preview">
              <UbText variant="label">{t('lending.preview.title')}</UbText>
              {!preview ? (
                <UbText variant="body-sm" tone={previewError ? 'warning' : 'tertiary'}>
                  {previewError?.message ??
                    (previewStatus === 'loading'
                      ? t('lending.preview.working')
                      : t('lending.preview.empty'))}
                </UbText>
              ) : (
                <>
                  {[
                    ['lending.preview.cash', preview.cashHandedOver],
                    ['lending.preview.total', preview.totalPayable],
                    [
                      'lending.preview.cost',
                      (Number(preview.totalInterest) + Number(preview.deductionsTotal)).toFixed(2),
                    ],
                  ].map(([id, amount]) => (
                    <UbStack key={id} direction="row" justify="between" gap={2}>
                      <UbText variant="body-sm" tone="secondary">
                        {t(String(id))}
                      </UbText>
                      <UbText variant="body-sm-medium">{formatInr(String(amount))}</UbText>
                    </UbStack>
                  ))}
                  <UbStack direction="row" justify="between" gap={2}>
                    <UbText variant="body-sm" tone="secondary">
                      {t('lending.preview.rate')}
                    </UbText>
                    <UbText variant="body-sm-medium">
                      {t('lending.preview.rateValue', { rate: preview.effectiveAnnualRateDisplay })}
                    </UbText>
                  </UbStack>
                  <UbText variant="caption" tone="tertiary">
                    {t('lending.preview.ends', {
                      count: rows.length,
                      date: formatBusinessDate(preview.maturityOn),
                    })}
                  </UbText>
                  {preview.warnings.includes('interest_above_principal') && (
                    <UbStatusBanner tone="info" title={t('lending.preview.interestAbove')} />
                  )}
                  <UbStack gap={0} as="ul" aria-label={t('lending.preview.schedule')}>
                    {shown.map((row) => (
                      <UbStack
                        as="li"
                        key={row.seq}
                        direction="row"
                        justify="between"
                        gap={2}
                        className="border-t border-border-hairline py-1"
                      >
                        <UbText variant="caption" tone="secondary">
                          {`${row.seq}. ${formatBusinessDate(row.dueOn)}`}
                        </UbText>
                        <UbText variant="caption">{formatInr(row.amount)}</UbText>
                      </UbStack>
                    ))}
                  </UbStack>
                  {rows.length > SHOWN_ROWS && (
                    <UbButton size="sm" variant="ghost" onClick={() => setShowAll((s) => !s)}>
                      {showAll
                        ? t('lending.preview.showLess')
                        : t('lending.preview.showAll', { count: rows.length })}
                    </UbButton>
                  )}
                </>
              )}
            </UbStack>
          </UbCard>
          <UbButton
            type="submit"
            form={formId}
            busy={saving}
            disabled={!preview}
            data-testid="lending-loan-save"
          >
            {preview
              ? t('lending.loan.save', { amount: formatInr(preview.cashHandedOver) })
              : t('lending.loan.saveDisabled')}
          </UbButton>
        </UbStack>
      </UbStack>
    </UbPageShell>
  );
}
