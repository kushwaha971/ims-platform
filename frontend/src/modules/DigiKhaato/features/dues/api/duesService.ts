import { API_PATHS } from 'src/api/APIPaths';
import { api, ubConfig } from 'src/api/AxiosInstances';
import { toQueryString } from 'src/utils/queryString';

import type {
  BackdatedConfirmation,
  Due,
  DueComponentAmount,
  DueFilters,
  DueParty,
  DuePreview,
  DuesPage,
  DueSubject,
  Schedule,
} from '../types/dues.types';

/**
 * DUE-01 (FRD 00 DUE-01 §6) — the engine's two READ endpoints. There are no
 * writes here and never will be (ADR-041): starting a membership, a loan or an
 * enrolment is the vertical's endpoint, which the vertical's own thunk calls.
 */
type Wire = Record<string, unknown>;

const s = (value: unknown): string => (typeof value === 'string' ? value : '');
const sn = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const n = (value: unknown): number => (typeof value === 'number' ? value : 0);

const toParty = (value: unknown): DueParty | null => {
  if (!value || typeof value !== 'object') return null;
  const row = value as Wire;
  return { id: s(row.id), name: s(row.name) };
};

const toSubject = (value: unknown): DueSubject => {
  const row = (value ?? {}) as Wire;
  return { type: s(row.type), id: s(row.id), label: sn(row.label) };
};

const toComponents = (value: unknown): readonly DueComponentAmount[] | undefined =>
  Array.isArray(value)
    ? (value as Wire[]).map((c) => ({
        component: s(c.component) as DueComponentAmount['component'],
        amount: s(c.amount),
      }))
    : undefined;

export const toDuePreview = (row: Wire): DuePreview => {
  const components = toComponents(row.components);
  return {
    seq: n(row.seq),
    periodStart: s(row.period_start),
    periodEnd: s(row.period_end),
    periodLabel: s(row.period_label),
    dueOn: s(row.due_on),
    amount: s(row.amount),
    status: s(row.status) === 'skipped' ? 'skipped' : 'scheduled',
    ...(components ? { components } : {}),
  };
};

/** The `details` of a 409 `schedule_backdated_unconfirmed`, for the confirm dialog. */
export const toBackdatedConfirmation = (details: unknown): BackdatedConfirmation => {
  const row = (details ?? {}) as Wire;
  return {
    dues: ((row.dues as Wire[] | undefined) ?? []).map(toDuePreview),
    total: s(row.total),
  };
};

export const toDue = (row: Wire): Due => {
  const document = row.document as Wire | null | undefined;
  return {
    id: s(row.id),
    scheduleId: s(row.schedule_id),
    module: s(row.module),
    subject: toSubject(row.subject),
    party: toParty(row.party),
    seq: n(row.seq),
    periodLabel: s(row.period_label),
    dueOn: s(row.due_on),
    amount: s(row.amount),
    penaltyAmount: s(row.penalty_amount),
    waivedAmount: s(row.waived_amount),
    settledAmount: s(row.settled_amount),
    outstanding: s(row.outstanding),
    status: s(row.status) as Due['status'],
    paidOn: sn(row.paid_on),
    document: document ? { id: s(document.id) } : null,
  };
};

export const toSchedule = (row: Wire): Schedule => ({
  id: s(row.id),
  module: s(row.module),
  plan: {
    id: s((row.plan as Wire | undefined)?.id),
    name: s((row.plan as Wire | undefined)?.name),
  },
  party: toParty(row.party),
  beneficiaryParty: toParty(row.beneficiary_party),
  subject: toSubject(row.subject),
  status: s(row.status) as Schedule['status'],
  startOn: s(row.start_on),
  endOn: sn(row.end_on),
  amount: sn(row.amount),
  graceDays: n(row.grace_days),
  version: n(row.version),
  dues: ((row.dues as Wire[] | undefined) ?? []).map(toDue),
  pauses: ((row.pauses as Wire[] | undefined) ?? []).map((p) => ({
    id: s(p.id),
    fromOn: s(p.from_on),
    toOn: s(p.to_on),
    effect: s(p.effect) === 'skip' ? 'skip' : 'shift',
    reason: s(p.reason),
    resumedOn: sn(p.resumed_on),
  })),
});

/** `GET /dues/dues` — one page, with `meta.totals` over the filtered set. */
export const listDues = async (filters: DueFilters, signal?: AbortSignal): Promise<DuesPage> => {
  const query = toQueryString({
    party_id: filters.partyId,
    module: filters.module,
    status: filters.status?.length ? filters.status.join(',') : undefined,
    due_from: filters.dueFrom,
    due_to: filters.dueTo,
    subject_type: filters.subjectType,
    subject_id: filters.subjectId,
    cursor: filters.cursor ?? undefined,
  });
  const response = await api.get<{ readonly data: readonly Wire[]; readonly meta: Wire }>(
    `${API_PATHS.DUES}${query}`,
    ubConfig({ signal })
  );
  const meta = response.data.meta ?? {};
  const totals = (meta.totals ?? {}) as Wire;
  return {
    rows: response.data.data.map(toDue),
    totals: { outstanding: s(totals.outstanding), overdue: s(totals.overdue) },
    nextCursor: sn(meta.next_cursor),
    hasMore: meta.has_more === true,
  };
};

/** `GET /dues/schedules/{id}` — the schedule with its dues and pauses. */
export const getSchedule = async (id: string, signal?: AbortSignal): Promise<Schedule> => {
  const response = await api.get<{ readonly data: Wire }>(
    API_PATHS.DUES_SCHEDULE(id),
    ubConfig({ signal })
  );
  return toSchedule(response.data.data);
};
