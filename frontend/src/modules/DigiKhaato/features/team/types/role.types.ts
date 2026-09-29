import type { ModuleCode, TenantRole } from 'src/types/domain.types';

/**
 * A13 (PLT-X12, ADR-052) — the roles a member can hold.
 *
 * The canon four, plus MODULE roles: system roles owned by one vertical
 * (`lending_agent`, `gym_trainer`, `hospitality_housekeeping`), named
 * `<module>_<role>` by contract, assignable only while that module is on.
 */
export type ModuleRoleCode = `${ModuleCode}_${string}`;
export type MemberRoleCode = TenantRole | ModuleRoleCode;

/** `GET /roles`, one row, exactly as the server sends it. */
export interface RoleApiRow {
  readonly code: MemberRoleCode;
  readonly module: ModuleCode | null;
  /** The catalogue key the name is drawn with (`tenant.role.staff`, `gym.role.trainer`). */
  readonly label_id: string;
  /** False for `owner`: ownership is transferred, never granted. */
  readonly assignable: boolean;
  readonly is_module_role: boolean;
}

export interface RoleOption {
  readonly code: MemberRoleCode;
  readonly module: ModuleCode | null;
  readonly labelId: string;
  readonly assignable: boolean;
  readonly isModuleRole: boolean;
}

/** What a member or invitation row says about its role (BR-6). */
export interface RoleView {
  readonly code: MemberRoleCode;
  readonly labelId: string;
  /** The vertical a module role belongs to; null for the canon roles. */
  readonly module: ModuleCode | null;
  /** False while a module role's module is switched off. */
  readonly active: boolean;
}
