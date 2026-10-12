import { useAppSelector } from 'src/hooks/useAppStore';
import { selectActiveRole } from 'src/redux/slice/sessionSlice';

/** Mirrors `apps.common.permissions.MANAGER_ROLES` — the server is the authority. */
export const MANAGER_ROLES: readonly string[] = ['owner', 'admin'];

/**
 * Owner, 12 Oct 2026: editing and blocking a person (team member, customer,
 * supplier, student, borrower) is the owner's or an admin's act only. Screens
 * use this to HIDE those controls from every other role (§19.7.5: hidden, not
 * disabled); the server refuses them regardless.
 */
export const useIsOwnerOrAdmin = (): boolean => {
  const role = useAppSelector(selectActiveRole);
  return role !== null && MANAGER_ROLES.includes(role);
};
