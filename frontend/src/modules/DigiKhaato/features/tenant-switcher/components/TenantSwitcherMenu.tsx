'use client';

import { useCallback, useState } from 'react';

import { useRouter } from 'next/navigation';

import { ChevronsUpDown, Plus, Star } from 'lucide-react';

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
import { useTranslation } from 'src/hooks/useTranslation';
import { ROUTES } from 'src/routes';
import { cn } from 'src/utils/cn';
import { roleLabel } from 'src/utils/roleLabel';

import { useTenantSwitcher } from '../hooks/useTenantSwitcher';
import {
  MENU_TENANT_LIMIT,
  canLeave,
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
  const [leavingMembershipId, setLeavingMembershipId] = useState<string | null>(null);

  const confirmLeave = useCallback(async () => {
    if (!leavingMembershipId) return;
    await switcher.leave(leavingMembershipId);
    setLeavingMembershipId(null);
  }, [leavingMembershipId, switcher]);

  const seeAll = useCallback(() => router.push(ROUTES.SWITCH_TENANT), [router]);

  // Before `/auth/me` lands there is no name to show; a placeholder chevron
  // next to an empty string reads as a broken control.
  if (!switcher.activeTenant) return null;

  const active = switcher.activeTenant;
  const shown = switcher.groups.active.slice(0, MENU_TENANT_LIMIT);
  const overflow = switcher.groups.active.length > MENU_TENANT_LIMIT;
  const activeName = tenantNameView(active.name);

  return (
    <>
      <MLMenu
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
                {caption && (
                  <UbText
                    as="span"
                    variant="inherit"
                    truncate
                    className="ds-nav-caption-regular text-text-onNavMuted"
                  >
                    {caption}
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
        <MLMenuLabel>{t('tenant.switcher.title')}</MLMenuLabel>

        {shown.map((tenant) => {
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
