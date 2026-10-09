'use client';

import { useMemo } from 'react';

import * as Yup from 'yup';

import { useValidationSchemas } from 'src/hooks/useValidationSchemas';

import { INVITABLE_ROLES } from '../constants/teamDefaults';

import type { MemberRoleCode } from '../types/role.types';

/**
 * Part 19 §19.5.3 — the add-member form's schema, COMPOSED from the central
 * validators rather than written here (DEC-012).
 *
 * Owner, 9 Oct 2026: a team member is a name, a mobile and a role. The mobile
 * is how they sign in (an OTP to that number), so there is no address and no
 * password to create or pass on.
 */
export interface AddMemberFormValues {
  fullName: string;
  role: MemberRoleCode;
  mobile: string;
}

/**
 * The RHF paths this form owns, so `applyServerErrors()` knows what to anchor.
 * `email` stays listed: it is the SERVER's spelling, and a 400 naming it must
 * still surface at form level rather than vanish (§19.5.6).
 */
export const ADD_MEMBER_FIELDS = ['fullName', 'email', 'role', 'mobile'] as const;

/**
 * `roleCodes` is what the dialog offers (A13): the server's assignable roles,
 * module roles of enabled modules included, or the canon three before that
 * list arrives. `owner` is never among them (`assignableRoleOptions`).
 */
export const useMemberSchemas = (
  roleCodes: readonly MemberRoleCode[] = INVITABLE_ROLES
): {
  readonly addMemberSchema: Yup.ObjectSchema<AddMemberFormValues>;
} => {
  const v = useValidationSchemas();

  return useMemo(
    () => ({
      addMemberSchema: Yup.object({
        fullName: v.nameValidation().defined(),
        // `owner` is absent from `INVITABLE_ROLES` and must stay absent: a
        // business has exactly one and ownership is transferred (canon §0.7).
        role: v.enumValidation<MemberRoleCode>(roleCodes, 'validation.role.required').defined(),
        // The identity since 9 Oct 2026: they sign in with this number and an
        // OTP, so it is required (and Indian — the field is locked to +91,
        // because the code goes by Fast2SMS).
        mobile: v.mobileValidation(true).nonNullable().defined(),
      }),
    }),
    [v, roleCodes]
  );
};
