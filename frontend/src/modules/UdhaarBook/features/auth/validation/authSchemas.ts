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

export interface SignUpFormValues {
  name: string | null;
  email: string;
  /** Optional, and never an identity. `UbPhoneInput` produces E.164 or ''. */
  mobile: string | null;
  password: string;
  confirmPassword: string;
}

export interface PasswordResetRequestFormValues {
  email: string;
}

export interface PasswordSetFormValues {
  name: string | null;
  password: string;
  confirmPassword: string;
}

export interface PasswordResetConfirmFormValues {
  password: string;
  confirmPassword: string;
}

export const PASSWORD_LOGIN_FIELDS = ['email', 'password'] as const;
export const SIGN_UP_FIELDS = [
  'name',
  'fullName',
  'email',
  'mobile',
  'password',
  'confirmPassword',
] as const;
export const PASSWORD_RESET_REQUEST_FIELDS = ['email'] as const;
export const PASSWORD_SET_FIELDS = ['name', 'password', 'newPassword', 'confirmPassword'] as const;
export const PASSWORD_RESET_FIELDS = ['token', 'password', 'newPassword'] as const;

export interface AuthSchemas {
  readonly passwordLoginSchema: Yup.ObjectSchema<PasswordLoginFormValues>;
  readonly signUpSchema: Yup.ObjectSchema<SignUpFormValues>;
  readonly passwordResetRequestSchema: Yup.ObjectSchema<PasswordResetRequestFormValues>;
  readonly passwordSetSchema: Yup.ObjectSchema<PasswordSetFormValues>;
  readonly passwordResetConfirmSchema: Yup.ObjectSchema<PasswordResetConfirmFormValues>;
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

      signUpSchema: Yup.object({
        // PLT-03 BR-7 — step 1 asks again if it is still blank, so it is
        // optional here rather than a second barrier in front of the wizard.
        name: v.optionalText(120).defined().default(''),
        email: v.emailIdentityValidation().defined(),
        /**
         * `false` — NOT required. This is the field that stopped being an
         * identity, and the schema has to say so or the change is only skin
         * deep.
         *
         * The transform is the load-bearing part: `UbPhoneInput` hands back
         * `''` for an untouched field, and `''` matches no phone pattern, so
         * without it a merchant who simply did not want to give a number could
         * never submit the form. `''` means "not answered", which is `null`.
         * A number that IS typed is still checked, because a wrong number in a
         * reminder is worse than no number at all.
         */
        mobile: v
          .mobileValidation(false)
          .transform((value: unknown) =>
            typeof value === 'string' && value.trim() === '' ? null : value
          )
          .defined()
          .default(null),
        // The full rule, floor included: this IS where a password is chosen, so
        // saying less than the server enforces would collect one it rejects.
        password: v.passwordValidation({ minLength: PASSWORD_FLOOR }).defined(),
        confirmPassword: v.passwordConfirmValidation('password').defined(),
      }),

      passwordResetRequestSchema: Yup.object({
        email: v.emailIdentityValidation().defined(),
      }),

      passwordSetSchema: Yup.object({
        name: v.optionalText(120).defined().default(''),
        password: v.passwordValidation({ minLength: PASSWORD_FLOOR }).defined(),
        confirmPassword: v.passwordConfirmValidation('password').defined(),
      }),

      passwordResetConfirmSchema: Yup.object({
        password: v.passwordValidation({ minLength: PASSWORD_FLOOR }).defined(),
        confirmPassword: v.passwordConfirmValidation('password').defined(),
      }),
    }),
    [v, t]
  );
};
