'use client';

import { memo, useCallback } from 'react';

import { Mail } from 'lucide-react';

import { UbButton, UbStatusBadge, UbText } from 'src/design-system';
import type { InvitationStatus } from 'src/types/domain.types';

import { Can } from '../../auth/components/Can';
import { statusTone } from '../view-model/invitationDisplay';

/**
 * Part 19 §19.9.4 — the cells, memoised, so that a re-render of the screen does
 * not re-render every row. Each one takes primitives rather than the row object
 * for exactly that reason: `memo` on a component that takes an object compares
 * a reference that changes whenever the list is replaced.
 *
 * None of them calls `useTranslation`; the screen resolves the copy once and
 * passes it down (`t` in a cell is a subscription per row).
 */

/**
 * The phone card's disc for somebody who has been INVITED and has no name yet
 * — every invitation row, and an invited row in the members list. Initials cut
 * from an email address read "q" for "qa-invitee@…", a lowercase letter that
 * looks like a person's initial and is not one (QA O3). One element, shared by
 * both grids, so the two lists on the Team screen say "invited" the same way.
 */
export const INVITE_AVATAR_ICON = <Mail aria-hidden className="h-4 w-4" />;

export const InvitationEmailCell = memo(function InvitationEmailCell({
  email,
}: Readonly<{ email: string }>) {
  return (
    <UbText as="span" variant="body-sm-medium" truncate>
      {email}
    </UbText>
  );
});

export const InvitationMetaCell = memo(function InvitationMetaCell({
  text,
}: Readonly<{ text: string }>) {
  return (
    <UbText as="span" variant="body-sm" tone="tertiary" truncate>
      {text}
    </UbText>
  );
});

export const InvitationStatusCell = memo(function InvitationStatusCell({
  status,
  label,
}: Readonly<{ status: InvitationStatus; label: string }>) {
  return <UbStatusBadge tone={statusTone(status)} label={label} />;
});

/**
 * The revoke control, and the FIRST place in the product where `Can` decides
 * what is painted.
 *
 * Two rules it has to get right, and they pull in opposite directions:
 *
 *  · **A missing permission HIDES the control** (§19.7.5, R-SEC-2). A disabled
 *    button invites a support call; a hidden one is simply not part of that
 *    user's product. So the gate renders nothing, not a greyed button.
 *  · **A missing SIGNAL disables it.** Offline is temporary and the affordance
 *    must come back, so `disabled` is right there and hiding would read as the
 *    product removing a feature (§19.10.4).
 *
 * A row that cannot be revoked at all — accepted, expired, already revoked —
 * renders no control rather than a disabled one, for the first reason: the act
 * does not exist for that row, it is not merely unavailable.
 */
export const InvitationRevokeCell = memo(function InvitationRevokeCell({
  id,
  revocable,
  canWrite,
  label,
  offlineTitle,
  onRevoke,
}: Readonly<{
  id: string;
  revocable: boolean;
  canWrite: boolean;
  label: string;
  offlineTitle: string;
  onRevoke: (id: string) => void;
}>) {
  const handleClick = useCallback(() => onRevoke(id), [id, onRevoke]);

  if (!revocable) return null;

  return (
    <Can permission="platform.members.manage">
      <UbButton
        variant="ghost"
        size="sm"
        onClick={handleClick}
        disabled={!canWrite}
        title={canWrite ? undefined : offlineTitle}
      >
        {label}
      </UbButton>
    </Can>
  );
});
