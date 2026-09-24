import type { UbStatusBadgeTone } from 'src/design-system';

import type { SupportAccess } from 'modules/DigiKhaato/features/account-data/types/accountData.types';

import type { AdminTenantPatch, AdminTenantStatus } from '../types/admin.types';
import type { TenantEditFormValues } from '../validation/adminSchemas';

/** PLT-14 — how the console reads. Pure; message ids for `t()`. */

export const tenantStatusTone = (status: AdminTenantStatus): UbStatusBadgeTone => {
  switch (status) {
    case 'active':
      return 'success';
    case 'suspended':
      return 'error';
    case 'pending_deletion':
      return 'warning';
    default:
      return 'neutral';
  }
};

const blankToNull = (value: string): number | null => {
  const trimmed = value.trim();
  return trimmed === '' ? null : Number(trimmed);
};

/**
 * FR-3 / §16 — only what CHANGED goes into the PATCH, so each real change
 * writes exactly one audit row and an untouched plan is never "changed" to
 * itself. The reason always goes.
 */
export const toTenantPatch = (
  values: TenantEditFormValues,
  initial: TenantEditFormValues
): AdminTenantPatch => {
  const patch: {
    reason: string;
    planId?: string;
    status?: 'active' | 'suspended';
    overrides?: { maxUsers: number | null; storageMb: number | null };
  } = { reason: values.reason.trim() };
  if (values.planId && values.planId !== initial.planId) patch.planId = values.planId;
  if (values.status !== initial.status) patch.status = values.status;
  if (
    values.maxUsers.trim() !== initial.maxUsers.trim() ||
    values.storageMb.trim() !== initial.storageMb.trim()
  ) {
    patch.overrides = {
      maxUsers: blankToNull(values.maxUsers),
      storageMb: blankToNull(values.storageMb),
    };
  }
  return patch;
};

/**
 * FR-5/FR-6 — what the support control offers: ask, wait, or enter. A consent
 * is usable only while `granted` and unexpired; the server re-checks anyway.
 */
export type SupportAction = 'request' | 'waiting' | 'enter';

export const supportAction = (access: SupportAccess | null): SupportAction => {
  if (!access) return 'request';
  if (access.status === 'granted') return 'enter';
  if (access.status === 'requested') return 'waiting';
  return 'request';
};

/** A `null` limit is unlimited. */
export const limitText = (limit: number | null, unlimited: string): string =>
  limit === null ? unlimited : String(limit);

/** Seconds → "2 min" / "45 s" for the health tiles. */
export const secondsText = (seconds: number | null): string => {
  if (seconds === null) return '—';
  if (seconds < 90) return `${seconds} s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} min`;
  return `${Math.round(seconds / 3600)} h`;
};
