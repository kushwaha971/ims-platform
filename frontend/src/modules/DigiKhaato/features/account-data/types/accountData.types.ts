/** PLT-10 / PLT-14 (owner side) — the "Your data" page's shapes, camelCase. */

export type ExportStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'expired';

export interface TenantExport {
  readonly id: string;
  readonly status: ExportStatus;
  readonly requestedAt: string;
  readonly finishedAt: string | null;
  readonly expiresAt: string | null;
  readonly sizeBytes: number | null;
  readonly rowCounts: Readonly<Record<string, number>>;
  /** Absolute, ready for a download link; null unless `succeeded`. */
  readonly downloadUrl: string | null;
  readonly requestedBy: string | null;
}

export interface DeletionState {
  readonly status: string;
  readonly deletionRequestedAt: string | null;
  readonly scheduledFor: string | null;
  readonly coolOffDays: number;
  readonly exportFresh: boolean;
  readonly latestExport: TenantExport | null;
  readonly businessName: string;
}

export type SupportAccessStatus = 'requested' | 'granted' | 'denied' | 'revoked' | 'expired';
export type SupportDecision = 'allow' | 'deny' | 'revoke';

export interface SupportAccess {
  readonly id: string;
  readonly status: SupportAccessStatus;
  readonly reason: string;
  readonly requestedBy: string | null;
  readonly requestedAt: string;
  readonly decidedBy: string | null;
  readonly decidedAt: string | null;
  readonly expiresAt: string | null;
  readonly activeSessionEndsAt: string | null;
}

export interface DeleteRequestInput {
  readonly password: string;
  readonly confirmName: string;
  readonly reason: string;
}

// ── Wire shapes ──────────────────────────────────────────────────────────────

export interface TenantExportApi {
  readonly id: string;
  readonly status: ExportStatus;
  readonly requested_at: string;
  readonly finished_at: string | null;
  readonly expires_at: string | null;
  readonly size_bytes: number | null;
  readonly row_counts?: Readonly<Record<string, number>>;
  readonly download_url: string | null;
  readonly requested_by: { readonly id: string; readonly name: string } | null;
}

export interface DeletionStateApi {
  readonly status: string;
  readonly deletion_requested_at: string | null;
  readonly scheduled_for: string | null;
  readonly cool_off_days: number;
  readonly export_fresh: boolean;
  readonly latest_export: TenantExportApi | null;
  readonly business_name: string;
}

export interface SupportAccessApi {
  readonly id: string;
  readonly status: SupportAccessStatus;
  readonly reason: string;
  readonly requested_by: { readonly name: string } | null;
  readonly requested_at: string;
  readonly decided_by: { readonly name: string } | null;
  readonly decided_at: string | null;
  readonly expires_at: string | null;
  readonly active_session: { readonly expires_at: string } | null;
}
