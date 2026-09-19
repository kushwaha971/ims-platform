'use client';

import { memo, useCallback } from 'react';

import { MLToggleGroup } from 'src/design-system/primitives';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { localeChanged, selectLocale } from 'src/redux/slice/localeSlice';
import { LOCALES, type Locale } from 'src/types/domain.types';
import { LOCALE_COOKIE, writeCookie } from 'src/utils/cookieUtils';

/**
 * PLT-01 FR-8 — "the language picker is the FIRST control on the auth screen".
 * Not a setting buried behind a session: a merchant who cannot read English
 * cannot get far enough to reach a settings page, so the choice has to be
 * available before the first field.
 *
 * The choice is written to the readable `ub_locale` cookie as well as the
 * store, so the next server-rendered `<html lang>` matches and there is no
 * flash of English (§19.11.2). It is persisted to `platform_user.locale` on the
 * first verify, by the server, from `Accept-Language`.
 *
 * The labels are NOT translated: "English" and "हिन्दी" are each written in
 * their own language, which is the only version a person who needs the toggle
 * can read.
 */
const LABELS: Readonly<Record<Locale, string>> = { en: 'English', hi: 'हिन्दी' };

const OPTIONS = LOCALES.map((locale) => ({ value: locale, label: LABELS[locale] }));

function LanguageToggleBase({ className }: Readonly<{ className?: string }>) {
  const dispatch = useAppDispatch();
  const locale = useAppSelector(selectLocale);
  const { t } = useTranslation();

  const onChange = useCallback(
    (next: Locale) => {
      dispatch(localeChanged(next));
      writeCookie(LOCALE_COOKIE, next);
    },
    [dispatch]
  );

  return (
    <MLToggleGroup
      value={locale}
      onValueChange={onChange}
      options={OPTIONS}
      ariaLabel={t('auth.language.label')}
      className={className}
    />
  );
}

LanguageToggleBase.displayName = 'LanguageToggle';
export const LanguageToggle = memo(LanguageToggleBase);
