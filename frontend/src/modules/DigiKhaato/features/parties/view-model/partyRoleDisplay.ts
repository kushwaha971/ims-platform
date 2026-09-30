import { loadedMessage } from 'src/utils/loadedMessage';

import type { PartyOpenRecords, PartyRoleBadge } from '../types/party.types';

type Translate = (id: string, values?: Record<string, string | number | Date>) => string;

/**
 * A6 (PLT-X04 §8) — the words for roles, relations and a module's archive
 * refusal. A module's `label_id` lives in the module's own catalogue, which a
 * screen may not have loaded; `loadedMessage` never lets a raw id through, and
 * every fallback is a WHOLE sentence rather than a word spliced into one (the
 * A9b lesson).
 *
 * Convention for verticals: a role's `label_id` is an ICU plural on `{count}`
 * — `"{count, plural, one {Member} other {Members}}"` — so the list's chip
 * ("Members") and the khata's badge ("Member") are one key.
 */

/** `nav.module.<code>` when that module's name is loaded here, else null. */
export const moduleName = (t: Translate, module: string): string | null =>
  loadedMessage(t, `nav.module.${module}`);

/** The chip on the list: plural, the module's own word. */
export const roleChipLabel = (t: Translate, role: PartyRoleBadge): string =>
  loadedMessage(t, role.labelId, { count: 2 }) ??
  moduleName(t, role.module) ??
  t('parties.role.generic');

/**
 * The badge on a khata: singular, or `null` when neither the role's word nor its
 * module's name is loaded here — a badge reading just "Role" tells the merchant
 * nothing (look pass), so the caller draws none. The chip keeps its fallback,
 * because a chip is a control and must stay reachable.
 */
export const roleBadgeLabel = (t: Translate, role: PartyRoleBadge): string | null =>
  loadedMessage(t, role.labelId, { count: 1 }) ?? moduleName(t, role.module);

/**
 * 409 `party_has_open_records` as the sentence the merchant reads: the
 * module's own ("Gym has 1 active membership for Rahul. End it first."), else a
 * generic one that still carries the number — a merchant is never told "not
 * allowed" without it (§8).
 */
export const openRecordsMessage = (t: Translate, block: PartyOpenRecords, name: string): string => {
  const own = loadedMessage(t, block.labelId, { count: block.count, name });
  if (own) return own;
  const named = moduleName(t, block.module);
  return named
    ? t('parties.archive.openRecords.body', { count: block.count, module: named, name })
    : t('parties.archive.openRecords.bodyGeneric', { count: block.count, name });
};
