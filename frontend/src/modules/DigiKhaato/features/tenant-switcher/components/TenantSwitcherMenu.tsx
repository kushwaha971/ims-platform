'use client';

import { Fragment, useCallback, useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import { Check, ChevronsUpDown, LogOut, Plus, Power, Star } from 'lucide-react';

import {
  UbAvatar,
  UbBox,
  UbConfirmDialog,
  UbListItemText,
  UbStatusBadge,
  UbLogo,
  UbText,
} from 'src/design-system';
import { MLMenu, MLMenuItem, MLMenuLabel, MLSpinner } from 'src/design-system/primitives';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectAppsAddable } from 'src/redux/slice/sessionSlice';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import { ROUTES } from 'src/routes';
import { cn } from 'src/utils/cn';
import { roleLabel } from 'src/utils/roleLabel';

import { leaveApp, setAppRunning } from 'modules/DigiKhaato/features/auth/redux/sessionThunk';
import { useNavigation } from 'modules/DigiKhaato/features/navigation/useNavigation';

import { useTenantSwitcher } from '../hooks/useTenantSwitcher';
import {
  MENU_TENANT_LIMIT,
  canLeave,
  splitByOwnership,
  canSetDefault,
  tenantNameView,
} from '../view-model/tenantDisplay';

/**
 * PLT-04 FR-1 / §7 — the header switcher: the active business's name, and a
 * menu grouping "Your businesses" and "Invitations".
 *
 * §9's states, all of them here: Initial (closed, active name shown) · Loading
 * (a spinner ON THE ROW, menu stays open — the user chose that row and must see
 * which one is working) · Empty (one business: only "Add a business") · Success
 * (snackbar, dashboard) · Error (the 403 case, which the refreshed list already
 * reflects) · Disabled (offline: items disabled, not hidden).
 *
 * EC-5 — a CA with sixty memberships gets the first eight plus "See all", which
 * opens the chooser. A sixty-row dropdown is not a menu.
 *
 * docs/platform/14 §4.2 — the apps of the open business are chosen HERE, above
 * the businesses, never as a row in the sidebar (owner, 5 Oct 2026). The rail
 * caption names the open app, so "Verma Finance · Lending" is always visible,
 * and the sidebar below shows only that app's menu.
 *
 * docs/platform/14 step 4 — the owner adds an app here ("Add Library") and turns
 * the open one off for the business; anyone else leaves the open app. Both
 * ends are confirmed, because both change what other screens show. Businesses
 * are grouped "Your businesses" and "Where you work" (§6.1: separate contexts).
 *
 * FR-7's "Leave business" is behind `UbConfirmDialog` because it is not
 * reversible by the person doing it; FR-2's switch is not, because it is.
 */
export function TenantSwitcherMenu({
  className,
  rail = false,
  caption,
}: Readonly<{
  className?: string;
  /**
   * The desktop rail's header row — BrandHub's sidebar logo block: a 32 px
   * square mark, the business name at 12/16 medium and a 10/16 caption under
   * it, the whole row the switcher's trigger.
   */
  rail?: boolean;
  /** The line under the name in the rail (the product name). */
  caption?: string;
}>): React.JSX.Element | null {
  const { t } = useTranslation();
  const router = useRouter();
  const switcher = useTenantSwitcher();
  const dispatch = useAppDispatch();
  const { apps, app } = useNavigation();
  const addable = useAppSelector(selectAppsAddable);
  const [appAction, setAppAction] = useState<'off' | 'leave' | null>(null);
  const [addingApp, setAddingApp] = useState<string | null>(null);
  const adding = useRef(false);
  const [appBusy, setAppBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [leavingMembershipId, setLeavingMembershipId] = useState<string | null>(null);

  const confirmLeave = useCallback(async () => {
    if (!leavingMembershipId) return;
    await switcher.leave(leavingMembershipId);
    setLeavingMembershipId(null);
  }, [leavingMembershipId, switcher]);

  const seeAll = useCallback(() => router.push(ROUTES.SWITCH_TENANT), [router]);

  // Add an app: run it for the business, open it, and land on its home.
  const addApp = useCallback(
    async (code: string, home: string, name: string) => {
      if (adding.current) return;
      adding.current = true;
      setAppBusy(true);
      setAddingApp(code);
      try {
        const done = await dispatch(setAppRunning({ app: code, running: true }));
        if (setAppRunning.fulfilled.match(done)) {
          dispatch(
            showSnackbar({
              severity: 'success',
              id: 'tenant.switcher.apps.added',
              params: { app: name },
            })
          );
          setMenuOpen(false);
          router.push(home);
        }
      } finally {
        adding.current = false;
        setAppBusy(false);
        setAddingApp(null);
      }
    },
    [dispatch, router]
  );

  // Turn the open app off (owner) or leave it (anyone else), then go to the
  // home of whichever app the server now says this person is in.
  const confirmAppAction = useCallback(async () => {
    if (!app || !appAction) return;
    setAppBusy(true);
    const done =
      appAction === 'off'
        ? await dispatch(setAppRunning({ app, running: false }))
        : await dispatch(leaveApp({ app }));
    setAppBusy(false);
    setAppAction(null);
    if (setAppRunning.fulfilled.match(done) || leaveApp.fulfilled.match(done)) {
      const next = done.payload.apps?.find((row) => row.code === done.payload.activeApp);
      if (next) router.push(next.homePath);
    }
  }, [app, appAction, dispatch, router]);

  // The committed route's useNavigation sync remembers the app on the server.
  // Sending another switch here doubles both the mutation and session read (B21).
  const openApp = useCallback(
    (href: string) => {
      router.push(href);
    },
    [router]
  );

  // Before `/auth/me` lands there is no name to show; a placeholder chevron
  // next to an empty string reads as a broken control.
  if (!switcher.activeTenant) return null;

  const active = switcher.activeTenant;
  const shown = splitByOwnership(switcher.groups.active.slice(0, MENU_TENANT_LIMIT));
  const overflow = switcher.groups.active.length > MENU_TENANT_LIMIT;
  const activeName = tenantNameView(active.name);
  const openAppLabel = apps.find((a) => a.code === app)?.labelId;
  const railCaption = openAppLabel ? t(openAppLabel) : caption;
  const isOwner = active.role === 'owner';
  const openAppName = openAppLabel ? t(openAppLabel) : '';
  const showApps = apps.length > 1 || (isOwner && addable.length > 0);

  return (
    <>
      <MLMenu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        ariaLabel={t('tenant.switcher.title')}
        triggerLabel={t('tenant.switcher.trigger', { name: active.name })}
        className={className}
        triggerClassName={
          rail ? 'min-h-0 gap-2 rounded-none p-3 hover:bg-surface-navHover' : undefined
        }
        trigger={
          rail ? (
            <>
              <UbLogo variant="mark" size="md" />
              <UbBox as="span" className="flex min-w-0 flex-1 flex-col justify-center">
                <UbText
                  as="span"
                  variant="inherit"
                  truncate
                  title={activeName.truncated ? active.name : undefined}
                  className="ds-nav-label-medium text-text-onNav"
                >
                  {activeName.text}
                </UbText>
                {railCaption && (
                  <UbText
                    as="span"
                    variant="inherit"
                    truncate
                    className="ds-nav-caption-regular text-text-onNavMuted"
                  >
                    {railCaption}
                  </UbText>
                )}
              </UbBox>
              <ChevronsUpDown aria-hidden className="h-4 w-4 shrink-0 text-text-onNavMuted" />
            </>
          ) : (
            <>
              <UbAvatar name={active.name} size="sm" tone="onNav" />
              <UbText
                as="span"
                variant="body-sm-medium"
                tone="inherit"
                truncate
                title={activeName.truncated ? active.name : undefined}
                className="min-w-0 flex-1 text-left"
              >
                {activeName.text}
              </UbText>
              <ChevronsUpDown aria-hidden className="h-4 w-4 shrink-0 opacity-70" />
            </>
          )
        }
      >
        {showApps && (
          <>
            <MLMenuLabel>{t('tenant.switcher.apps')}</MLMenuLabel>
            {apps.map((item) => (
              <MLMenuItem
                key={item.code}
                selected={item.code === app}
                onSelect={() => openApp(item.href)}
              >
                <UbText as="span" variant="inherit" tone="inherit" className="min-w-0 flex-1">
                  {t(item.labelId)}
                </UbText>
                {item.code === app && (
                  <Check aria-hidden className="h-4 w-4 shrink-0 text-text-tertiary" />
                )}
              </MLMenuItem>
            ))}
            {isOwner &&
              addable.map((item) => (
                <MLMenuItem
                  key={`add-${item.code}`}
                  disabled={appBusy || !switcher.canSwitch}
                  aria-busy={addingApp === item.code || undefined}
                  className={addingApp === item.code ? 'disabled:opacity-100' : undefined}
                  onSelect={(event) => {
                    event.preventDefault();
                    void addApp(item.code, item.homePath, t(item.labelId));
                  }}
                >
                  {addingApp === item.code ? (
                    <MLSpinner />
                  ) : (
                    <Plus aria-hidden className="h-4 w-4 shrink-0 text-text-tertiary" />
                  )}
                  {t(
                    addingApp === item.code
                      ? 'tenant.switcher.apps.adding'
                      : 'tenant.switcher.apps.add',
                    { app: t(item.labelId) }
                  )}
                </MLMenuItem>
              ))}
            {apps.length > 1 && openAppName && (
              <MLMenuItem
                disabled={appBusy || !switcher.canSwitch}
                onSelect={() => setAppAction(isOwner ? 'off' : 'leave')}
              >
                {isOwner ? (
                  <Power aria-hidden className="h-4 w-4 shrink-0 text-text-tertiary" />
                ) : (
                  <LogOut aria-hidden className="h-4 w-4 shrink-0 text-text-tertiary" />
                )}
                {t(isOwner ? 'tenant.switcher.apps.turnOff' : 'tenant.switcher.apps.leave', {
                  app: openAppName,
                })}
              </MLMenuItem>
            )}
          </>
        )}

        {(
          [
            ['owned', 'tenant.switcher.title'],
            ['working', 'tenant.switcher.workAt'],
          ] as const
        ).map(([group, labelId]) =>
          shown[group].length === 0 ? null : (
            <Fragment key={group}>
              <MLMenuLabel>{t(labelId)}</MLMenuLabel>
              {shown[group].map((tenant) => {
                const name = tenantNameView(tenant.name);
                const busy = switcher.switchingTenantId === tenant.id;
                return (
                  <MLMenuItem
                    key={tenant.id}
                    selected={tenant.id === active.id}
                    disabled={!switcher.canSwitch || busy}
                    onSelect={() => void switcher.switchTo(tenant.id)}
                  >
                    <UbAvatar name={tenant.name} size="sm" />
                    <UbListItemText
                      primary={name.text}
                      primaryVariant="inherit"
                      primaryTone="inherit"
                      title={name.truncated ? tenant.name : undefined}
                      secondary={tenant.role ? roleLabel(t, tenant.role) : undefined}
                    />
                    {tenant.isDefault && (
                      <Star
                        aria-label={t('tenant.switcher.isDefault')}
                        className="h-4 w-4 shrink-0 text-warning"
                      />
                    )}
                    {busy && <MLSpinner />}
                  </MLMenuItem>
                );
              })}
            </Fragment>
          )
        )}

        {overflow && (
          <MLMenuItem onSelect={seeAll}>
            <UbText as="span" variant="inherit" tone="accent">
              {t('tenant.switcher.seeAll')}
            </UbText>
          </MLMenuItem>
        )}

        {/* FR-8 — an invitation OPENS the acceptance screen; it never switches. */}
        {switcher.groups.invited.length > 0 && (
          <>
            <MLMenuLabel>{t('tenant.switcher.invitations')}</MLMenuLabel>
            {switcher.groups.invited.map((tenant) => (
              <MLMenuItem key={tenant.id} onSelect={seeAll}>
                <UbText
                  as="span"
                  variant="inherit"
                  tone="inherit"
                  truncate
                  className="min-w-0 flex-1"
                >
                  {tenant.name}
                </UbText>
                <UbStatusBadge tone="info" label={t('tenant.status.invited')} />
              </MLMenuItem>
            ))}
          </>
        )}

        {/* FR-5 / FR-7 — the actions that act on the CALLER's own membership. */}
        {canSetDefault(active) && active.membershipId && (
          <MLMenuItem
            disabled={!switcher.canSwitch || switcher.busyMembershipId === active.membershipId}
            onSelect={() => void switcher.makeDefault(active.membershipId ?? '')}
          >
            <Star aria-hidden className="h-4 w-4 shrink-0 text-text-tertiary" />
            {t('tenant.switcher.setDefault')}
          </MLMenuItem>
        )}

        <MLMenuItem onSelect={switcher.addBusiness} disabled={!switcher.canSwitch}>
          <Plus aria-hidden className="h-4 w-4 shrink-0 text-text-tertiary" />
          {t('tenant.switcher.add')}
        </MLMenuItem>

        {canLeave(active) && active.membershipId && (
          <MLMenuItem
            disabled={!switcher.canSwitch}
            onSelect={() => setLeavingMembershipId(active.membershipId ?? null)}
            className={cn('text-formError')}
          >
            {t('tenant.switcher.leave')}
          </MLMenuItem>
        )}
      </MLMenu>

      <UbConfirmDialog
        open={appAction !== null}
        onOpenChange={(open) => !open && setAppAction(null)}
        title={t(
          appAction === 'off'
            ? 'tenant.switcher.apps.turnOff.title'
            : 'tenant.switcher.apps.leave.title',
          { app: openAppName, business: active.name }
        )}
        // §8 — the consequence, in one sentence, before the act.
        description={t(
          appAction === 'off'
            ? 'tenant.switcher.apps.turnOff.body'
            : 'tenant.switcher.apps.leave.body',
          { app: openAppName }
        )}
        confirmLabel={t(
          appAction === 'off' ? 'tenant.switcher.apps.turnOff' : 'tenant.switcher.apps.leave',
          { app: openAppName }
        )}
        cancelLabel={t('common.action.cancel')}
        closeLabel={t('common.action.dismiss')}
        onConfirm={() => void confirmAppAction()}
        busy={appBusy}
        busyLabel={t('tenant.switcher.apps.working')}
      />

      <UbConfirmDialog
        open={leavingMembershipId !== null}
        onOpenChange={(open) => !open && setLeavingMembershipId(null)}
        title={t('tenant.switcher.leave.title')}
        // §8 — the consequence, in one sentence, before the act.
        description={
          switcher.error?.code === 'last_owner'
            ? switcher.error.message
            : t('tenant.switcher.leave.body')
        }
        confirmLabel={t('tenant.switcher.leave')}
        cancelLabel={t('common.action.cancel')}
        closeLabel={t('common.action.dismiss')}
        onConfirm={() => void confirmLeave()}
        busy={switcher.busyMembershipId !== null}
        busyLabel={t('tenant.switcher.leaving')}
      />
    </>
  );
}
