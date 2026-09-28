import { columnWidths, visibleColumns } from 'src/design-system/UbDataGrid';

import { createInvitationColumns } from './InvitationColumns';
import { createMemberColumns } from './MemberColumns';

/**
 * QA defect D4 (Sprint 3): on Settings → Team at 1280 and 1440 px the
 * invitations table's Revoke button did not fit its cell and was cut to
 * "Revoke …" (a table cell is `truncate`), and the column had no visible
 * header while the Members table directly above it says "Actions".
 *
 * The actions column had a weight of 8 out of 100: at 1280 px the table is
 * about 1052 px wide (1280 − the 180 px sidebar − 2 × 24 px page insets), so
 * the cell was ~84 px, and a `sm` "Revoke" needs its 2 × 12 px cell padding,
 * its own 2 × 12 px and ~50 px of words. jsdom cannot measure, so the
 * arithmetic is asserted instead, at both tiers that render a table.
 */
const t = (id: string): string => id;
const deps = { t, d: (v: string | Date) => String(v), nowMs: 0, canWrite: true, onRevoke: jest.fn() };

const TABLE_AT_1280 = 1280 - 180 - 2 * 24;
const TABLE_AT_768 = 768 - 2 * 16;
/** Cell padding + `sm` button padding + the longer of "Revoke" / "वापस लें", with room. */
const REVOKE_NEEDS_PX = 24 + 24 + 60;

const actionsPx = (tier: 'full' | 'compact', tableWidth: number): number => {
  const shown = visibleColumns(createInvitationColumns(deps), tier);
  const widths = columnWidths(shown);
  const index = shown.findIndex((column) => column.id === 'actions');
  expect(index).toBeGreaterThanOrEqual(0);
  return (parseFloat(widths[index] ?? '0') / 100) * tableWidth;
};

describe('invitations table — the actions column fits its button (D4)', () => {
  it('leaves room for Revoke in the full table at 1280 px', () => {
    expect(actionsPx('full', TABLE_AT_1280)).toBeGreaterThanOrEqual(REVOKE_NEEDS_PX);
  });

  it('leaves room for Revoke in the compact table at 768 px', () => {
    expect(actionsPx('compact', TABLE_AT_768)).toBeGreaterThanOrEqual(REVOKE_NEEDS_PX);
  });

  it('shows its "Actions" header, like the Members table above it', () => {
    const invitationActions = createInvitationColumns(deps).find((c) => c.id === 'actions');
    const memberActions = createMemberColumns({
      t,
      d: deps.d,
      nowMs: 0,
      canWrite: true,
      onRegenerate: jest.fn(),
    }).find((c) => c.id === 'actions');

    expect(invitationActions?.headerHidden).toBeFalsy();
    expect(memberActions?.headerHidden).toBeFalsy();
    expect(invitationActions?.widthShare).toBe(memberActions?.widthShare);
  });
});
