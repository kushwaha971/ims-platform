'use client';

import { useCallback, useMemo } from 'react';

import { selectEnabledModules, selectPermissions } from 'src/redux/slice/sessionSlice';
import type { ModuleCode, PermissionCode } from 'src/types/domain.types';

import { useAppSelector } from './useAppStore';

export interface UsePermissionsResult {
  readonly can: (permission: PermissionCode) => boolean;
  readonly canAll: (permissions: readonly PermissionCode[]) => boolean;
  readonly hasModule: (module: ModuleCode) => boolean;
  readonly permissions: readonly PermissionCode[];
}

/**
 * Part 19 §19.7.5 — the client uses permissions to decide what to RENDER; the
 * server enforces them on every request. A missing permission HIDES an action
 * rather than disabling it: a disabled button invites a support call, a hidden
 * one is simply not part of that user's product (R-SEC-2).
 */
export const usePermissions = (): UsePermissionsResult => {
  const permissions = useAppSelector(selectPermissions);
  const modules = useAppSelector(selectEnabledModules);

  const can = useCallback(
    (permission: PermissionCode) => permissions.includes(permission),
    [permissions]
  );
  const canAll = useCallback(
    (needed: readonly PermissionCode[]) => needed.every((p) => permissions.includes(p)),
    [permissions]
  );
  const hasModule = useCallback((module: ModuleCode) => modules.includes(module), [modules]);

  return useMemo(
    () => ({ can, canAll, hasModule, permissions }),
    [can, canAll, hasModule, permissions]
  );
};
