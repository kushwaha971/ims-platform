'use client';

import { useCallback } from 'react';

import { useRouter } from 'next/navigation';

import { Check, ChevronDown, LogOut } from 'lucide-react';

import { UbAvatar, UbBox, UbDivider, UbText } from 'src/design-system';
import { MLMenu, MLMenuItem, MLMenuLabel } from 'src/design-system/primitives';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useLocaleSwitch } from 'src/hooks/useLocaleSwitch';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectSessionUser } from 'src/redux/slice/sessionSlice';
import { ROUTES } from 'src/routes';
import { cn } from 'src/utils/cn';

import { logout } from 'modules/DigiKhaato/features/auth/redux/sessionThunk';

/**
 * The account menu — who is signed in, the language, and Sign out.
 *
 * ── UAT D2 (High/P1) ───────────────────────────────────────────────────────
 * This lived inside `UbAppTopBar`, which is `hidden lg:flex`, so below 1024 px
 * — where these merchants actually are — there was no Sign out, no way to see
 * which account the phone was signed in as, and (once the sign-in screen lost
 * its picker) no way to change the language. It is one component now, mounted
 * by the desktop bar with the full trigger and by the phone header `compact`:
 * the avatar alone as a 44 px target, with the name and email moved inside
 * the menu, because a 360 px header has no room to print them and a phone
 * user still needs to see them.
 *
 * The language switch is here at every width and writes the preference through
 * `useLocaleSwitch` — store and `ub_locale` cookie, exactly as the removed
 * picker did — so there is still one way to persist it.
 */
export function AccountMenu({
  compact = false,
}: Readonly<{ compact?: boolean }>): React.JSX.Element | null {
  const { t } = useTranslation();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectSessionUser);
  const { locale, options, setLocale } = useLocaleSwitch();

  const signOut = useCallback(async () => {
    await dispatch(logout());
    router.replace(ROUTES.LOGIN);
  }, [dispatch, router]);

  if (!user) return null;
  const displayName = user.name || user.email;

  return (
    <MLMenu
      align="end"
      ariaLabel={t('nav.account.menu')}
      triggerLabel={t('nav.account.trigger', { name: displayName })}
      className={compact ? 'shrink-0' : 'w-auto'}
      triggerClassName={
        compact ? 'h-11 w-11 min-h-0 justify-center px-0 py-0' : 'min-h-0 gap-2 px-2 py-1'
      }
      trigger={
        compact ? (
          <UbAvatar name={displayName} size="sm" />
        ) : (
          <>
            <UbAvatar name={displayName} size="sm" />
            <AccountIdentity name={user.name} email={user.email} />
            <ChevronDown aria-hidden className="h-4 w-4 shrink-0 text-text-tertiary" />
          </>
        )
      }
    >
      {compact && (
        <>
          <UbBox className="flex items-center gap-3 px-3 py-2">
            <UbAvatar name={displayName} size="md" />
            <AccountIdentity name={user.name} email={user.email} wide />
          </UbBox>
          <UbDivider decorative className="my-1" />
        </>
      )}

      <MLMenuLabel>{t('auth.language.label')}</MLMenuLabel>
      {options.map((option) => (
        <MLMenuItem
          key={option.value}
          selected={option.value === locale}
          onSelect={() => setLocale(option.value)}
        >
          <UbText as="span" variant="inherit" lang={option.value} className="flex-1">
            {option.label}
          </UbText>
          {option.value === locale && <Check aria-hidden className="h-4 w-4 text-accent" />}
        </MLMenuItem>
      ))}

      <UbDivider decorative className="my-1" />
      <MLMenuItem onSelect={() => void signOut()}>
        <LogOut aria-hidden className="h-4 w-4" />
        {t('auth.logout.action')}
      </MLMenuItem>
    </MLMenu>
  );
}

function AccountIdentity({
  name,
  email,
  wide = false,
}: Readonly<{ name: string; email: string; wide?: boolean }>): React.JSX.Element {
  const width = wide ? 'max-w-56' : 'max-w-40';
  return (
    <UbBox as="span" className="flex min-w-0 flex-col text-left">
      <UbText
        as="span"
        variant="inherit"
        truncate
        className={cn('ds-nav-label-medium text-text-primary', width)}
      >
        {name || email}
      </UbText>
      {name && (
        <UbText
          as="span"
          variant="inherit"
          truncate
          className={cn('ds-nav-caption-regular text-text-tertiary', width)}
        >
          {email}
        </UbText>
      )}
    </UbBox>
  );
}
