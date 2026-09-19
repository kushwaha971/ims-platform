import { API_PATHS } from 'src/api/APIPaths';
import { api, ubConfig } from 'src/api/AxiosInstances';

import { PLAN_LIMIT_KEYS } from '../types/plan.types';

import type {
  PlanEntitlements,
  PlanLimit,
  PlanLimitsApiPayload,
  PlanSupportContact,
} from '../types/plan.types';

/**
 * Part 19 §19.3.4 — the service layer for PLT-15.
 *
 * There is exactly one read and no writes: FR-14 says "`planService.ts` (none
 * beyond `/auth/me`; kept for Phase 3 upgrade calls)". Entitlements are
 * evaluated server-side only (§19) and the client's copy is a HINT, cached 60 s
 * server-side, which is why EC-5 warns that the dialog may appear without a
 * prior banner. No tenant role can change its plan at MVP, so there is nothing
 * to POST.
 */

interface SessionWithPlanApiResponse {
  readonly data: {
    readonly plan_limits?: PlanLimitsApiPayload | null;
    readonly enabled_modules?: readonly string[];
  };
}

const toSupportContact = (raw: PlanLimitsApiPayload['support_contact']): PlanSupportContact => ({
  phone: raw?.phone ?? null,
  whatsapp: raw?.whatsapp ?? null,
  email: raw?.email ?? null,
  name: raw?.name ?? null,
});

/**
 * GET /auth/me — FR-5's `plan_limits` block.
 *
 * A tenant on an `unlimited` plan has `null` for every limit, and the whole
 * block is absent on a deployment that has not seeded plans yet. Both are
 * normal, not errors: absent means "nothing to show", which is what an
 * uncapped MVP deployment genuinely is.
 *
 * CR-2026-09-19-E, DOCUMENTED EXCEPTION — a whole-page failure keeps its
 * in-page error state, so this sets `suppressErrorSnackbar`, for the
 * same reason as the party list: `PlanUsageCard` is entirely this read, so a
 * failure leaves nothing on the card but the failure, and it renders that in
 * place with the request id and a Try again.
 */
export const getPlanEntitlements = async (signal?: AbortSignal): Promise<PlanEntitlements> => {
  const response = await api.get<SessionWithPlanApiResponse>(
    API_PATHS.AUTH_ME,
    ubConfig({ signal, suppressErrorSnackbar: true })
  );
  const payload = response.data.data.plan_limits ?? null;

  const limits: PlanLimit[] = [];
  PLAN_LIMIT_KEYS.forEach((key) => {
    const row = payload?.limits?.[key];
    if (!row) return;
    limits.push({
      key,
      limit: row.limit,
      used: row.used,
      periodStart: row.period_start ?? null,
      periodEnd: row.period_end ?? null,
    });
  });

  return {
    planCode: payload?.plan_code ?? null,
    limits,
    modules: payload?.modules ?? [],
    supportContact: toSupportContact(payload?.support_contact),
  };
};
