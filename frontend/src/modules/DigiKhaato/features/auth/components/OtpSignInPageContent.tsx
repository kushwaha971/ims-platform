'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';

import {
  UbButton,
  UbField,
  UbForm,
  UbLink,
  UbOtpInput,
  UbPhoneInput,
  UbStack,
  UbStatusBanner,
  UbText,
} from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectAppName } from 'src/redux/slice/whiteLabelSlice';
import { ROUTES } from 'src/routes';
import { formatPhoneForDisplay } from 'src/utils/share';

import { useAuthRedirect } from '../hooks/useAuthRedirect';
import { useOtpSignIn } from '../hooks/useOtpSignIn';
import { useAuthSchemas } from '../validation/authSchemas';

import { AuthLegalNotice } from './AuthLegalNotice';
import { AuthPanel } from './AuthPanel';
import { AuthScreenHeading } from './AuthScreenHeading';

import type { OtpCodeFormValues, OtpMobileFormValues } from '../validation/authSchemas';

/**
 * The server's resend gap. The deadline is computed from the moment the answer
 * arrives and the countdown rounds UP, so the first frame read "2:01"; it is
 * capped here so a two-minute timer never shows more than two minutes.
 */
const RESEND_SECONDS = 120;

/** `95` → `1:35`, the way a phone's own resend timers read. */
const clock = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export interface OtpSignInPageContentProps {
  /** Only the words differ: one flow signs in a number it knows and signs up one it does not. */
  readonly mode: 'signIn' | 'signUp';
}

/**
 * Owner, 9 Oct 2026 — "for registration and login use only mobile number and
 * OTP … use same things", replacing the email + password screens on /login and
 * /signup. Two steps on one screen:
 *
 *  1. the mobile number (India only — `lockCountry`, because the code goes by
 *     Fast2SMS) and "Send code";
 *  2. the six-digit code, sent automatically when the sixth digit lands, with
 *     "Resend code" behind a two-minute countdown and "Change number".
 *
 * Staying signed in needs nothing here: the session cookie is refreshed on
 * every visit for ninety days (server `UB_REFRESH_TOKEN_DAYS`), on a phone and
 * a desktop alike, so there is no "remember me" to tick.
 */
export function OtpSignInPageContent({ mode }: OtpSignInPageContentProps): React.JSX.Element {
  const { t } = useTranslation();
  const appName = useAppSelector(selectAppName);
  const schemas = useAuthSchemas();
  const flow = useOtpSignIn();
  // Mounted here so a session created on this screen routes itself (FR-9).
  useAuthRedirect();

  const mobileForm = useForm<OtpMobileFormValues>({
    resolver: yupResolver(schemas.otpMobileSchema),
    mode: 'onTouched',
    defaultValues: { mobile: '' },
  });
  const codeForm = useForm<OtpCodeFormValues>({
    resolver: yupResolver(schemas.otpCodeSchema),
    mode: 'onSubmit',
    defaultValues: { code: '' },
  });

  const disabled = !flow.canSubmit;
  const otp = flow.otp;

  const changeNumber = (): void => {
    codeForm.reset({ code: '' });
    flow.changeNumber();
  };

  /** A refused code empties the cells, so the next one is typed, not edited. */
  const verify = async (values: OtpCodeFormValues): Promise<void> => {
    await flow.verify(values, codeForm.setError);
    if (codeForm.getFieldState('code').error) codeForm.setValue('code', '');
  };

  const resend = async (): Promise<void> => {
    codeForm.reset({ code: '' });
    await flow.resend();
  };

  return (
    <UbStack gap={6} className="w-full">
      <AuthScreenHeading
        title={
          otp
            ? t('auth.otp.codeTitle')
            : mode === 'signUp'
              ? t('auth.signUp.heading')
              : t('auth.signIn')
        }
        description={
          otp
            ? t('auth.otp.sentTo', { mobile: formatPhoneForDisplay(otp.mobile) })
            : t('auth.otp.prompt', { appName })
        }
      />

      <AuthPanel>
        <UbStack gap={4}>
          {flow.isOffline && (
            <UbStatusBanner
              tone="offline"
              title={t('common.network.offline')}
              description={t('auth.offline.body')}
            />
          )}
          {flow.throttledSeconds > 0 && (
            <UbStatusBanner
              tone="warning"
              title={t('auth.login.throttled', {
                minutes: Math.max(1, Math.ceil(flow.throttledSeconds / 60)),
              })}
              description={t('auth.otp.throttledBody')}
            />
          )}

          {otp === null ? (
            <UbForm
              form={mobileForm}
              onSubmit={(values) => flow.sendCode(values, mobileForm.setError)}
              formErrors={flow.formErrors}
            >
              <UbField
                name="mobile"
                label={t('auth.otp.mobileLabel')}
                placeholder={t('auth.otp.mobilePlaceholder')}
                required
              >
                {(field) => (
                  <UbPhoneInput
                    {...field}
                    lockCountry
                    autoComplete="tel-national"
                    disabled={disabled}
                  />
                )}
              </UbField>
              <UbButton
                type="submit"
                size="md"
                fullWidth
                busy={flow.isSending}
                busyLabel={t('auth.otp.sending')}
                disabled={disabled}
              >
                {t('auth.otp.send')}
              </UbButton>
            </UbForm>
          ) : (
            <UbForm
              form={codeForm}
              onSubmit={verify}
              formErrors={flow.formErrors}
            >
              <UbField name="code" label={t('auth.otp.codeLabel')} controlOwnsLabel required>
                {(field) => (
                  <UbOtpInput
                    id={field.id}
                    value={(field.value as string) ?? ''}
                    onChange={field.onChange}
                    // The sixth digit is the submit: SMS autofill fills all six
                    // at once, and a second tap on "Verify" is a wasted one.
                    onComplete={(code) => {
                      codeForm.setValue('code', code);
                      void codeForm.handleSubmit(verify)();
                    }}
                    invalid={field.invalid}
                    readOnly={flow.isVerifying}
                    disabled={disabled}
                    autoFocus
                    label={t('auth.otp.codeLabel')}
                    cellLabel={(index, total) => t('auth.otp.cell', { index, total })}
                    describedBy={field['aria-describedby']}
                  />
                )}
              </UbField>
              <UbButton
                type="submit"
                size="md"
                fullWidth
                busy={flow.isVerifying}
                busyLabel={t('auth.otp.verifying')}
                disabled={disabled}
              >
                {t('auth.otp.verify')}
              </UbButton>
              <UbStack direction="row" justify="between" align="center" gap={2} wrap>
                {flow.resendSeconds > 0 ? (
                  <UbText variant="body-sm" tone="tertiary" aria-live="polite">
                    {t('auth.otp.resendIn', { time: clock(Math.min(flow.resendSeconds, RESEND_SECONDS)) })}
                  </UbText>
                ) : (
                  <UbButton
                    variant="ghost"
                    size="sm"
                    onClick={() => void resend()}
                    busy={flow.isSending}
                    busyLabel={t('auth.otp.sending')}
                    disabled={disabled}
                  >
                    {t('auth.otp.resend')}
                  </UbButton>
                )}
                <UbButton
                  variant="ghost"
                  size="sm"
                  onClick={changeNumber}
                  disabled={flow.isVerifying}
                >
                  {t('auth.otp.changeNumber')}
                </UbButton>
              </UbStack>
            </UbForm>
          )}
        </UbStack>
      </AuthPanel>

      {otp === null && (
        <UbText variant="body-sm" tone="tertiary" align="center">
          {mode === 'signUp' ? (
            <>
              {t('auth.signUp.haveAccount')}{' '}
              <UbLink href={ROUTES.LOGIN} variant="inherit">
                {t('auth.signIn')}
              </UbLink>
            </>
          ) : (
            <>
              {t('auth.signUp.prompt', { appName })}{' '}
              <UbLink href={ROUTES.SIGNUP} variant="inherit">
                {t('auth.signUp.link')}
              </UbLink>
            </>
          )}
        </UbText>
      )}
      {/* Creating an account is where the terms are accepted, so the sign-up
          screen still says so; the same flow signing in does not. */}
      {mode === 'signUp' && <AuthLegalNotice />}
    </UbStack>
  );
}
