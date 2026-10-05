import { useMemo } from 'react';

import * as Yup from 'yup';

import { useTranslation } from 'src/hooks/useTranslation';
import { useValidationSchemas } from 'src/hooks/useValidationSchemas';

import type { PlanFormValues } from '../types/plan.types';
import type { SeatRowFormValues, ShiftFormValues } from '../types/seat.types';

/**
 * W03 — the shift, seat-row and fee-plan forms, from the central validators.
 * The server re-checks each rule; these exist so the owner hears first.
 */
const SHIFT_NAME_MAX = 40;
const SEAT_PREFIX_MAX = 12;
const ZONE_MAX = 40;
const PLAN_NAME_MAX = 60;

export interface SeatSchemas {
  readonly shiftSchema: Yup.ObjectSchema<ShiftFormValues>;
  readonly seatRowSchema: Yup.ObjectSchema<SeatRowFormValues>;
  readonly planSchema: Yup.ObjectSchema<PlanFormValues>;
}

export const useSeatSchemas = (): SeatSchemas => {
  const v = useValidationSchemas();
  const { t } = useTranslation();

  return useMemo(() => {
    const seatNumber = () =>
      v
        .requiredText(4)
        .test('number', t('library.seats.number.invalid'), (value) =>
          /^\d{1,4}$/.test(String(value ?? '')) && Number(value) >= 1
        );
    const shiftSchema = Yup.object({
      name: v.requiredText(SHIFT_NAME_MAX),
      startsAt: v.requiredText(5),
      endsAt: v
        .requiredText(5)
        .test('same', t('library.seats.shift.same'), function check(value) {
          return value !== (this.parent as ShiftFormValues).startsAt;
        }),
    }) as Yup.ObjectSchema<ShiftFormValues>;
    const seatRowSchema = Yup.object({
      prefix: v.boundedText(SEAT_PREFIX_MAX),
      from: seatNumber(),
      to: seatNumber().test('order', t('library.seats.row.order'), function check(value) {
        return Number(value) >= Number((this.parent as SeatRowFormValues).from);
      }),
      zone: v.boundedText(ZONE_MAX),
    }) as Yup.ObjectSchema<SeatRowFormValues>;
    const planSchema = Yup.object({
      name: v.requiredText(PLAN_NAME_MAX),
      feeAmount: v.amountValidation({ allowZero: true }),
      validityMonths: v.requiredText(2),
      admissionFee: v.optionalAmountValidation(),
      depositAmount: v.optionalAmountValidation(),
    }) as Yup.ObjectSchema<PlanFormValues>;
    return { shiftSchema, seatRowSchema, planSchema };
  }, [v, t]);
};
