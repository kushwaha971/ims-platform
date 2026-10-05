'use client';

import { useId, useMemo } from 'react';

import { useForm, useWatch } from 'react-hook-form';

import {
  UbButton,
  UbDialog,
  UbField,
  UbForm,
  UbNativeSelect,
  UbTextInput,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import type { ApiErrorShape } from 'src/types/api.types';

import { useSeats } from '../hooks/useSeats';
import { shiftHours } from '../view-model/memberDisplay';

import type { MemberDetail } from '../types/member.types';

// Loaded with dynamic(), so its words come with its own chunk.
import 'src/i18n/catalogues/library';

type Outcome = { readonly ok: true } | { readonly ok: false; readonly error: ApiErrorShape | null };

interface SeatFormValues {
  shiftId: string;
  seatId: string;
  lockerLabel: string;
}

/**
 * W03 — give a student a desk, move them, or change their shift or locker. The
 * seat list is the desks free in the chosen shift plus the one they hold now; a
 * desk someone took a moment ago on another device is refused by the server,
 * which names who, and the refusal is said under the seat.
 */
export function SeatDialog({
  member,
  busy,
  onClose,
  onSubmit,
}: Readonly<{
  member: MemberDetail;
  busy: boolean;
  onClose: () => void;
  onSubmit: (body: {
    seatId: string | null;
    shiftId: string | null;
    lockerLabel: string;
  }) => Promise<Outcome>;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const formId = useId();
  const form = useForm<SeatFormValues>({
    defaultValues: {
      shiftId: member.shift?.id ?? '',
      seatId: member.seat?.id ?? '',
      lockerLabel: member.lockerLabel,
    },
  });
  const shiftId = useWatch({ control: form.control, name: 'shiftId' }) ?? '';
  const seating = useSeats(shiftId);
  const options = useMemo(() => {
    if (seating.map?.shiftId !== shiftId) return [];
    return seating.map.seats
      .filter((seat) => seat.occupants.every((o) => o.membershipId === member.membershipId))
      .map((seat) => ({
        value: seat.id,
        label: seat.zone ? `${seat.label} · ${seat.zone}` : seat.label,
      }));
  }, [seating.map, shiftId, member.membershipId]);

  const save = async (values: SeatFormValues) => {
    const outcome = await onSubmit({
      seatId: values.seatId || null,
      shiftId: values.shiftId || null,
      lockerLabel: (values.lockerLabel ?? '').trim(),
    });
    if (outcome.ok) onClose();
    else
      form.setError('seatId', {
        message: outcome.error?.message ?? t('library.member.error.save'),
      });
  };

  return (
    <UbDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={t('library.place.title', { name: member.name })}
      closeLabel={t('common.action.close')}
      footer={
        <>
          <UbButton variant="secondary" onClick={onClose} disabled={busy}>
            {t('common.action.cancel')}
          </UbButton>
          <UbButton type="submit" form={formId} busy={busy} data-testid="library-seat-save">
            {t('library.place.save')}
          </UbButton>
        </>
      }
    >
      <UbForm id={formId} form={form} onSubmit={save}>
        {seating.activeShifts.length > 0 && (
          <UbField name="shiftId" label={t('library.enrol.shift')}>
            {(field) => (
              <UbNativeSelect
                id={field.id}
                name={field.name}
                aria-label={t('library.enrol.shift')}
                value={String(field.value ?? '')}
                onChange={(next: string) => {
                  field.onChange(next);
                  if (next !== (member.shift?.id ?? '')) form.setValue('seatId', '');
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
        <UbField name="seatId" label={t('library.enrol.seat')}>
          {(field) => (
            <UbNativeSelect
              id={field.id}
              name={field.name}
              aria-label={t('library.enrol.seat')}
              value={String(field.value ?? '')}
              onChange={field.onChange}
              invalid={field.invalid}
              placeholder={t('library.place.noSeat')}
              options={options}
            />
          )}
        </UbField>
        <UbField
          name="lockerLabel"
          label={t('library.enrol.locker')}
          placeholder={t('library.enrol.locker.placeholder')}
          optionalLabel={t('common.field.optional')}
        >
          {(field) => <UbTextInput {...field} maxLength={16} autoComplete="off" />}
        </UbField>
      </UbForm>
    </UbDialog>
  );
}
