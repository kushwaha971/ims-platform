'use client';

import { useEffect, useMemo } from 'react';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import type { RequestStatus } from 'src/types/api.types';

import { INVITABLE_ROLES } from '../constants/teamDefaults';
import { selectRoles, selectRolesStatus } from '../redux/roleSlice';
import { fetchRoles } from '../redux/roleThunk';
import { assignableRoleOptions } from '../view-model/roleDisplay';

import type { RoleOption } from '../types/role.types';

/**
 * A13 (PLT-X12 §7) — the roles the add and invite dialogs offer, from
 * `GET /roles` rather than a hard-coded four. Until the list arrives (or if it
 * cannot be fetched) the dialogs offer the canon three, which is exactly what
 * they offered before module roles existed — never an empty picker.
 */
export interface UseRolesResult {
  readonly assignable: readonly RoleOption[];
  readonly status: RequestStatus;
}

export function useRoles(enabled: boolean): UseRolesResult {
  const dispatch = useAppDispatch();
  const rows = useAppSelector(selectRoles);
  const status = useAppSelector(selectRolesStatus);

  useEffect(() => {
    if (!enabled) return undefined;
    const promise = dispatch(fetchRoles());
    return () => promise.abort();
  }, [dispatch, enabled]);

  const assignable = useMemo(() => assignableRoleOptions(rows, INVITABLE_ROLES), [rows]);
  return { assignable, status };
}
