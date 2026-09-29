'use client';

import { memo, useCallback } from 'react';

import { KeyRound } from 'lucide-react';

import { UbButton, UbStack, UbStatusBadge, UbText } from 'src/design-system';

import { Can } from '../../auth/components/Can';

import type { MemberAccessState } from '../view-model/credentialsShare';

/**
 * Part 19 §19.9.4 — memoised cells taking primitives, never the row object:
 * `memo` on a component that takes an object compares a reference that changes
 * whenever the list is replaced, which is every refetch.
 *
 * None of them calls `useTranslation`; the screen resolves the copy once and
 * passes it down (`t` in a cell is a subscription per row).
 */

export const MemberNameCell = memo(function MemberNameCell({
  name,
  email,
}: Readonly<{ name: string; email: string }>) {
  // Name over address, both in the same cell. On a phone the card shows one
  // title, and "Ramesh Kumar" identifies a person to their employer in a way
  // that `r.kumar+shop@gmail.com` does not — but the address is what they sign
  // in with, so it is what the owner reads back when something is wrong.
  // An invited row has no name to show (the server withholds the profile of
  // somebody who has not joined), so the address is the title and is not
  // repeated underneath it.
  const title = name || email;
  return (
    <UbStack gap={0}>
      <UbText as="span" variant="body-sm-medium" truncate>
        {title}
      </UbText>
      {title !== email && (
        <UbText as="span" variant="caption" tone="tertiary" truncate>
          {email}
        </UbText>
      )}
    </UbStack>
  );
});

/**
 * A13 (PLT-X12 §7, BR-6) — the role, and for a module role the line under it:
 * what the role cannot see, or that it is inactive while its module is off.
 * The caption WRAPS rather than truncating — it is a sentence, and "Inactive
 * while Lending is o…" hides exactly the word that says why.
 */
export const MemberRoleCell = memo(function MemberRoleCell({
  label,
  caption,
  inactive,
}: Readonly<{ label: string; caption: string | null; inactive: boolean }>) {
  return (
    <UbStack gap={0}>
      <UbText as="span" variant="body-sm" tone="tertiary" truncate>
        {label}
      </UbText>
      {caption && (
        <UbText
          as="span"
          variant="caption"
          tone={inactive ? 'warning' : 'tertiary'}
          className="line-clamp-2 whitespace-normal break-words"
        >
          {caption}
        </UbText>
      )}
    </UbStack>
  );
});

export const MemberMetaCell = memo(function MemberMetaCell({ text }: Readonly<{ text: string }>) {
  return (
    <UbText as="span" variant="body-sm" tone="tertiary" truncate>
      {text}
    </UbText>
  );
});

const ACCESS_TONE: Readonly<Record<MemberAccessState, 'info' | 'success' | 'warning' | 'error'>> = {
  // Info, as the switcher shows the same state from the invitee's side: nothing
  // is wrong and there is nothing for the owner to fix — the next move is theirs.
  invited: 'info',
  active: 'success',
  // Warning, not neutral: "has not signed in yet" is a thing the owner may need
  // to act on — the password is still in a chat thread and may never have
  // arrived — and a grey badge reads as "nothing to see here".
  pending: 'warning',
  expired: 'error',
};

export const MemberAccessCell = memo(function MemberAccessCell({
  state,
  label,
}: Readonly<{ state: MemberAccessState; label: string }>) {
  return <UbStatusBadge tone={ACCESS_TONE[state]} label={label} />;
});

/**
 * The reissue control.
 *
 * Two rules pulling opposite ways, the same pair `InvitationRevokeCell` next
 * door resolves:
 *
 *  · **A missing permission HIDES it** (§19.7.5, R-SEC-2). A disabled button
 *    invites a support call; a hidden one is simply not part of that user's
 *    product.
 *  · **A missing SIGNAL disables it.** Offline is temporary and the affordance
 *    must come back; hiding would read as the product removing a feature.
 *
 * It is also **not rendered at all once the person has chosen their own
 * password**, which is not a permission question but a correctness one: the
 * server refuses that case, and a button whose only outcome is a refusal is a
 * button that teaches the merchant to distrust the screen.
 */
export const MemberRegenerateCell = memo(function MemberRegenerateCell({
  membershipId,
  label,
  canWrite,
  visible,
  onRegenerate,
}: Readonly<{
  membershipId: string;
  label: string;
  canWrite: boolean;
  visible: boolean;
  onRegenerate: (membershipId: string) => void;
}>) {
  const handleClick = useCallback(() => {
    onRegenerate(membershipId);
  }, [onRegenerate, membershipId]);

  if (!visible) return null;

  return (
    <Can permission="platform.members.manage">
      <UbButton
        variant="ghost"
        size="sm"
        onClick={handleClick}
        disabled={!canWrite}
        icon={<KeyRound aria-hidden className="h-4 w-4" />}
      >
        {label}
      </UbButton>
    </Can>
  );
});
