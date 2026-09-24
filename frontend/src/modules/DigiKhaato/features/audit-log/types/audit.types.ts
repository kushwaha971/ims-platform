/** PLT-08 FR-1 — one audit row as the viewer shows it. */
export interface AuditActor {
  readonly id: string;
  readonly name: string | null;
  readonly role: string | null;
  readonly isFormerMember: boolean;
}

export type AuditActorType = 'user' | 'system' | 'webhook' | 'super_admin';

export interface AuditRow {
  readonly id: string;
  readonly createdAt: string;
  readonly actor: AuditActor | null;
  readonly actorType: AuditActorType;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string | null;
  readonly entityLabel: string | null;
  /** FR-5 — the page to open, or null when the entity has none (or is gone). */
  readonly entityRoute: string | null;
  readonly before: Readonly<Record<string, unknown>> | null;
  readonly after: Readonly<Record<string, unknown>> | null;
  readonly changedKeys: readonly string[];
  readonly reason: string | null;
  readonly requestId: string | null;
  /** Owner/admin only (§19); absent for the accountant. */
  readonly ip: string | null;
}

/** FR-3's action groups — the server maps each to action prefixes. */
export const AUDIT_GROUPS = [
  'parties',
  'ledger',
  'bills',
  'payments',
  'stock',
  'team',
  'settings',
  'auth',
] as const;
export type AuditGroup = (typeof AUDIT_GROUPS)[number];

export type AuditPeriod = 'today' | 'last7' | 'last30' | 'custom';

export interface AuditFilters {
  readonly period: AuditPeriod;
  readonly dateFrom: string | null;
  readonly dateTo: string | null;
  readonly actorId: string | null;
  readonly group: AuditGroup | null;
  readonly q: string;
  readonly page: number;
  readonly pageSize: number;
}

export interface AuditRowApi {
  readonly id: string;
  readonly created_at: string;
  readonly actor: {
    readonly id: string;
    readonly name: string | null;
    readonly role: string | null;
    readonly is_former_member?: boolean;
  } | null;
  readonly actor_type: string;
  readonly action: string;
  readonly entity_type: string;
  readonly entity_id: string | null;
  readonly entity_label: string | null;
  readonly entity_route?: string | null;
  readonly before: Record<string, unknown> | null;
  readonly after: Record<string, unknown> | null;
  readonly changed_keys?: readonly string[];
  readonly metadata?: {
    readonly reason?: string | null;
    readonly request_id?: string | null;
    readonly ip?: string | null;
  };
}
