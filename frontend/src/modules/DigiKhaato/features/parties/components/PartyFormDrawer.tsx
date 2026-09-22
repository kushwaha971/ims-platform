'use client';

import { useCallback, useEffect, useId, useMemo } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';

import {
  UbButton,
  UbDateInput,
  UbDisclosure,
  UbDrawer,
  UbField,
  UbForm,
  UbLink,
  UbMoneyInput,
  UbPhoneInput,
  UbRadioGroup,
  UbSelect,
  UbStatusBanner,
  UbSwitch,
  UbText,
  UbTextInput,
  isoFinancialYearStart,
  isoToday,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';

import { usePartySchemas } from '../validation/partySchemas';

import type { UsePartyFormResult } from '../hooks/usePartyForm';
import type { PartyFormValues } from '../types/party.types';

/**
 * PTY-01 — add or edit a party.
 *
 * ── Three fields, then everything else ──────────────────────────────────────
 * A merchant standing at a counter with a customer waiting must be able to add
 * a name and a number and get back to work. So the form opens on exactly that:
 * name, mobile, and whether this is someone they sell to, buy from, or both.
 * Twenty other fields exist and every one of them is behind a disclosure that
 * starts closed.
 *
 * The temptation is to show the GST section because it looks important. It is
 * important to the accountant who fills it in once a quarter, and it is in the
 * way of the person adding their fourth customer of the morning.
 *
 * ── A drawer, not a dialog ──────────────────────────────────────────────────
 * At twenty-odd fields a 420 px centred card is a letterbox, and it hides the
 * list the merchant was working from — which matters, because adding a party is
 * almost always something done in the middle of another job. `UbDrawer` is a
 * bottom sheet on a phone and a right-hand panel on a desktop, so the list
 * stays visible beside it.
 */
export function PartyFormDrawer({
  form: partyForm,
}: Readonly<{ form: UsePartyFormResult }>): React.JSX.Element {
  const { t } = useTranslation();
  const { partySchema } = usePartySchemas();
  const formId = useId();

  const { open, isEdit, editing, isSaving, canWrite, formErrors, duplicateOf, close, submit } =
    partyForm;

  const defaults = useMemo<PartyFormValues>(
    () => ({
      name: editing?.name ?? '',
      mobile: editing?.mobile ?? '',
      isCustomer: editing?.isCustomer ?? true,
      isSupplier: editing?.isSupplier ?? false,
      displayCode: editing?.displayCode ?? '',
      altPhone: editing?.altPhone ?? '',
      email: editing?.email ?? '',
      gstin: editing?.gstin ?? '',
      stateCode: editing?.stateCode ?? '',
      billingLine1: editing?.billingAddress?.line1 ?? '',
      billingCity: editing?.billingAddress?.city ?? '',
      billingPincode: editing?.billingAddress?.pincode ?? '',
      notes: editing?.notes ?? '',
      creditLimit: editing?.creditLimit ?? '',
      creditDays: editing?.creditDays != null ? String(editing.creditDays) : '',
      collectionDate: editing?.collectionDate ?? '',
      smsOptIn: editing?.smsOptIn ?? true,
      consentSource: editing?.consentSource ?? '',
      openingAmount: '',
      openingDirection: 'debit',
      openingAsOf: isoFinancialYearStart(),
    }),
    [editing]
  );

  const form = useForm<PartyFormValues>({
    resolver: yupResolver(partySchema),
    mode: 'onTouched',
    defaultValues: defaults,
  });

  const { reset, setError, formState } = form;

  /**
   * Reset when the drawer OPENS, not when it closes: clearing on close races
   * the closing animation and blanks the fields while they are still on screen,
   * and throws away what was typed if a stray tap dismissed it.
   */
  useEffect(() => {
    if (open) reset(defaults);
  }, [open, reset, defaults]);

  const handleSubmit = useCallback(
    (values: PartyFormValues) => submit(values, setError),
    [submit, setError]
  );

  /**
   * A section opens itself when something inside it is wrong. The server can
   * refuse a GSTIN the merchant typed into a group they have since folded away,
   * and an error nobody can see is an error nobody can fix.
   */
  const errors = formState.errors;
  const gstHasError = Boolean(
    errors.gstin ?? errors.stateCode ?? errors.billingLine1 ?? errors.billingPincode ?? errors.email
  );
  const creditHasError = Boolean(errors.creditLimit ?? errors.creditDays);
  const openingHasError = Boolean(errors.openingAmount);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) close();
    },
    [close]
  );

  const directionOptions = useMemo(
    () => [
      { value: 'debit', label: t('parties.form.opening.debit') },
      { value: 'credit', label: t('parties.form.opening.credit') },
    ],
    [t]
  );

  const consentOptions = useMemo(
    () =>
      ['verbal', 'form', 'link'].map((value) => ({
        value,
        label: t(`parties.form.consent.${value}`),
      })),
    [t]
  );

  return (
    <UbDrawer
      open={open}
      onOpenChange={handleOpenChange}
      title={isEdit ? t('parties.form.title.edit') : t('parties.form.title.create')}
      description={isEdit ? undefined : t('parties.form.subtitle')}
      closeLabel={t('common.action.close')}
      // A stray tap on the backdrop must not take a half-filled form with it.
      dismissOnBackdrop={!formState.isDirty}
      footer={
        <>
          <UbButton variant="secondary" onClick={close} disabled={isSaving}>
            {t('common.action.cancel')}
          </UbButton>
          <UbButton
            type="submit"
            form={formId}
            busy={isSaving}
            busyLabel={t('parties.form.submitting')}
            disabled={!canWrite}
          >
            {isEdit ? t('parties.form.submit.edit') : t('parties.form.submit.create')}
          </UbButton>
        </>
      }
    >
      <UbForm id={formId} form={form} onSubmit={handleSubmit} formErrors={formErrors}>
        {!canWrite && <UbStatusBanner tone="info" title={t('parties.form.readOnly')} />}

        {duplicateOf && (
          /* The server refuses a duplicate with the existing party's ID and
             deliberately not its name — that is another record's data. So this
             offers to open it rather than naming it, and the ordinary detail
             read decides whether the name may be shown. */
          <UbStatusBanner
            tone="warning"
            title={t('parties.form.duplicate.title')}
            description={t('parties.form.duplicate.body')}
            action={
              <UbLink href={`/parties/${duplicateOf}`} variant="body-sm">
                {t('parties.form.duplicate.open')}
              </UbLink>
            }
          />
        )}

        {/* ── The fifteen-second path ─────────────────────────────────────── */}
        <UbField name="name" label={t('parties.form.name.label')} required>
          {(field) => (
            <UbTextInput {...field} autoComplete="off" placeholder={t('parties.form.name.hint')} />
          )}
        </UbField>

        {/* `UbPhoneInput`, not a text field with `type="tel"`. The schema's
            rule is E.164 (`+91XXXXXXXXXX`), and a merchant types ten digits —
            so a plain field turns "9812345678" into a format error about a
            prefix nobody asked them for. This component shows the national
            digits and commits E.164. */}
        <UbField
          name="mobile"
          label={t('parties.form.mobile.label')}
          hint={t('parties.form.mobile.hint')}
        >
          {(field) => <UbPhoneInput {...field} autoComplete="off" />}
        </UbField>

        {/* Two switches rather than a three-way "Customer / Supplier / Both".
            Both is not a third kind of party — it is both boxes ticked — and a
            segmented control that has to invent a word for the combination is
            a control explaining its own implementation. */}
        <UbField name="isCustomer" label={t('parties.form.isCustomer')} controlOwnsLabel>
          {(field) => (
            <UbSwitch
              checked={Boolean(field.value)}
              onCheckedChange={field.onChange}
              label={t('parties.form.isCustomer')}
              id={field.id}
            />
          )}
        </UbField>
        <UbField name="isSupplier" label={t('parties.form.isSupplier')} controlOwnsLabel>
          {(field) => (
            <UbSwitch
              checked={Boolean(field.value)}
              onCheckedChange={field.onChange}
              label={t('parties.form.isSupplier')}
              id={field.id}
            />
          )}
        </UbField>

        {/* ── Everything else, folded away ───────────────────────────────── */}
        {!isEdit && (
          <UbDisclosure
            label={t('parties.form.section.opening')}
            hint={t('parties.form.section.opening.hint')}
            open={openingHasError || undefined}
          >
            <UbField name="openingAmount" label={t('parties.form.opening.amount')}>
              {(field) => <UbMoneyInput {...field} />}
            </UbField>
            <UbField name="openingDirection" label={t('parties.form.opening.direction')}>
              {(field) => <UbRadioGroup {...field} options={directionOptions} />}
            </UbField>
            <UbField name="openingAsOf" label={t('parties.form.opening.asOf')}>
              {(field) => (
                <UbDateInput
                  {...field}
                  max={isoToday()}
                  quickChoices={[
                    { label: t('parties.form.opening.fyStart'), date: isoFinancialYearStart() },
                    { label: t('parties.form.opening.today'), date: isoToday() },
                  ]}
                />
              )}
            </UbField>
            {/* The one sentence that keeps the screen honest about scope: the
                server stores this and posts nothing until LED-02 lands. */}
            <UbText variant="caption" tone="tertiary">
              {t('parties.form.opening.notPostedYet')}
            </UbText>
          </UbDisclosure>
        )}

        <UbDisclosure label={t('parties.form.section.gst')} open={gstHasError || undefined}>
          <UbField name="gstin" label={t('parties.form.gstin.label')}>
            {(field) => <UbTextInput {...field} uppercase autoComplete="off" />}
          </UbField>
          <UbField name="stateCode" label={t('parties.form.state.label')}>
            {(field) => <UbTextInput {...field} uppercase maxLength={2} autoComplete="off" />}
          </UbField>
          <UbField name="email" label={t('parties.form.email.label')}>
            {(field) => <UbTextInput {...field} type="email" autoComplete="off" />}
          </UbField>
          <UbField name="billingLine1" label={t('parties.form.address.line1')}>
            {(field) => <UbTextInput {...field} autoComplete="off" />}
          </UbField>
          <UbField name="billingCity" label={t('parties.form.address.city')}>
            {(field) => <UbTextInput {...field} autoComplete="off" />}
          </UbField>
          <UbField name="billingPincode" label={t('parties.form.address.pincode')}>
            {(field) => <UbTextInput {...field} inputMode="numeric" autoComplete="off" />}
          </UbField>
        </UbDisclosure>

        <UbDisclosure label={t('parties.form.section.credit')} open={creditHasError || undefined}>
          <UbField name="creditLimit" label={t('parties.form.creditLimit.label')}>
            {(field) => <UbMoneyInput {...field} />}
          </UbField>
          <UbField
            name="creditDays"
            label={t('parties.form.creditDays.label')}
            hint={t('parties.form.creditDays.hint')}
          >
            {(field) => <UbTextInput {...field} inputMode="numeric" autoComplete="off" />}
          </UbField>
          <UbField name="collectionDate" label={t('parties.form.collectionDate.label')}>
            {(field) => <UbDateInput {...field} />}
          </UbField>
        </UbDisclosure>

        <UbDisclosure label={t('parties.form.section.other')}>
          <UbField name="displayCode" label={t('parties.form.code.label')}>
            {(field) => <UbTextInput {...field} autoComplete="off" />}
          </UbField>
          <UbField name="altPhone" label={t('parties.form.altPhone.label')}>
            {(field) => <UbPhoneInput {...field} autoComplete="off" />}
          </UbField>
          <UbField name="notes" label={t('parties.form.notes.label')}>
            {(field) => <UbTextInput {...field} autoComplete="off" />}
          </UbField>
          <UbField name="smsOptIn" label={t('parties.form.sms.label')} controlOwnsLabel>
            {(field) => (
              <UbSwitch
                checked={Boolean(field.value)}
                onCheckedChange={field.onChange}
                label={t('parties.form.sms.label')}
                description={t('parties.form.sms.hint')}
                id={field.id}
              />
            )}
          </UbField>
          <UbField name="consentSource" label={t('parties.form.consent.label')}>
            {(field) => (
              <UbSelect
                {...field}
                options={consentOptions}
                placeholder={t('parties.form.consent.placeholder')}
              />
            )}
          </UbField>
        </UbDisclosure>
      </UbForm>
    </UbDrawer>
  );
}
