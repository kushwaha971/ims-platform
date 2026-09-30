'use client';

import { useEffect } from 'react';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';

import { selectPartyRoles } from '../redux/partyRoleSlice';
import { fetchPartyRoles } from '../redux/partyRoleThunk';

import type { PartyRole } from '../types/party.types';

/**
 * A6 (PLT-X04 §7) — the role chips' source. Fetched only when `enabled`: the
 * list turns it on when its rows carry `roles` (a module with roles is on) or
 * when a `role` filter is already applied, so a shop without such a module
 * never makes the request.
 */
export function usePartyRoles(enabled: boolean): readonly PartyRole[] {
  const dispatch = useAppDispatch();
  const roles = useAppSelector(selectPartyRoles);

  /* Once per mount of the list: the counts move when a module adds a profile,
     and a list opened this morning should not show yesterday's "Members · 34". */
  useEffect(() => {
    if (!enabled) return undefined;
    const promise = dispatch(fetchPartyRoles());
    return () => promise.abort();
  }, [enabled, dispatch]);

  return enabled ? roles : [];
}
