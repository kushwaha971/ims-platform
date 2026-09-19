'use client';

import { useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectAppName } from 'src/redux/slice/whiteLabelSlice';

/**
 * Sprint 0 ships the `(auth)` route and its layout (Part 32 S0-51); the sign-in
 * form itself is PLT-01, Sprint 1. This content deliberately carries no form:
 * a half-built login is worse than an honest placeholder, and the walking
 * skeleton's e2e signs in against the backend, not against this screen.
 */
export function LoginPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const appName = useAppSelector(selectAppName);

  return (
    <div className="flex flex-col gap-3 text-center">
      <h1 className="ds-h2 text-text-primary">{appName}</h1>
      <p className="ds-body-sm text-text-tertiary">{t('auth.signInPrompt')}</p>
    </div>
  );
}
