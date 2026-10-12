import { useMemo } from 'react';

import * as Yup from 'yup';

import { useValidationSchemas } from 'src/hooks/useValidationSchemas';

import type {
  CloseFormValues,
  EnrolFormValues,
  DepositFormValues,
  MemberEditFormValues,
  ReasonFormValues,
} from '../types/member.types';

/**
 * F04 (LIB-04 §9) — the members' forms, composed from the central validators.
 * The server re-checks each rule; these exist so the librarian hears first.
 */
const REASON_MAX = 160;
const GROUP_MAX = 40;
const NUMBER_MAX = 24;
/** `library_membership.notes`, as `members.patch` bounds it. */
const NOTES_MAX = 2000;

export interface MemberSchemas {
  readonly enrolSchema: Yup.ObjectSchema<EnrolFormValues>;
  readonly reasonSchema: (required: boolean) => Yup.ObjectSchema<ReasonFormValues>;
  readonly closeSchema: Yup.ObjectSchema<CloseFormValues>;
  readonly editSchema: Yup.ObjectSchema<MemberEditFormValues>;
  /** QA B4 — a deposit taken later: above zero, at most what is still to take. */
  readonly depositSchema: (due: string) => Yup.ObjectSchema<DepositFormValues>;
}

/** W03 — `library_membership.locker_label`. */
const LOCKER_MAX = 16;

export const useMemberSchemas = (): MemberSchemas => {
  const v = useValidationSchemas();

  return useMemo(() => {
    const enrolSchema = Yup.object({
      partyMode: Yup.mixed<'existing' | 'new'>().oneOf(['existing', 'new']).defined(),
      partyId: Yup.string()
        .defined()
        .when('partyMode', {
          is: 'existing',
          then: () => v.requiredText(40, 'library.enrol.party.required'),
        }),
      partyName: Yup.string().defined(),
      name: Yup.string()
        .defined()
        .when('partyMode', { is: 'new', then: () => v.nameValidation() }),
      mobile: v.mobileValidation(false).defined().default(''),
      membershipTypeId: v.requiredText(40, 'library.enrol.type.required'),
      memberNumber: v.boundedText(NUMBER_MAX),
      groupLabel: v.boundedText(GROUP_MAX),
      guardianName: v.boundedText(120),
      guardianMobile: v.mobileValidation(false).defined().default(''),
      shiftId: Yup.string().defined().default(''),
      seatId: Yup.string().defined().default(''),
      lockerLabel: v.boundedText(LOCKER_MAX),
      paymentMode: Yup.mixed<'cash' | 'upi'>().oneOf(['cash', 'upi']).defined(),
      collectNow: Yup.boolean().defined(),
    }) as Yup.ObjectSchema<EnrolFormValues>;

    const reasonSchema = (required: boolean): Yup.ObjectSchema<ReasonFormValues> =>
      Yup.object({
        reason: required
          ? v.requiredBoundedText(REASON_MAX, 3, 'library.member.reason.required')
          : v.boundedText(REASON_MAX),
        until: Yup.string().defined(),
      }) as Yup.ObjectSchema<ReasonFormValues>;

    const closeSchema = Yup.object({
      reason: v.requiredBoundedText(REASON_MAX, 3, 'library.member.reason.required'),
      applyToDues: Yup.boolean().defined(),
    }) as Yup.ObjectSchema<CloseFormValues>;

    /* A student already HAS a number, so unlike enrolment (where empty means
       "the next one") an empty box here would be a request to erase it. */
    const editSchema = Yup.object({
      memberNumber: v.requiredBoundedText(NUMBER_MAX, 1, 'library.member.edit.number.required'),
      groupLabel: v.boundedText(GROUP_MAX),
      validUntil: Yup.string().defined(),
      notes: v.boundedText(NOTES_MAX),
    }) as Yup.ObjectSchema<MemberEditFormValues>;

    const depositSchema = (due: string) =>
      Yup.object({
        amount: v.amountValidation({ max: due }),
        paymentMode: Yup.mixed<'cash' | 'upi'>().oneOf(['cash', 'upi']).defined(),
      });

    return { enrolSchema, reasonSchema, closeSchema, editSchema, depositSchema };
  }, [v]);
};
