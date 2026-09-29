import { TENANT_ROLES, type TenantRole } from 'src/types/domain.types';

type Translate = (id: string, values?: Record<string, string | number | Date>) => string;

/**
 * A13 (PLT-X12) — the one way to name a role, on every screen that shows one.
 *
 * Canon roles are `tenant.role.<code>`. A module role (`lending_agent`,
 * `gym_trainer`) is named by the `labelId` the server sent, else by the
 * verticals' convention `<module>.role.<name>` derived from its code. A key
 * with no copy loaded on the screen comes back from `t` as the key itself, and
 * that is never printed: the plain "Feature role" is. The tenant switcher, the
 * business chooser and the activity log each used to build `tenant.role.<code>`
 * themselves, which printed "tenant.role.lending_agent" for a collection agent.
 */
export const roleLabel = (t: Translate, code: string, labelId?: string | null): string => {
  const candidates: string[] = [];
  if (labelId) candidates.push(labelId);
  if ((TENANT_ROLES as readonly string[]).includes(code)) {
    candidates.push(`tenant.role.${code as TenantRole}`);
  } else {
    const split = code.indexOf('_');
    if (split > 0) candidates.push(`${code.slice(0, split)}.role.${code.slice(split + 1)}`);
  }
  for (const id of candidates) {
    const text = t(id);
    if (text && text !== id) return text;
  }
  return t('tenant.role.moduleFallback');
};
