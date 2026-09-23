'use client';

import { useCallback } from 'react';

import { useRouter } from 'next/navigation';

import { ChevronDown, LogOut } from 'lucide-react';

import { UbAvatar, UbBox, UbText } from 'src/design-system';
import { MLMenu, MLMenuItem } from 'src/design-system/primitives';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectSessionUser } from 'src/redux/slice/sessionSlice';
import { ROUTES } from 'src/routes';

import { logout } from 'modules/DigiKhaato/features/auth/redux/sessionThunk';
import { PartyQuickSearch } from 'modules/DigiKhaato/features/parties/components/PartyQuickSearch';

/**
 * The desktop app bar — the owner asked for a header across the top of every
 * screen. 56 px, white, a hairline under it, sticky; the page's own header
 * (title, description, actions) still starts the content beneath it.
 *
 * What is in it is what exists: the party search (the one question asked
 * from anywhere — "where is Ramesh's khata?") and the account menu with
 * Sign out, which had no home until now. No notification bell: notifications
 * are not built, and a bell that never rings is a feature that is not there
 * (the owner's rule: do not show what is not built).
 */
export function UbAppTopBar(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectSessionUser);

  const signOut = useCallback(async () => {
    await dispatch(logout());
    router.replace(ROUTES.LOGIN);
  }, [dispatch, router]);

  return (
    <UbBox
      as="header"
      className="sticky top-0 z-30 hidden h-14 shrink-0 items-center justify-between gap-6 border-b border-border-hairline bg-surface-card px-6 lg:flex"
    >
      <PartyQuickSearch className="max-w-[360px]" />

      {user && (
        <MLMenu
          align="end"
          ariaLabel={t('nav.account.menu')}
          triggerLabel={t('nav.account.trigger', { name: user.name || user.email })}
          className="w-auto"
          triggerClassName="min-h-0 gap-2 px-2 py-1"
          trigger={
            <>
              <UbAvatar name={user.name || user.email} size="sm" />
              <UbBox as="span" className="flex min-w-0 flex-col text-left">
                <UbText
                  as="span"
                  variant="inherit"
                  truncate
                  className="ds-nav-label-medium max-w-40 text-text-primary"
                >
                  {user.name || user.email}
                </UbText>
                {user.name && (
                  <UbText
                    as="span"
                    variant="inherit"
                    truncate
                    className="ds-nav-caption-regular max-w-40 text-text-tertiary"
                  >
                    {user.email}
                  </UbText>
                )}
              </UbBox>
              <ChevronDown aria-hidden className="h-4 w-4 shrink-0 text-text-tertiary" />
            </>
          }
        >
          <MLMenuItem onSelect={() => void signOut()}>
            <LogOut aria-hidden className="h-4 w-4" />
            {t('auth.logout.action')}
          </MLMenuItem>
        </MLMenu>
      )}
    </UbBox>
  );
}
