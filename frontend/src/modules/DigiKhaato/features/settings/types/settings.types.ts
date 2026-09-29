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

export interface NumberingRow {
  readonly prefix: string;
  readonly next_number: number;
  readonly padding: number;
  readonly reset_fy: boolean;
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
