/**
 * PLT-06 — the tenant settings object, as `GET /tenants/current/settings`
 * returns it. `values` are the server's stored shapes (small objects, not bare
 * scalars — see `apps/platform_app/settings_schema.py` for why), passed
 * through untouched so a PUT sends back exactly what it read plus the edit.
 */
export type CreditLimitMode = 'off' | 'warn' | 'block';

export interface ReminderTemplates {
  readonly en: string;
  readonly hi: string;
}

/** The keys this client edits; the rest travel through `values` unchanged. */
export interface SettingsValues {
  readonly 'ledger.credit_limit_mode'?: { readonly mode: CreditLimitMode };
  readonly 'ledger.reminder_templates'?: ReminderTemplates;
  readonly [key: string]: unknown;
}

/**
 * One series in the numbering block. A8 (ADR-051): `mode` is `fy` (restarts
 * each financial year, `INV/26-27/0042`) or `perpetual` (never resets, `M-0007`,
 * `1024`); a module's registered kinds also carry `kind`, `module` and the
 * catalogue key they are named with. `reset_fy` is gone (owner Q14): every
 * series resets each year whatever it said, so it is not shown until it is wired.
 */
export interface NumberingRow {
  readonly mode: 'fy' | 'perpetual';
  readonly kind?: string;
  readonly module?: string;
  readonly label_id?: string;
  readonly prefix: string;
  readonly next_number: number;
  readonly padding: number;
  readonly preview: string;
}

export interface SettingsModules {
  readonly enabled: readonly string[];
  readonly available: readonly string[];
  readonly locked: readonly string[];
  readonly core: readonly string[];
}

export interface TenantSettings {
  readonly values: SettingsValues;
  readonly numbering: Readonly<Record<string, NumberingRow>>;
  readonly fyLabel: string;
  readonly modules: SettingsModules;
  readonly etag: string;
}

export interface SettingsDefaults {
  readonly values: SettingsValues;
  readonly businessType: string;
}

/** The sections this client renders (PLT-06 FR-1). */
export type SettingsSection = 'ledger' | 'modules';

/**
 * A12 (PLT-X10, R14) — what a refused "switch off" says is still open, read
 * from the 409's `details.breakdown` by `moduleRefusalFrom`.
 */
export interface ModuleRefusalLine {
  /** A catalogue key taking `{count}`, or null for an unlabelled counter. */
  readonly labelId: string | null;
  readonly count: number;
}

export interface ModuleRefusal {
  readonly module: string;
  readonly lines: readonly ModuleRefusalLine[];
}
