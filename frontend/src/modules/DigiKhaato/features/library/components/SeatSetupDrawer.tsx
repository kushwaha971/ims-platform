'use client';

import { useId } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';

import {
  UbButton,
  UbCard,
  UbDrawer,
  UbField,
  UbForm,
  UbNativeSelect,
  UbStack,
  UbStatusBadge,
  UbSwitch,
  UbText,
  UbTextInput,
} from 'src/design-system';
import { useAppDispatch } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import { applyServerErrors } from 'src/utils/applyServerErrors';

import { useSeats } from '../hooks/useSeats';
import {
  addLibrarySeatRow,
  saveLibraryShift,
  setLibraryShiftActive,
} from '../redux/librarySeatThunk';
import { useSeatSchemas } from '../validation/seatSchemas';
import { shiftHours } from '../view-model/memberDisplay';

import type { SeatRowFormValues, ShiftFormValues } from '../types/seat.types';

// Loaded with dynamic(), so its words come with its own chunk.
import 'src/i18n/catalogues/library';
import 'src/i18n/catalogues/validation';

/** Every half hour of the day, for a shift's start and end. */
const TIMES = Array.from({ length: 48 }, (_, i) => {
  const hh = String(Math.floor(i / 2)).padStart(2, '0');
  return `${hh}:${i % 2 ? '30' : '00'}`;
});
const TIME_OPTIONS = TIMES.map((time) => ({ value: time, label: time }));

const SHIFT_DEFAULTS: ShiftFormValues = { name: '', startsAt: '06:00', endsAt: '12:00' };
const ROW_DEFAULTS: SeatRowFormValues = { prefix: 'A', from: '1', to: '20', zone: '' };

/**
 * W03 — a study library's setup in one place: its shifts (Morning 06:00–12:00…)
 * and its desks, added a row at a time ("A1 to A20, AC hall"). Owner and
 * admin only (`library.settings.manage`). A shift is taken out of use, never
 * deleted — students and their history point at it.
 */
export function SeatSetupDrawer({ onClose }: Readonly<{ onClose: () => void }>): React.JSX.Element {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const shiftFormId = useId();
  const rowFormId = useId();
  const seating = useSeats();
  const { shiftSchema, seatRowSchema } = useSeatSchemas();
  const shiftForm = useForm<ShiftFormValues>({
    resolver: yupResolver(shiftSchema),
    defaultValues: SHIFT_DEFAULTS,
  });
  const rowForm = useForm<SeatRowFormValues>({
    resolver: yupResolver(seatRowSchema),
    defaultValues: ROW_DEFAULTS,
  });

  const addShift = async (values: ShiftFormValues) => {
    const result = await dispatch(saveLibraryShift({ values }));
    if (saveLibraryShift.fulfilled.match(result)) {
      shiftForm.reset(SHIFT_DEFAULTS);
      dispatch(
        showSnackbar({
          severity: 'success',
          id: 'library.seats.shift.added',
          params: { name: result.payload.name },
        })
      );
    } else if (result.payload) {
      applyServerErrors(
        {
          ...result.payload,
          details: {
            name: result.payload.details?.name,
            startsAt: result.payload.details?.starts_at,
            endsAt: result.payload.details?.ends_at,
          },
        },
        shiftForm.setError,
        ['name', 'startsAt', 'endsAt']
      );
    }
  };

  const addRow = async (values: SeatRowFormValues) => {
    const result = await dispatch(addLibrarySeatRow(values));
    if (addLibrarySeatRow.fulfilled.match(result)) {
      dispatch(
        showSnackbar({
          severity: 'success',
          id: 'library.seats.row.added',
          params: { count: result.payload },
        })
      );
    } else if (result.payload) {
      applyServerErrors(result.payload, rowForm.setError, ['prefix', 'from', 'to', 'zone']);
    }
  };

  return (
    <UbDrawer
      open
      onOpenChange={(next) => !next && onClose()}
      title={t('library.seats.setup')}
      closeLabel={t('common.action.close')}
      footer={
        <UbButton variant="secondary" onClick={onClose}>
          {t('library.seats.setup.done')}
        </UbButton>
      }
    >
      <UbStack gap={5}>
        <UbStack gap={3} data-testid="library-setup-shifts">
          <UbText variant="label">{t('library.seats.shifts')}</UbText>
          {seating.shifts.length === 0 && (
            <UbText variant="body-sm" tone="tertiary">
              {t('library.seats.shifts.none')}
            </UbText>
          )}
          {seating.shifts.map((shift) => (
            /* The switch says whether the shift is in use; off hides it from
               admission and the map, and keeps every student already on it. */
            <UbSwitch
              key={shift.id}
              id={`shift-${shift.id}`}
              checked={shift.isActive}
              onCheckedChange={(on) => void dispatch(setLibraryShiftActive({ shift, active: on }))}
              label={shift.name}
              description={t(
                shift.isActive ? 'library.seats.shift.inUse' : 'library.seats.shift.notInUse',
                { hours: shiftHours(shift) }
              )}
            />
          ))}
          <UbCard padded>
            <UbForm id={shiftFormId} form={shiftForm} onSubmit={addShift}>
              <UbField
                name="name"
                label={t('library.seats.shift.name')}
                placeholder={t('library.seats.shift.name.placeholder')}
                required
              >
                {(field) => <UbTextInput {...field} autoComplete="off" />}
              </UbField>
              <UbStack direction="row" gap={3}>
                {(['startsAt', 'endsAt'] as const).map((name) => (
                  <UbField
                    key={name}
                    name={name}
                    label={t(`library.seats.shift.${name}`)}
                    className="flex-1"
                  >
                    {(field) => (
                      <UbNativeSelect
                        id={field.id}
                        name={field.name}
                        aria-label={t(`library.seats.shift.${name}`)}
                        value={String(field.value ?? '')}
                        onChange={field.onChange}
                        invalid={field.invalid}
                        options={TIME_OPTIONS}
                      />
                    )}
                  </UbField>
                ))}
              </UbStack>
              <UbButton type="submit" form={shiftFormId} variant="secondary">
                {t('library.seats.shift.add')}
              </UbButton>
            </UbForm>
          </UbCard>
        </UbStack>

        <UbStack gap={3} data-testid="library-setup-seats">
          <UbStack direction="row" gap={2} align="center">
            <UbText variant="label">{t('library.seats.title')}</UbText>
            <UbStatusBadge
              tone="neutral"
              label={t('library.seats.count.total', {
                count: seating.seats.filter((seat) => seat.isActive).length,
              })}
            />
          </UbStack>
          <UbCard padded>
            <UbForm id={rowFormId} form={rowForm} onSubmit={addRow}>
              <UbText variant="body-sm" tone="secondary">
                {t('library.seats.row.hint')}
              </UbText>
              <UbStack direction="row" gap={3}>
                <UbField name="prefix" label={t('library.seats.row.prefix')} className="flex-1">
                  {(field) => <UbTextInput {...field} autoComplete="off" />}
                </UbField>
                <UbField name="from" label={t('library.seats.row.from')} className="flex-1">
                  {(field) => (
                    <UbTextInput
                      {...field}
                      inputMode="numeric"
                      autoComplete="off"
                      onChange={(event) => {
                        field.onChange(event);
                        // QA B15: To's refusal depends on From, so correct both together.
                        if (rowForm.getFieldState('to').error) void rowForm.trigger('to');
                      }}
                    />
                  )}
                </UbField>
                <UbField name="to" label={t('library.seats.row.to')} className="flex-1">
                  {(field) => <UbTextInput {...field} inputMode="numeric" autoComplete="off" />}
                </UbField>
              </UbStack>
              <UbField
                name="zone"
                label={t('library.seats.row.zone')}
                placeholder={t('library.seats.row.zone.placeholder')}
                optionalLabel={t('common.field.optional')}
              >
                {(field) => <UbTextInput {...field} autoComplete="off" />}
              </UbField>
              <UbButton type="submit" form={rowFormId} variant="secondary">
                {t('library.seats.row.add')}
              </UbButton>
            </UbForm>
          </UbCard>
        </UbStack>
      </UbStack>
    </UbDrawer>
  );
}
