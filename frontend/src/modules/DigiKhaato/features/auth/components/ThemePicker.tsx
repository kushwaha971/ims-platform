'use client';

import { memo, useCallback } from 'react';

import { Moon, Sun } from 'lucide-react';

import { UbBox, UbSelect } from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectThemeMode, themeChanged } from 'src/redux/slice/themeSlice';
import type { ThemeMode } from 'src/types/domain.types';
import { cn } from 'src/utils/cn';

/**
 * The theme control — and the reason the theme was broken.
 *
 * `themeChanged` existed in `themeSlice` from the beginning and **nothing ever
 * dispatched it.** There was no toggle here, in settings, or anywhere else. That
 * single absence is what made the operating system authoritative: the slice only
 * stopped following `prefers-color-scheme` once `explicit` was true, `explicit`
 * was only set by `themeChanged`, and `themeChanged` had no caller. So a merchant
 * on a device set to Dark got a dark khata with no way to say otherwise, and
 * §19.8.4's "light is the default" was never reachable.
 *
 * Sitting beside the language picker in the auth footer is deliberate: both are
 * preferences a person must be able to set BEFORE they have an account, which is
 * the same argument `LanguagePicker` makes for its own placement. Someone who
 * cannot read a dark screen in a bright shop should not have to sign in first.
 *
 * A native `<select>` for the same reasons as `LanguagePicker` (§23.3): the
 * platform picker on a cheap Android phone, keyboard-operable for free, no
 * JavaScript. The icon changes with the value so the control reads at a glance
 * without depending on colour alone.
 */
const MODES: readonly ThemeMode[] = ['light', 'dark'];

function ThemePickerBase({ className }: Readonly<{ className?: string }>) {
  const dispatch = useAppDispatch();
  const mode = useAppSelector(selectThemeMode);
  const { t } = useTranslation();

  const onChange = useCallback(
    (next: string) => {
      dispatch(themeChanged(next === 'dark' ? 'dark' : 'light'));
    },
    [dispatch]
  );

  const options = MODES.map((value) => ({ value, label: t(`theme.${value}`) }));
  const Icon = mode === 'dark' ? Moon : Sun;

  return (
    <UbBox className={cn('relative inline-flex items-center', className)}>
      <Icon
        aria-hidden
        className="pointer-events-none absolute left-3 h-4 w-4 shrink-0 text-text-tertiary"
      />
      <UbSelect
        value={mode}
        onChange={onChange}
        options={options}
        aria-label={t('theme.change')}
        // Matches LanguagePicker exactly: quiet surface, subtle border, 44px.
        className="ds-body-sm w-auto border-border-subtle bg-transparent pl-9 pr-8 text-text-secondary"
      />
    </UbBox>
  );
}

ThemePickerBase.displayName = 'ThemePicker';
export const ThemePicker = memo(ThemePickerBase);
