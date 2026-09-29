'use client';

import { memo, useCallback } from 'react';

import { Moon, Sun } from 'lucide-react';

import { UbBox, UbButton } from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useLocaleSwitch } from 'src/hooks/useLocaleSwitch';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectThemeMode, themeChanged } from 'src/redux/slice/themeSlice';
import type { Locale } from 'src/types/domain.types';
import { cn } from 'src/utils/cn';

/**
 * The landing page's two preferences. The owner's rule "no theme or language
 * picker on sign-in" is about the sign-in screen; a public page that a
 * shopkeeper reads before deciding anything is exactly where both belong.
 *
 * Both write through the SAME paths the app uses — `themeChanged` (which
 * `ThemeProvider` persists to `ub_theme_choice`, read by the pre-paint
 * script) and `useLocaleSwitch` (the `ub_locale` cookie) — so a choice made
 * here is the choice the app opens with after sign-up.
 */
function ThemeToggleBase({ className }: Readonly<{ className?: string }>) {
  const dispatch = useAppDispatch();
  const mode = useAppSelector(selectThemeMode);
  const { t } = useTranslation();
  const dark = mode === 'dark';

  const onClick = useCallback(() => {
    dispatch(themeChanged(dark ? 'light' : 'dark'));
  }, [dispatch, dark]);

  return (
    <UbButton
      variant="ghost"
      iconOnly
      aria-pressed={dark}
      onClick={onClick}
      data-testid="landing-theme-toggle"
      icon={dark ? <Moon aria-hidden className="h-4 w-4" /> : <Sun aria-hidden className="h-4 w-4" />}
      className={cn('rounded-pill', className)}
    >
      {t('landing.theme.dark')}
    </UbButton>
  );
}

ThemeToggleBase.displayName = 'ThemeToggle';
export const ThemeToggle = memo(ThemeToggleBase);

const LANGUAGE_BUTTONS: readonly { readonly value: Locale; readonly label: string }[] = [
  { value: 'en', label: 'EN' },
  { value: 'hi', label: 'हिन्दी' },
];

function LanguageToggleBase({ className }: Readonly<{ className?: string }>) {
  const { locale, setLocale } = useLocaleSwitch();
  const { t } = useTranslation();

  return (
    <UbBox
      role="group"
      aria-label={t('landing.language.label')}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-pill border border-border-hairline p-0.5',
        className
      )}
    >
      {LANGUAGE_BUTTONS.map((option) => {
        const active = option.value === locale;
        return (
          <UbButton
            key={option.value}
            variant="ghost"
            size="sm"
            lang={option.value}
            aria-pressed={active}
            onClick={() => setLocale(option.value)}
            className={cn(
              'h-7 rounded-pill px-2.5',
              active ? 'bg-surface-sunken text-text-primary' : 'text-text-tertiary'
            )}
          >
            {option.label}
          </UbButton>
        );
      })}
    </UbBox>
  );
}

LanguageToggleBase.displayName = 'LanguageToggle';
export const LanguageToggle = memo(LanguageToggleBase);
