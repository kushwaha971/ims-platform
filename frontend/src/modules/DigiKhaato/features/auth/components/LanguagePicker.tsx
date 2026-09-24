'use client';

import { memo } from 'react';

import { Globe } from 'lucide-react';

import { UbBox, UbNativeSelect } from 'src/design-system';
import { useLocaleSwitch } from 'src/hooks/useLocaleSwitch';
import { useTranslation } from 'src/hooks/useTranslation';
import { cn } from 'src/utils/cn';

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
/* UAT D2 — the labels and the write (store + `ub_locale` cookie) now live in
   `useLocaleSwitch`, shared with the account menu's switch, so the two controls
   cannot persist the preference two different ways. */
function LanguagePickerBase({ className }: Readonly<{ className?: string }>) {
  const { locale, options, setLocale } = useLocaleSwitch();
  const { t } = useTranslation();

  return (
    <UbBox className={cn('relative inline-flex items-center', className)}>
      <Globe
        aria-hidden
        className="pointer-events-none absolute left-3 h-4 w-4 shrink-0 text-text-tertiary"
      />
      <UbNativeSelect
        value={locale}
        onChange={setLocale}
        options={options}
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
