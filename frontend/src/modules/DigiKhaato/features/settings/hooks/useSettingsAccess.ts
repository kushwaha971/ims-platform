'use client';

import { useMemo } from 'react';

import { useAppSelector } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { selectActiveRole } from 'src/redux/slice/sessionSlice';

/**
 * The client's reading of the settings matrices (PLT-06/PLT-07 §12, WLB-01
 * §12) — mirrored from `apps/platform_app/permissions.py`, which is the
 * authority and decides again on every request.
 *
 * Canon has no `platform.settings.read`. EDIT is `platform.tenant.manage` or
 * the owner/admin role (canon's "(partial)" admin grant); VIEW adds
 * `platform.audit.read`, the one platform codename the accountant holds and
 * staff do not.
 */
export interface SettingsAccess {
  readonly canView: boolean;
  readonly canEdit: boolean;
  readonly canEditBranding: boolean;
  readonly canReadAudit: boolean;
  readonly canManageTeam: boolean;
  /** PLT-10 §12 — "Your data" is the OWNER's, by role (admins hold `platform.tenant.manage`). */
  readonly isOwner: boolean;
}

const EDIT_ROLES: readonly string[] = ['owner', 'admin'];

export const useSettingsAccess = (): SettingsAccess => {
  const { can } = usePermissions();
  const role = useAppSelector(selectActiveRole);
  return useMemo(() => {
    const canEdit = can('platform.tenant.manage') || (role !== null && EDIT_ROLES.includes(role));
    return {
      canView: canEdit || can('platform.audit.read'),
      canEdit,
      canEditBranding: can('platform.branding.manage'),
      canReadAudit: can('platform.audit.read'),
      canManageTeam: can('platform.members.manage'),
      isOwner: role === 'owner',
    };
  }, [can, role]);
};
