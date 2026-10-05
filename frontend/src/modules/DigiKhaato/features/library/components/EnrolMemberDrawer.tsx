'use client';

import { useId, useMemo } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm, useWatch } from 'react-hook-form';

import {
  UbButton,
  UbCard,
  UbChoiceChips,
  UbDrawer,
  UbField,
  UbForm,
  UbNativeSelect,
  UbPhoneInput,
  UbStack,
  UbSwitch,
  UbText,
  UbTextInput,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { formatInr } from 'src/utils/money';

import { PartyPickerField } from 'modules/DigiKhaato/features/parties/components/PartyPickerField';
import { useCanSearchParties } from 'modules/DigiKhaato/features/parties/hooks/usePartySearch';

import { useSeats } from '../hooks/useSeats';
import { useMemberSchemas } from '../validation/memberSchemas';
import { enrolCost, isNonZero, shiftHours } from '../view-model/memberDisplay';

import type { EnrolFormValues, MembershipType } from '../types/member.types';
import type { UseFormSetError } from 'react-hook-form';

// Loaded with dynamic(), so its words come with its own chunk.
import 'src/i18n/catalogues/library';
import 'src/i18n/catalogues/validation';

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
  paymentMode: 'cash',
  collectNow: true,
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
    defaultValues: { ...DEFAULTS, membershipTypeId: active[0]?.id ?? '' },
  });
  const [mode, _partyId, partyName, typeId, collectNow, shiftId] = useWatch({
    control: form.control,
    name: ['partyMode', 'partyId', 'partyName', 'membershipTypeId', 'collectNow', 'shiftId'],
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

        {asksMoney && (
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
              <UbField name="collectNow" label={t('library.enrol.collectNow')} controlOwnsLabel>
                {(field) => (
                  <UbSwitch
                    id={field.id}
                    checked={Boolean(field.value)}
                    onCheckedChange={field.onChange}
                    label={t('library.enrol.collectNow')}
                    description={t(
                      collectNow ? 'library.enrol.collectNow.on' : 'library.enrol.collectNow.off'
                    )}
                    disabled={busy}
                  />
                )}
              </UbField>
              {collectNow && (
                <UbField name="paymentMode" label={t('library.enrol.paidBy')} controlOwnsLabel>
                  {(field) => (
                    <UbChoiceChips<'cash' | 'upi'>
                      id={field.id}
                      ariaLabel={t('library.enrol.paidBy')}
                      value={field.value as 'cash' | 'upi'}
                      onChange={(next) => field.onChange(next)}
                      onBlur={field.onBlur}
                      options={[
                        { value: 'cash', label: t('library.enrol.paidBy.cash') },
                        { value: 'upi', label: t('library.enrol.paidBy.upi') },
                      ]}
                      disabled={busy}
                    />
                  )}
                </UbField>
              )}
            </UbStack>
          </UbCard>
        )}
      </UbForm>
    </UbDrawer>
  );
}
