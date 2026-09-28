'use client';

import { useCallback, useEffect, useId, useMemo, type RefObject } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm, useWatch } from 'react-hook-form';

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
import { compareMoney, formatAmount, parseAmountInput } from 'src/utils/money';

import { MAX_TAGS_PER_PARTY } from '../constants/partyTags';
import { usePartyTags } from '../hooks/usePartyTags';
import { usePartySchemas } from '../validation/partySchemas';

import { PartyTagField } from './PartyTagField';

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
  returnFocusRef,
}: Readonly<{
  form: UsePartyFormResult;
  /** Focus target on close when the opener is gone (QA D1) — the khata's ⋯. */
  returnFocusRef?: RefObject<HTMLElement | null>;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const { partySchema } = usePartySchemas();
  const formId = useId();
  /* Unconditional: the thunk's own `condition` decides whether a request goes
     out, so three screens asking at once still costs one (§19.3.5). */
  const { byUsage: tagOptions } = usePartyTags();

  const {
    open,
    isEdit,
    editing,
    prefillName,
    isSaving,
    canWrite,
    formErrors,
    duplicateOf,
    close,
    submit,
  } = partyForm;

  const defaults = useMemo<PartyFormValues>(
    () => ({
      /* `prefillName` is the search term the merchant had typed when the list
         came back empty and they pressed "Add 'ramesh'". It is only ever set
         for a create, so the edit branch cannot be shadowed by it. */
      name: editing?.name ?? prefillName,
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
      /* The names, not the ids: the picker creates inline and the server
         resolves a name to a tag inside the party's own transaction. */
      tags: editing?.tags.map((tag) => tag.name) ?? [],
      openingAmount: '',
      openingDirection: 'debit',
      /* UAT D6 (CR-LOG): today, not the year start — a default the merchant
         did not choose must not claim an age (aging counts an opening from its
         date). The hint asks for the real date; "Year start" is a chip. */
      openingAsOf: isoToday(),
    }),
    [editing, prefillName]
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

  /**
   * "They already owe ₹47,500 — this limit is already crossed."
   *
   * Watched rather than read once, so it appears while the merchant is typing
   * the figure rather than after they save it. `editing` only: a party being
   * created owes nothing yet, so there is nothing to cross.
   *
   * `useWatch`, not `form.watch()`. The latter returns a function the React
   * Compiler cannot memoize safely, so it skips memoizing THIS WHOLE COMPONENT
   * — a three-hundred-line form with twenty-odd controls — to display one hint.
   * The compiler says so as a warning rather than an error, which is exactly
   * the kind of cost that gets paid silently. Every other watcher in this
   * codebase uses `useWatch` for the same reason.
   */
  const typedLimit = useWatch({ control: form.control, name: 'creditLimit' });
  /* D6 — the as-of hint asks "when did THEY / YOU start owing this". */
  const openingDirection = useWatch({ control: form.control, name: 'openingDirection' });
  const creditHint = useMemo(() => {
    /* `parseAmountInput` FIRST, and this is not tidiness.
 
       `UbMoneyInput` groups as the merchant types, so the value reaching here
       is "10,000.00" rather than "10000.00" — and `toDecimal` stops at the
       comma. The hint therefore worked for any figure under a thousand and
       silently stopped working for every realistic credit limit, which is the
       worst possible place for it to stop: a merchant lowering a cap to ₹10,000
       on somebody who owes ₹47,500 is exactly who the notice is for.
 
       Caught by a test that typed "9" and passed, beside one that typed "10000"
       and did not. */
    const typed = parseAmountInput(typedLimit ?? '');
    if (!isEdit || !editing || !typed.trim()) return undefined;
    /* String comparison would say "9" is more than "47500". `compareMoney`
       parses both with decimal.js-light, which is the only arithmetic this
       component does and the only kind canon rule 3 allows on money. */
    if (compareMoney(editing.balance, typed) <= 0) return undefined;
    /* `formatAmount`, not `formatInr`: the message is "They already owe
       ₹{balance} — …" and the symbol belongs to the SENTENCE, because Hindi
       puts it elsewhere in the line. A formatter that carried its own produced
       "₹₹47,500.00", which is the second time this exact pair of mistakes has
       met in this feature — see `creditCaption`. */
    return t('parties.credit.alreadyCrossed', { balance: formatAmount(editing.balance) });
  }, [isEdit, editing, typedLimit, t]);

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
      returnFocusRef={returnFocusRef}
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
        <UbField
          name="name"
          label={t('parties.form.name.label')}
          placeholder={t('parties.form.name.placeholder')}
          required
        >
          {/* `autoFocus`: the drawer used to open with focus on ✕, so the
              first keystroke went nowhere and a phone raised no keyboard
              (UAT). `MLDialog` leaves focus where `autoFocus` put it. */}
          {(field) => (
            <UbTextInput
              {...field}
              autoFocus
              autoComplete="off"
              placeholder={t('parties.form.name.hint')}
            />
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
          placeholder={t('parties.form.mobile.placeholder')}
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

        {/* PTY-05 FR-5 — visible, not folded, and that is a deliberate
            exception to this form's own rule.
 
            Everything past the first three fields is behind a disclosure
            because it is in the way of somebody adding their fourth customer of
            the morning. Tags are the one addition that EARNS its place there:
            the flow the feature exists for is "type Camp, press Create, save"
            at the counter (FRD PTY-05 §6), and a tag behind a fold is a tag
            nobody applies — which makes the filter, the bulk dialog and the
            manager furniture around an empty table.
 
            It is last in the visible group, so the fifteen-second path is still
            name, number, which-kind, save, with tags sitting where the eye lands
            after the decision rather than before it. */}
        <UbField
          name="tags"
          label={t('parties.tags.field.label')}
          placeholder={t('parties.tags.field.placeholder')}
          hint={t('parties.tags.field.hint', { max: MAX_TAGS_PER_PARTY })}
        >
          {(field) => (
            <PartyTagField
              t={t}
              id={field.id}
              value={(field.value as string[] | undefined) ?? []}
              onChange={field.onChange}
              tags={tagOptions}
              disabled={!canWrite}
              invalid={Boolean(errors.tags)}
              aria-describedby={field['aria-describedby']}
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
            <UbField
              name="openingAmount"
              label={t('parties.form.opening.amount')}
              placeholder={t('parties.form.opening.amount.placeholder')}
            >
              {(field) => <UbMoneyInput {...field} />}
            </UbField>
            <UbField name="openingDirection" label={t('parties.form.opening.direction')}>
              {(field) => <UbRadioGroup {...field} options={directionOptions} />}
            </UbField>
            <UbField
              name="openingAsOf"
              label={t('parties.form.opening.asOf')}
              placeholder={t('parties.form.opening.asOf.placeholder')}
              hint={t('parties.form.opening.asOf.hint', { direction: openingDirection })}
            >
              {(field) => (
                <UbDateInput
                  {...field}
                  max={isoToday()}
                  quickChoicesLabel={t('parties.form.opening.quickDates')}
                  quickChoices={[
                    { label: t('parties.form.opening.fyStart'), date: isoFinancialYearStart() },
                    { label: t('parties.form.opening.today'), date: isoToday() },
                  ]}
                />
              )}
            </UbField>
            {/* What happens to the figure: the server posts it as the khata's
                first entry in the party's own transaction (LED-02 FR-2). The
                old line promised it would "join the balance when entries
                arrive", from before that was true (UAT D8). */}
            <UbText variant="caption" tone="tertiary">
              {t('parties.form.opening.postedOnSave')}
            </UbText>
          </UbDisclosure>
        )}

        <UbDisclosure label={t('parties.form.section.gst')} open={gstHasError || undefined}>
          <UbField
            name="gstin"
            label={t('parties.form.gstin.label')}
            placeholder={t('parties.form.gstin.placeholder')}
          >
            {(field) => <UbTextInput {...field} uppercase autoComplete="off" />}
          </UbField>
          <UbField
            name="stateCode"
            label={t('parties.form.state.label')}
            placeholder={t('parties.form.state.placeholder')}
          >
            {(field) => <UbTextInput {...field} uppercase maxLength={2} autoComplete="off" />}
          </UbField>
          <UbField
            name="email"
            label={t('parties.form.email.label')}
            placeholder={t('parties.form.email.placeholder')}
          >
            {(field) => <UbTextInput {...field} type="email" autoComplete="off" />}
          </UbField>
          <UbField
            name="billingLine1"
            label={t('parties.form.address.line1')}
            placeholder={t('parties.form.address.line1.placeholder')}
          >
            {(field) => <UbTextInput {...field} autoComplete="off" />}
          </UbField>
          <UbField
            name="billingCity"
            label={t('parties.form.address.city')}
            placeholder={t('parties.form.address.city.placeholder')}
          >
            {(field) => <UbTextInput {...field} autoComplete="off" />}
          </UbField>
          <UbField
            name="billingPincode"
            label={t('parties.form.address.pincode')}
            placeholder={t('parties.form.address.pincode.placeholder')}
          >
            {(field) => <UbTextInput {...field} inputMode="numeric" autoComplete="off" />}
          </UbField>
        </UbDisclosure>

        <UbDisclosure label={t('parties.form.section.credit')} open={creditHasError || undefined}>
          {/* PTY-06 FR-13 — a NOTICE, not an error.
 
              Lowering a limit below what somebody already owes is allowed and
              is often the whole point: a merchant who has decided to stop
              lending to this person is doing it precisely when they are owed
              the most. Refusing it would trap them, and it reverses nothing
              already posted (BR-10). So the form says what will be true and
              lets them save.
 
              `hint` rather than a banner, because it belongs to this field and
              disappears with it. It is computed from the balance the form
              already has, so there is no request behind it. */}
          <UbField
            name="creditLimit"
            label={t('parties.form.creditLimit.label')}
            placeholder={t('parties.form.creditLimit.placeholder')}
            hint={creditHint}
          >
            {(field) => <UbMoneyInput {...field} />}
          </UbField>
          <UbField
            name="creditDays"
            label={t('parties.form.creditDays.label')}
            placeholder={t('parties.form.creditDays.placeholder')}
            hint={t('parties.form.creditDays.hint')}
          >
            {(field) => <UbTextInput {...field} inputMode="numeric" autoComplete="off" />}
          </UbField>
          <UbField
            name="collectionDate"
            label={t('parties.form.collectionDate.label')}
            placeholder={t('parties.form.collectionDate.placeholder')}
          >
            {(field) => <UbDateInput {...field} />}
          </UbField>
        </UbDisclosure>

        <UbDisclosure label={t('parties.form.section.other')}>
          <UbField
            name="displayCode"
            label={t('parties.form.code.label')}
            placeholder={t('parties.form.code.placeholder')}
          >
            {(field) => <UbTextInput {...field} autoComplete="off" />}
          </UbField>
          <UbField
            name="altPhone"
            label={t('parties.form.altPhone.label')}
            placeholder={t('parties.form.altPhone.placeholder')}
          >
            {(field) => <UbPhoneInput {...field} autoComplete="off" />}
          </UbField>
          <UbField
            name="notes"
            label={t('parties.form.notes.label')}
            placeholder={t('parties.form.notes.placeholder')}
          >
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
