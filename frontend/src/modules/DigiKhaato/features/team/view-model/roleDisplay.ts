import type { TranslateFn } from 'src/hooks/useTranslation';
import type { TenantRole } from 'src/types/domain.types';
import { roleLabel } from 'src/utils/roleLabel';

import type { RoleOption, RoleView } from '../types/role.types';

/**
 * A13 (PLT-X12 §7-§8, BR-6) — naming a role on the team screen.
 *
 * A module role's name and caption live in its module's catalogue
 * (`<module>.role.<name>`, `<module>.role.<name>.caption`), which a vertical
 * routes to the `team` catalogue in `locales/catalogues.json`. A key this
 * screen has not loaded comes back from `t` as the key itself; that is never
 * printed — the generic "Feature role" is, because a raw message id on screen
 * is worse than a plain word.
 */

const OWNER: TenantRole = 'owner';

/** `t(id)`, or null when the id has no copy loaded here. */
const loaded = (t: TranslateFn, id: string, values?: Record<string, string>): string | null => {
  const text = t(id, values);
  return text && text !== id ? text : null;
};

/**
 * What the add and invite dialogs offer: the server's assignable roles, never
 * `owner` (ownership is transferred, canon §0.7) — or, before the list has
 * arrived, the canon `fallback`, so the picker is never empty.
 */
export const assignableRoleOptions = (
  rows: readonly RoleOption[],
  fallback: readonly TenantRole[]
): RoleOption[] =>
  rows.length
    ? rows.filter((row) => row.assignable && row.code !== OWNER)
    : fallback
        .filter((code) => code !== OWNER)
        .map((code) => ({
          code,
          module: null,
          labelId: `tenant.role.${code}`,
          assignable: true,
          isModuleRole: false,
        }));

export interface RoleText {
  readonly label: string;
  /** Module roles only: what the role cannot see, or "inactive while … is off". */
  readonly caption: string | null;
}

export const roleText = (t: TranslateFn, view: RoleView): RoleText => {
  // An empty id is a row from a server that predates module roles.
  const label = roleLabel(t, view.code, view.labelId || null);
  const labelId = view.labelId || `tenant.role.${view.code}`;
  if (!view.module) return { label, caption: null };
  // The module's name, or null — never the raw code: "Inactive while gym is
  // off" is a message id wearing a sentence.
  const moduleName = loaded(t, `nav.module.${view.module}`);
  if (!view.active) {
    return {
      label,
      caption: moduleName
        ? t('team.role.inactive', { module: moduleName })
        : t('team.role.inactiveFeature'),
    };
  }
  return { label, caption: loaded(t, `${labelId}.caption`) ?? moduleName };
};

/** A picker option's words: the role, and for a module role its module. */
export const roleOptionLabel = (t: TranslateFn, option: RoleOption): string => {
  const { label } = roleText(t, {
    code: option.code,
    labelId: option.labelId,
    module: null,
    active: true,
  });
  const moduleName = option.module ? loaded(t, `nav.module.${option.module}`) : null;
  return moduleName ? `${label} · ${moduleName}` : label;
};
