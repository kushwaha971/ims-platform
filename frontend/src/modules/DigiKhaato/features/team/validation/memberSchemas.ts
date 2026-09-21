'use client';

import { useMemo } from 'react';

import * as Yup from 'yup';

import { useValidationSchemas } from 'src/hooks/useValidationSchemas';
import type { TenantRole } from 'src/types/domain.types';

import { INVITABLE_ROLES } from '../constants/teamDefaults';

/**
 * Part 19 §19.5.3 — the add-member form's schema, COMPOSED from the central
 * validators rather than written here (DEC-012).
 *
 * `emailIdentityValidation()` trims and lower-cases before it checks, which
 * matters more here than almost anywhere: this address becomes a login, and an
 * account created as `Ramesh@Shop.test` that its owner then types as
 * `ramesh@shop.test` is an account nobody can sign in to. The server normalises
 * too; this is what stops the merchant seeing a confusing 400 first.
 */
export interface AddMemberFormValues {
  fullName: string;
  email: string;
  role: TenantRole;
  mobile?: string | null;
}

/** The RHF paths this form owns, so `applyServerErrors()` knows what to anchor. */
export const ADD_MEMBER_FIELDS = ['fullName', 'email', 'role', 'mobile'] as const;

export const useMemberSchemas = (): {
  readonly addMemberSchema: Yup.ObjectSchema<AddMemberFormValues>;
} => {
  const v = useValidationSchemas();

  return useMemo(
    () => ({
      addMemberSchema: Yup.object({
        fullName: v.nameValidation().defined(),
        email: v.emailIdentityValidation().defined(),
        // `owner` is absent from `INVITABLE_ROLES` and must stay absent: a
        // business has exactly one and ownership is transferred (canon §0.7).
        role: v.enumValidation<TenantRole>(INVITABLE_ROLES, 'validation.role.required').defined(),
        // Optional, and a NOTIFICATION channel rather than an identity
        // (DEC-010) — it is here so the owner can note the number they are
        // about to WhatsApp the password to.
        mobile: v.mobileValidation(false),
      }),
    }),
    [v]
  );
};
