'use client';

import { useMemo } from 'react';

import * as Yup from 'yup';

import { useValidationSchemas } from 'src/hooks/useValidationSchemas';

import { INVITABLE_ROLES } from '../constants/teamDefaults';

import type { MemberRoleCode } from '../types/role.types';

/**
 * Part 19 §19.5.3 — the invite form's schema, COMPOSED from the central
 * validators rather than written here.
 *
 * `emailIdentityValidation()` is the whole of the email rule and it is the
 * right one twice over: it is the identity an invitation is addressed to
 * (DEC-010), and it trims and lower-cases before it checks, so
 * " Ramesh@Example.COM " is sent as `ramesh@example.com`. An invitation stored
 * against one casing and accepted from another is an invitation nobody can use,
 * and this is the one place that can be prevented.
 *
 * A raw `Yup.string().required()` here would be a defect (R-F-2): untranslated
 * and unshared.
 */
export interface InviteFormValues {
  email: string;
  role: MemberRoleCode;
}

/** The RHF paths this form owns, so `applyServerErrors()` knows what to anchor. */
export const INVITE_FIELDS = ['email', 'role'] as const;

/**
 * `roleCodes` is what the dialog offers (A13): the server's assignable roles,
 * module roles of enabled modules included, or the canon three before that
 * list arrives. `owner` is never among them (`assignableRoleOptions`).
 */
export const useInvitationSchemas = (
  roleCodes: readonly MemberRoleCode[] = INVITABLE_ROLES
): {
  readonly inviteSchema: Yup.ObjectSchema<InviteFormValues>;
} => {
  const v = useValidationSchemas();

  return useMemo(
    () => ({
      inviteSchema: Yup.object({
        email: v.emailIdentityValidation().defined(),
        // The closed list is `INVITABLE_ROLES`, not every role that exists:
        // `owner` is transferred, never invited, and a schema that accepted it
        // would let a hand-built request through the only client-side check.
        role: v.enumValidation<MemberRoleCode>(roleCodes, 'validation.role.required').defined(),
      }),
    }),
    [v, roleCodes]
  );
};
