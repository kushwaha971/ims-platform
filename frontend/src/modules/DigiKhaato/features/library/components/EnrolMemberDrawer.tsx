'use client';

import { useEffect, useId, useMemo } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm, useWatch, type UseFormReturn } from 'react-hook-form';

import {
  UbButton,
  UbCard,
  UbChoiceChips,
  UbDateInput,
  UbDrawer,
  UbField,
  UbForm,
  UbMoneyInput,
  UbNativeSelect,
  UbPhoneInput,
  UbStack,
  UbText,
  UbTextInput,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { formatInr } from 'src/utils/money';

import { PartyPickerField } from 'modules/DigiKhaato/features/parties/components/PartyPickerField';
import { useCanSearchParties } from 'modules/DigiKhaato/features/parties/hooks/usePartySearch';
import { PaymentModeEditor } from 'modules/DigiKhaato/features/payments/components/PaymentModeEditor';
import type { PaymentFormValues } from 'modules/DigiKhaato/features/payments/types/payment.types';

import { useSeats } from '../hooks/useSeats';
import { useMemberSchemas } from '../validation/memberSchemas';
import { enrolCost, isNonZero, shiftHours } from '../view-model/memberDisplay';

import type { EnrolFormValues, MembershipType } from '../types/member.types';
import type { UseFormSetError } from 'react-hook-form';

// Loaded with dynamic(), so its words come with its own chunk — the payment
// editor's too (QA F2), or its chips print raw message ids.
import 'src/i18n/catalogues/ledger';
import 'src/i18n/catalogues/library';
import 'src/i18n/catalogues/payments';
import 'src/i18n/catalogues/validation';

/** One empty payment line — the editor's starting row. */
const FIRST_LINE: EnrolFormValues['lines'][number] = {
  mode: 'cash',
  upiApp: '',
  amount: '',
  reference: '',
};

/** QA B26 — "How is this student paying?" (`new` stands in for both on a plan that
 *  asks for no money, where collecting and owing are the same nothing). */
type PayWay = 'now' | 'later' | 'already' | 'new';
const PAY_WAYS: readonly PayWay[] = ['now', 'later', 'already'];
const FREE_WAYS: readonly PayWay[] = ['new', 'already'];

const DEFAULTS: EnrolFormValues = {
  partyMode: 'new',
  partyId: '',
  partyName: '',
  name: '',
  mobile: '',
  membershipTypeId: '',
  memberNumber: '',
  groupLabel: '',
  guardianName: '',
  guardianMobile: '',
  shiftId: '',
  seatId: '',
  lockerLabel: '',
  collectNow: true,
  lines: [FIRST_LINE],
  existingStudent: false,
  startsOn: '',
  validUntil: '',
  depositHeld: '',
  oldDuesAmount: '',
  oldDuesOn: '',
};

/**
 * F04 (LIB-04 FR-2…FR-4, §8 "Enrol form") — add a member: a person already in
 * the book or a new one, the membership type, and the money it asks for. The
 * fees card sits above Save and totals what will be charged; the deposit line
 * always says it is returned when the membership ends, so nobody reads it as a
 * fee. "Collect now" records the money in cash; off, it is owed.
 *
 * A guardian is named here for a child; the server links them as a guardian
 * who receives the library's messages (LIB-09 D22).
 */
export function EnrolMemberDrawer({
  types,
  busy,
  onClose,
  onSubmit,
}: Readonly<{
  types: readonly MembershipType[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (values: EnrolFormValues, setError: UseFormSetError<EnrolFormValues>) => Promise<void>;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const formId = useId();
  const { enrolSchema } = useMemberSchemas();
  const active = useMemo(() => types.filter((type) => type.isActive), [types]);
  const form = useForm<EnrolFormValues>({
    resolver: yupResolver(enrolSchema),
    mode: 'onTouched',
    defaultValues: {
      // QA B26 — the plan starts empty and is chosen: the newest plan used to be
      // pre-selected, and a ₹0 one quietly admitted students as "Paid".
      ...DEFAULTS,
    },
  });
  const [mode, _partyId, partyName, typeId, collectNow, shiftId, existingStudent] = useWatch({
    control: form.control,
    name: [
      'partyMode',
      'partyId',
      'partyName',
      'membershipTypeId',
      'collectNow',
      'shiftId',
      'existingStudent',
    ],
  });
  // W03 — the desks free in the chosen shift ('' = free all day).
  const seating = useSeats(shiftId ?? '');
  const freeSeats = useMemo(
    () =>
      seating.map?.shiftId === (shiftId ?? '')
        ? seating.map.seats.filter((seat) => seat.occupants.length === 0)
        : [],
    [seating.map, shiftId]
  );
  const hasSeats = seating.seats.length > 0;
  const type = active.find((row) => row.id === typeId);
  const cost = enrolCost(type);
  const canSearchParties = useCanSearchParties();
  const enrolPickerLabels = useMemo(
    () => ({
      clear: (name: string) => t('library.enrol.person.clear', { name }),
      noAccess: t('library.enrol.person.none'),
      results: t('library.enrol.person.results'),
      noMatch: t('library.enrol.person.none'),
    }),
    [t]
  );
  const asksMoney = isNonZero(cost.fees) || isNonZero(cost.deposit);
  const payWay: PayWay = existingStudent
    ? 'already'
    : !asksMoney
      ? 'new'
      : collectNow
        ? 'now'
        : 'later';

  /* QA F2 — a new plan's fees become the amount offered, as long as the merchant
     has not split the payment or typed their own figure. */
  const { getFieldState, getValues, setValue } = form;
  useEffect(() => {
    const lines = getValues('lines');
    const [only] = lines;
    if (only && lines.length === 1 && !getFieldState('lines').isDirty) {
      setValue('lines', [{ ...only, amount: cost.fees }]);
    }
  }, [cost.fees, getFieldState, getValues, setValue]);

  return (
    <UbDrawer
      open
      onOpenChange={(next) => !next && onClose()}
      title={t('library.enrol.title')}
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
            busyLabel={t('library.working')}
            data-testid="library-enrol-save"
          >
            {t('library.enrol.save')}
          </UbButton>
        </>
      }
    >
      <UbForm id={formId} form={form} onSubmit={(values) => onSubmit(values, form.setError)}>
        <UbField name="partyMode" label={t('library.enrol.who')} controlOwnsLabel>
          {(field) => (
            <UbChoiceChips<'new' | 'existing'>
              id={field.id}
              ariaLabel={t('library.enrol.who')}
              value={field.value as 'new' | 'existing'}
              onChange={(next) => field.onChange(next)}
              onBlur={field.onBlur}
              options={[
                { value: 'new', label: t('library.enrol.who.new') },
                { value: 'existing', label: t('library.enrol.who.existing') },
              ]}
              disabled={busy || !canSearchParties}
            />
          )}
        </UbField>

        {mode === 'new' ? (
          <>
            <UbField
              name="name"
              label={t('library.enrol.name')}
              placeholder={t('library.enrol.name.placeholder')}
              required
            >
              {(field) => <UbTextInput {...field} autoComplete="off" disabled={busy} />}
            </UbField>
            <UbField
              name="mobile"
              label={t('library.enrol.mobile')}
              placeholder={t('library.enrol.mobile.placeholder')}
              optionalLabel={t('common.field.optional')}
            >
              {(field) => <UbPhoneInput {...field} disabled={busy} />}
            </UbField>
          </>
        ) : (
          <UbField
            name="partyId"
            label={t('library.enrol.person')}
            placeholder={t('library.enrol.person.placeholder')}
            required
          >
            {(field) => (
              <PartyPickerField
                field={field}
                pickedName={partyName}
                onPick={(id, name) => {
                  form.setValue('partyId', id, { shouldValidate: true });
                  form.setValue('partyName', name);
                }}
                labels={enrolPickerLabels}
                t={t}
                disabled={busy}
              />
            )}
          </UbField>
        )}

        <UbField name="membershipTypeId" label={t('library.enrol.type')} required>
          {(field) => (
            <UbNativeSelect
              name={field.name}
              id={field.id}
              aria-label={t('library.enrol.type')}
              value={String(field.value ?? '')}
              onChange={field.onChange}
              invalid={field.invalid}
              placeholder={t('library.enrol.type.placeholder')}
              options={active.map((row) => ({ value: row.id, label: row.name }))}
            />
          )}
        </UbField>

        {/* QA B26 — one question instead of two switches: collect now (any amount,
            F2), pay later (it is owed), or an existing student who has already paid
            (F1: their real dates, no fee and no money today). */}
        <UbField
          name="existingStudent"
          label={t('library.enrol.payWay')}
          hint={t(`library.enrol.payWay.${payWay}.hint`)}
        >
          {(field) => (
            <UbChoiceChips<PayWay>
              id={field.id}
              ariaLabel={t('library.enrol.payWay')}
              value={payWay}
              onChange={(next) => {
                setValue('existingStudent', next === 'already', { shouldDirty: true });
                setValue('collectNow', next === 'now', { shouldDirty: true });
              }}
              onBlur={field.onBlur}
              options={(asksMoney ? PAY_WAYS : FREE_WAYS).map((way) => ({
                value: way,
                label: t(`library.enrol.payWay.${way}`),
              }))}
              disabled={busy}
            />
          )}
        </UbField>
        {existingStudent && (
          <UbCard padded>
            <UbStack gap={3} data-testid="library-enrol-existing">
              <UbStack direction="row" gap={3} className="max-sm:flex-col">
                <UbField
                  name="startsOn"
                  label={t('library.enrol.joinedOn')}
                  className="flex-1"
                  required
                >
                  {(field) => <UbDateInput {...field} value={field.value as string} />}
                </UbField>
                <UbField
                  name="validUntil"
                  label={t('library.enrol.paidTill')}
                  hint={t('library.enrol.paidTill.hint')}
                  optionalLabel={t('common.field.optional')}
                  className="flex-1"
                >
                  {(field) => <UbDateInput {...field} value={field.value as string} />}
                </UbField>
              </UbStack>
              <UbField
                name="depositHeld"
                label={t('library.enrol.depositHeld')}
                hint={t('library.enrol.depositHeld.hint')}
                optionalLabel={t('common.field.optional')}
              >
                {(field) => (
                  <UbMoneyInput
                    id={field.id}
                    value={(field.value as string) ?? ''}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    invalid={field.invalid}
                    disabled={busy}
                  />
                )}
              </UbField>
              <UbStack direction="row" gap={3} className="max-sm:flex-col">
                <UbField
                  name="oldDuesAmount"
                  label={t('library.enrol.oldDues')}
                  hint={t('library.enrol.oldDues.hint')}
                  optionalLabel={t('common.field.optional')}
                  className="flex-1"
                >
                  {(field) => (
                    <UbMoneyInput
                      id={field.id}
                      value={(field.value as string) ?? ''}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      invalid={field.invalid}
                      disabled={busy}
                    />
                  )}
                </UbField>
                <UbField
                  name="oldDuesOn"
                  label={t('library.enrol.oldDuesOn')}
                  optionalLabel={t('common.field.optional')}
                  className="flex-1"
                >
                  {(field) => <UbDateInput {...field} value={field.value as string} />}
                </UbField>
              </UbStack>
            </UbStack>
          </UbCard>
        )}

        {(seating.activeShifts.length > 0 || hasSeats) && (
          <UbStack direction="row" gap={3} className="max-sm:flex-col">
            {seating.activeShifts.length > 0 && (
              <UbField
                name="shiftId"
                label={t('library.enrol.shift')}
                optionalLabel={t('common.field.optional')}
                className="flex-1"
              >
                {(field) => (
                  <UbNativeSelect
                    name={field.name}
                    id={field.id}
                    aria-label={t('library.enrol.shift')}
                    value={String(field.value ?? '')}
                    onChange={(next: string) => {
                      field.onChange(next);
                      // A desk free in one shift may be taken in the next.
                      form.setValue('seatId', '');
                    }}
                    placeholder={t('library.enrol.shift.placeholder')}
                    options={seating.activeShifts.map((shift) => ({
                      value: shift.id,
                      label: `${shift.name} (${shiftHours(shift)})`,
                    }))}
                  />
                )}
              </UbField>
            )}
            {hasSeats && (
              <UbField
                name="seatId"
                label={t('library.enrol.seat')}
                optionalLabel={t('common.field.optional')}
                hint={
                  seating.mapStatus === 'succeeded'
                    ? t('library.enrol.seat.free', { count: freeSeats.length })
                    : undefined
                }
                className="flex-1"
              >
                {(field) => (
                  <UbNativeSelect
                    name={field.name}
                    id={field.id}
                    aria-label={t('library.enrol.seat')}
                    value={String(field.value ?? '')}
                    onChange={field.onChange}
                    placeholder={t('library.enrol.seat.placeholder')}
                    options={freeSeats.map((seat) => ({
                      value: seat.id,
                      label: seat.zone ? `${seat.label} · ${seat.zone}` : seat.label,
                    }))}
                  />
                )}
              </UbField>
            )}
          </UbStack>
        )}

        <UbField
          name="lockerLabel"
          label={t('library.enrol.locker')}
          placeholder={t('library.enrol.locker.placeholder')}
          optionalLabel={t('common.field.optional')}
        >
          {(field) => <UbTextInput {...field} autoComplete="off" disabled={busy} />}
        </UbField>

        <UbStack direction="row" gap={3} className="max-sm:flex-col">
          <UbField
            name="groupLabel"
            label={t('library.enrol.group')}
            placeholder={t('library.enrol.group.placeholder')}
            optionalLabel={t('common.field.optional')}
            className="flex-1"
          >
            {(field) => <UbTextInput {...field} disabled={busy} />}
          </UbField>
          <UbField
            name="memberNumber"
            label={t('library.enrol.number')}
            placeholder={t('library.enrol.number.placeholder')}
            hint={t('library.enrol.number.hint')}
            optionalLabel={t('common.field.optional')}
            className="flex-1"
          >
            {(field) => <UbTextInput {...field} autoComplete="off" disabled={busy} />}
          </UbField>
        </UbStack>

        <UbText variant="label">{t('library.enrol.guardian')}</UbText>
        <UbStack direction="row" gap={3} className="max-sm:flex-col">
          <UbField
            name="guardianName"
            label={t('library.enrol.guardian.name')}
            placeholder={t('library.enrol.guardian.name.placeholder')}
            optionalLabel={t('common.field.optional')}
            className="flex-1"
          >
            {(field) => <UbTextInput {...field} disabled={busy} />}
          </UbField>
          <UbField
            name="guardianMobile"
            label={t('library.enrol.guardian.mobile')}
            placeholder={t('library.enrol.mobile.placeholder')}
            optionalLabel={t('common.field.optional')}
            className="flex-1"
          >
            {(field) => <UbPhoneInput {...field} disabled={busy} />}
          </UbField>
        </UbStack>

        {asksMoney && !existingStudent && (
          <UbCard padded>
            <UbStack data-testid="library-enrol-fees" gap={2}>
              {isNonZero(cost.fees) && (
                <UbStack direction="row" justify="between" gap={2}>
                  <UbText variant="body-sm">{t('library.enrol.fees')}</UbText>
                  <UbText variant="body-sm-medium">{formatInr(cost.fees)}</UbText>
                </UbStack>
              )}
              {isNonZero(cost.deposit) && (
                <UbStack direction="row" justify="between" gap={2}>
                  <UbText variant="body-sm">{t('library.member.deposit')}</UbText>
                  <UbText variant="body-sm-medium">{formatInr(cost.deposit)}</UbText>
                </UbStack>
              )}
              {/* QA F2 — any amount, every mode Take fee has, split if need be. The
                  editor touches only `lines`, which this form shares with the
                  payment form, so the cast is to that one field's shape. */}
              {collectNow && isNonZero(cost.fees) && (
                <PaymentModeEditor
                  form={form as unknown as UseFormReturn<PaymentFormValues>}
                  target={cost.fees}
                  t={t}
                  disabled={busy}
                />
              )}
            </UbStack>
          </UbCard>
        )}
      </UbForm>
    </UbDrawer>
  );
}
