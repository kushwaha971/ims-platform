/** PLT-09 — one signed-in device, as the list shows it (FR-1, CR-013). */
export type DeviceKind = 'phone' | 'tablet' | 'desktop';

export interface DeviceSession {
  readonly id: string;
  readonly label: string | null;
  readonly browser: string | null;
  readonly os: string | null;
  readonly device: DeviceKind | null;
  readonly ipMasked: string | null;
  readonly tenantName: string | null;
  readonly createdAt: string;
  readonly lastUsedAt: string | null;
  readonly isCurrent: boolean;
}

/** Wire shape of `GET /auth/sessions` rows. */
export interface DeviceSessionApiRow {
  readonly id: string;
  readonly device_label: string | null;
  readonly user_agent_summary?: {
    readonly browser?: string | null;
    readonly os?: string | null;
    readonly device?: string | null;
  } | null;
  readonly ip_masked?: string | null;
  readonly tenant?: { readonly id: string; readonly name: string } | null;
  readonly created_at: string;
  readonly last_used_at?: string | null;
  readonly is_current?: boolean;
}
