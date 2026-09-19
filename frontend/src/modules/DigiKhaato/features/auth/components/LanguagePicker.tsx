'use client';

import { memo, useCallback } from 'react';

import { Globe } from 'lucide-react';

import { UbBox, UbSelect } from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { localeChanged, selectLocale } from 'src/redux/slice/localeSlice';
import { LOCALES, type Locale } from 'src/types/domain.types';
import { cn } from 'src/utils/cn';
import { LOCALE_COOKIE, writeCookie } from 'src/utils/cookieUtils';

/**
 * CR-2026-09-19-D — the language control, moved.
 *
 * PLT-01 FR-8 said "the language picker is the FIRST control on the auth
 * screen", and it was read literally: a two-button toggle group sat above the
 * product's own name on every screen in the group. That is the first thing a
 * new visitor saw, and it asked them to make a choice before they knew what
 * they were choosing for.
 *
 * All three references do the opposite. Notion puts a globe dropdown at the
 * very BOTTOM of the page; Zoho and Linear do not put one on the sign-in screen
 * at all. The requirement behind FR-8 is not "first", it is REACHABLE WITHOUT A
 * SESSION — a merchant who cannot read English must not have to sign in to find
 * the switch. A discreet control at the foot of every auth page satisfies that
 * and stops the page opening with a question.
 *
 * What did NOT change: the choice is still written to the readable `ub_locale`
 * cookie as well as the store, so the next server-rendered `<html lang>` matches
 * and there is no flash of English (§19.11.2). And the option labels are still
 * each written in their own language — "English", "हिन्दी" — because the only
 * version a person who needs this control can read is the one in their own
 * script.
 *
 * It is a native `<select>` for the same reason `UbSelect` is (§23.3): on a
 * 2 GB Android phone it renders as the platform picker, it is keyboard-operable
 * and type-ahead searchable for free, and it costs no JavaScript.
 */
const LABELS: Readonly<Record<Locale, string>> = { en: 'English', hi: 'हिन्दी' };

const OPTIONS = LOCALES.map((locale) => ({ value: locale, label: LABELS[locale] }));

function LanguagePickerBase({ className }: Readonly<{ className?: string }>) {
  const dispatch = useAppDispatch();
  const locale = useAppSelector(selectLocale);
  const { t } = useTranslation();

  const onChange = useCallback(
    (next: string) => {
      const value = (LOCALES as readonly string[]).includes(next) ? (next as Locale) : 'en';
      dispatch(localeChanged(value));
      writeCookie(LOCALE_COOKIE, value);
    },
    [dispatch]
  );

  return (
    <UbBox className={cn('relative inline-flex items-center', className)}>
      <Globe
        aria-hidden
        className="pointer-events-none absolute left-3 h-4 w-4 shrink-0 text-text-tertiary"
      />
      <UbSelect
        value={locale}
        onChange={onChange}
        options={OPTIONS}
        aria-label={t('auth.language.change')}
        // Quiet by design: a transparent surface and the subtle border, not the
        // `--border-strong` a form field earns. 44 px tall regardless (R-A-3).
        className="ds-body-sm w-auto border-border-subtle bg-transparent pl-9 pr-8 text-text-secondary"
      />
    </UbBox>
  );
}

LanguagePickerBase.displayName = 'LanguagePicker';
export const LanguagePicker = memo(LanguagePickerBase);
