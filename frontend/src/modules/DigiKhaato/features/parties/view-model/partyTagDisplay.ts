import { isUbTagColor, type UbTagListItem } from 'src/design-system';

import type { PartyTag } from '../types/party.types';

/**
 * Part 19 §19.1.1 layer 3 — the one place a wire tag becomes a drawable one.
 *
 * ── Why the colour is validated rather than passed through ──────────────────
 * `PartyTag.color` is `string | null` because that is what the wire says, and
 * the server's palette and this client's are two statements about the same
 * eight tokens that are deployed separately. A server that adds a ninth token,
 * or a row left on the hex values PTY-05 briefly stored before migration 0007,
 * would hand this code a string with no Tailwind class behind it — and an
 * unrecognised class silently renders a chip with no border at all, which
 * looks like a bug in the chip rather than a mismatch in the palette.
 *
 * So an unknown colour becomes `null`, which is a real state with a real
 * rendering: a neutral chip carrying its name, which is the only part that ever
 * mattered (R-A-2 — colour is never the only signal).
 */
export const toTagListItems = (tags: readonly PartyTag[]): readonly UbTagListItem[] =>
  tags.map((tag) => ({
    id: tag.id,
    name: tag.name,
    color: isUbTagColor(tag.color) ? tag.color : null,
  }));
