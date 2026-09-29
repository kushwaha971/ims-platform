import type { ApiErrorShape } from 'src/types/api.types';

import type { ModuleRefusal, ModuleRefusalLine } from '../types/settings.types';

/**
 * A12 (PLT-X10 §2, R14) — what a 409 `module_has_data` says is still open.
 *
 * `details.breakdown` is `[{label_id, count}]`, one row per open-record
 * counter, summing to `details.count`. `label_id` is a catalogue key taking
 * `{count}` ("library.off.copiesOut"), or null for the counters registered
 * before labels existed. A server that sends no breakdown (or a malformed
 * row) yields nothing specific rather than a raw object on screen; the
 * snackbar still carries the server's own message either way.
 */
export const moduleRefusalFrom = (
  error: ApiErrorShape | null | undefined
): ModuleRefusal | null => {
  if (!error || error.code !== 'module_has_data') return null;
  const details = (error.details ?? {}) as Record<string, unknown>;
  const moduleCode = details.module;
  const breakdown = details.breakdown;
  if (typeof moduleCode !== 'string' || !Array.isArray(breakdown)) return null;
  const lines: ModuleRefusalLine[] = [];
  for (const row of breakdown) {
    if (!row || typeof row !== 'object') continue;
    const { label_id: labelId, count } = row as { label_id?: unknown; count?: unknown };
    if (typeof count !== 'number' || !Number.isFinite(count)) continue;
    lines.push({ labelId: typeof labelId === 'string' ? labelId : null, count });
  }
  return lines.length ? { module: moduleCode, lines } : null;
};
