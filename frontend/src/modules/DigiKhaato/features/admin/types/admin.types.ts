/** PLT-14 — the super-admin console's shapes, camelCase. */

import type {
  SupportAccess,
  SupportAccessApi,
} from 'modules/DigiKhaato/features/account-data/types/accountData.types';

export type AdminTenantStatus = 'active' | 'suspended' | 'pending_deletion' | 'deleted';

export const ADMIN_TENANT_STATUSES: readonly AdminTenantStatus[] = [
  'active',
  'suspended',
  'pending_deletion',
  'deleted',
];

export interface AdminRef {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

export interface AdminTenantRow {
  readonly id: string;
  readonly name: string;
  readonly status: AdminTenantStatus;
  readonly businessType: string;
  readonly gstin: string | null;
  readonly partner: AdminRef;
  readonly plan: AdminRef;
  readonly ownerEmail: string | null;
  readonly createdAt: string;
  readonly lastActivityAt: string | null;
  readonly members: number;
  readonly parties: number;
}

export interface AdminLimit {
  readonly limit: number | null;
  readonly used: number;
}

export interface AdminAuditLine {
  readonly id: string;
  readonly action: string;
  readonly actorType: string;
  readonly actorName: string | null;
  readonly createdAt: string;
  readonly reason: string | null;
}

export interface AdminTenantDetail extends AdminTenantRow {
  readonly legalName: string | null;
  readonly stateCode: string;
  readonly deletionRequestedAt: string | null;
  readonly enabledModules: readonly string[];
  readonly planCode: string;
  readonly maxUsers: AdminLimit;
  readonly storageMb: AdminLimit;
  readonly overrides: { readonly maxUsers: number | null; readonly storageMb: number | null };
  readonly owners: readonly {
    readonly id: string;
    readonly name: string;
    readonly email: string;
  }[];
  readonly supportAccess: SupportAccess | null;
  readonly recentAudit: readonly AdminAuditLine[];
}

export interface AdminPartnerRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: string;
  readonly defaultPlanCode: string | null;
  readonly tenantCount: number;
  readonly createdAt: string;
}

export interface AdminPlan {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly isActive: boolean;
}

export interface AdminOverview {
  readonly total: number;
  readonly active: number;
  readonly suspended: number;
  readonly pendingDeletion: number;
  readonly partners: number;
}

export interface AdminHealth {
  readonly dbOk: boolean;
  readonly dbLatencyMs: number;
  readonly storageOk: boolean;
  readonly freeMb: number | null;
  readonly schedulerOk: boolean;
  readonly lastHeartbeatAt: string | null;
  readonly lagS: number | null;
  readonly queued: number;
  readonly running: number;
  readonly failed24h: number;
  readonly oldestQueuedS: number | null;
  readonly version: string;
  readonly emailBackend: string;
  readonly checkedAt: string;
}

export interface AdminTenantFilters {
  readonly q: string;
  readonly status: AdminTenantStatus | null;
  readonly page: number;
  readonly pageSize: number;
}

export interface AdminTenantPatch {
  readonly reason: string;
  readonly planId?: string;
  readonly status?: 'active' | 'suspended';
  readonly overrides?: { readonly maxUsers: number | null; readonly storageMb: number | null };
}

// ── Wire shapes ──────────────────────────────────────────────────────────────

export interface AdminTenantRowApi {
  readonly id: string;
  readonly name: string;
  readonly status: AdminTenantStatus;
  readonly business_type: string;
  readonly gstin: string | null;
  readonly partner: AdminRef;
  readonly plan: AdminRef;
  readonly owner_email: string | null;
  readonly created_at: string;
  readonly last_activity_at: string | null;
  readonly usage: { readonly members: number; readonly parties: number };
}

export interface AdminTenantDetailApi extends AdminTenantRowApi {
  readonly legal_name: string | null;
  readonly state_code: string;
  readonly deletion_requested_at: string | null;
  readonly enabled_modules: readonly string[];
  readonly entitlements: {
    readonly plan_code: string;
    readonly limits: {
      readonly max_users?: AdminLimit;
      readonly storage_mb?: AdminLimit;
    };
    readonly overrides: { readonly max_users?: number | null; readonly storage_mb?: number | null };
  };
  readonly owners: readonly {
    readonly id: string;
    readonly name: string;
    readonly email: string;
  }[];
  readonly support_access: SupportAccessApi | null;
  readonly recent_audit: readonly {
    readonly id: string;
    readonly action: string;
    readonly actor_type: string;
    readonly actor_name: string | null;
    readonly created_at: string;
    readonly metadata?: { readonly reason?: string };
  }[];
}
