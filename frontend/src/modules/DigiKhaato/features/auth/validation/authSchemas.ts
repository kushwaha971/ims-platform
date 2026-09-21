'use client';

import { useMemo } from 'react';

import * as Yup from 'yup';

import { useTranslation } from 'src/hooks/useTranslation';
import { useValidationSchemas } from 'src/hooks/useValidationSchemas';

import { PASSWORD_FLOOR } from '../constants/authDefaults';

/**
 * Part 19 §19.5.3 — feature schemas COMPOSE the central validators; they never
 * restate a rule. A raw `Yup.string().required('Password is required')` here
 * would be untranslated and unshared, and R-F-2 fails it.
 *
 * Each schema is memoised on `t`, so a locale change rebuilds it and the next
 * message is Hindi — which is the whole reason the validators are a hook rather
 * than a module constant.
 *
 * `knownFields` travels with each schema because `applyServerErrors()` needs to
 * know which of a 400's `details` keys it may anchor and which must surface at
 * form level (§19.5.6): a list maintained next to the schema stays true.
 *
 * **CR-2026-09-19-A.** `otpRequestSchema` and `otpVerifySchema` are gone with
 * their screens; `signUpSchema` is new, and the login identifier is now simply
 * an email, so the two-way `identifier` test that had to guess what the user
 * meant is gone with it.
 */

/**
 * Form-value shapes are NOT `readonly`: they are RHF `FieldValues`, and RHF's
 * own generics (`UseFormReturn`, `Resolver`, `Path`) are written against mutable
 * records. `readonly` here would be a lie the resolver has to cast away.
 *
 * A field validated by a nullable central validator is `string | null`, because
 * `optionalText()` normalises `''` → `null` and pretending otherwise would put
 * the cast in every caller instead of in the type.
 */
export interface PasswordLoginFormValues {
  email: string;
  password: string;
  rememberEmail: boolean;
}

/**
 * CR-2026-09-19-D — two fields, which is what the screen's own copy promises.
 * `name` moved to step 1 of the wizard (which already asks for it), `mobile`
 * to the profile, and `confirmPassword` was deleted outright: the password
 * field has a reveal toggle, and a form that makes you type a password twice
 * AND gives you a way to read it is asking for the same assurance twice.
 */
export interface SignUpFormValues {
  email: string;
  password: string;
}

export interface PasswordResetRequestFormValues {
  email: string;
}

export interface PasswordSetFormValues {
  name: string | null;
  password: string;
}

export interface PasswordResetConfirmFormValues {
  password: string;
}

/**
 * DEC-012 — the forced change, for an account on an owner-issued password.
 *
 * `currentPassword` is required and is NOT validated against the password
 * policy: it is the temporary password the server generated, and holding the
 * merchant's staff to "at least 8 characters with a letter and a number" on a
 * value they did not choose would reject a correct paste. It is a plain
 * required field, and the server is what decides whether it is right.
 */
export interface ForcePasswordChangeFormValues {
  currentPassword: string;
  password: string;
}

export const PASSWORD_LOGIN_FIELDS = ['email', 'password'] as const;
/**
 * `fullName` and `mobile` are still listed: they are the SERVER's spellings, and
 * a 400 that names a field this form no longer shows must still surface at form
 * level rather than vanish (§19.5.6).
 */
export const SIGN_UP_FIELDS = ['fullName', 'email', 'mobile', 'password'] as const;
export const PASSWORD_RESET_REQUEST_FIELDS = ['email'] as const;
export const PASSWORD_SET_FIELDS = ['name', 'password', 'newPassword'] as const;
export const PASSWORD_RESET_FIELDS = ['token', 'password', 'newPassword'] as const;

export interface AuthSchemas {
  readonly passwordLoginSchema: Yup.ObjectSchema<PasswordLoginFormValues>;
  readonly signUpSchema: Yup.ObjectSchema<SignUpFormValues>;
  readonly passwordResetRequestSchema: Yup.ObjectSchema<PasswordResetRequestFormValues>;
  readonly passwordSetSchema: Yup.ObjectSchema<PasswordSetFormValues>;
  readonly passwordResetConfirmSchema: Yup.ObjectSchema<PasswordResetConfirmFormValues>;
  readonly forcePasswordChangeSchema: Yup.ObjectSchema<ForcePasswordChangeFormValues>;
}

export const useAuthSchemas = (): AuthSchemas => {
  const v = useValidationSchemas();
  const { t } = useTranslation();

  return useMemo<AuthSchemas>(
    () => ({
      passwordLoginSchema: Yup.object({
        email: v.emailIdentityValidation().defined(),
        // NOT `passwordValidation()`: a login form that rejected a password
        // shorter than today's floor would lock a real user out of their own
        // account the day the policy tightens. The only client rule on login is
        // "not empty"; the server decides whether it is right (AC-5's generic
        // error).
        password: Yup.string().required(t('validation.password.required')).defined(),
        rememberEmail: Yup.boolean().defined().default(true),
      }),

      /**
       * CR-2026-09-19-D — an address and a password, and nothing else. The name
       * is PLT-03 step 1's question (BR-7 always said it would ask again), the
       * mobile is a profile field, and the confirmation is replaced by the
       * reveal toggle the password input has carried since PLT-02 FR-8.
       */
      signUpSchema: Yup.object({
        email: v.emailIdentityValidation().defined(),
        // The full rule, floor included: this IS where a password is chosen, so
        // saying less than the server enforces would collect one it rejects.
        password: v.passwordValidation({ minLength: PASSWORD_FLOOR }).defined(),
      }),

      passwordResetRequestSchema: Yup.object({
        email: v.emailIdentityValidation().defined(),
      }),

      passwordSetSchema: Yup.object({
        name: v.optionalText(120).defined().default(''),
        password: v.passwordValidation({ minLength: PASSWORD_FLOOR }).defined(),
      }),

      passwordResetConfirmSchema: Yup.object({
        password: v.passwordValidation({ minLength: PASSWORD_FLOOR }).defined(),
      }),

      forcePasswordChangeSchema: Yup.object({
        currentPassword: v.requiredText(128, 'validation.password.required').defined(),
        password: v.passwordValidation({ minLength: PASSWORD_FLOOR }).defined(),
      }),
    }),
    [v, t]
  );
};
