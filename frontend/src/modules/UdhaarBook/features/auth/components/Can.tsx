'use client';

import { memo, type ReactNode } from 'react';

import { useAppSelector } from 'src/hooks/useAppStore';
import { selectEnabledModules, selectPermissions } from 'src/redux/slice/sessionSlice';
import type { ModuleCode, PermissionCode } from 'src/types/domain.types';

/**
 * Part 19 §19.7.5 — the render-time permission gate, verbatim in shape.
 *
 * The client uses permissions to decide what to RENDER; the server enforces
 * them on every request. This check is a UX affordance, never a security
 * boundary — which is why a missing permission HIDES an action rather than
 * disabling it: a disabled button invites a support call, and a hidden one is
 * simply not part of that user's product (R-SEC-2).
 *
 * `module` is the PLT-15 half of the same idea: a module outside the tenant's
 * effective entitlement does not exist in the UI at all (AC-4).
 */
export interface CanProps {
  readonly permission: PermissionCode | readonly PermissionCode[];
  /** When several are given, require all of them instead of any. */
  readonly requireAll?: boolean;
  /** Also require the module to be enabled for this tenant. */
  readonly module?: ModuleCode;
  readonly children: ReactNode;
  /** Rendered instead of children when not permitted. Default: nothing. */
  readonly fallback?: ReactNode;
}

function CanBase({
  permission,
  requireAll = false,
  module,
  children,
  fallback = null,
}: Readonly<CanProps>) {
  const permissions = useAppSelector(selectPermissions);
  const modules = useAppSelector(selectEnabledModules);

  if (module && !modules.includes(module)) return <>{fallback}</>;

  const needed = Array.isArray(permission)
    ? (permission as readonly PermissionCode[])
    : [permission as PermissionCode];
  const ok = requireAll
    ? needed.every((code) => permissions.includes(code))
    : needed.some((code) => permissions.includes(code));

  return <>{ok ? children : fallback}</>;
}

CanBase.displayName = 'Can';
export const Can = memo(CanBase);
