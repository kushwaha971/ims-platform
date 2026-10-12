'use client';

import { useCallback, useMemo } from 'react';

import { Ban, KeyRound, Pencil, ShieldCheck, UserMinus } from 'lucide-react';

import { UbDialog, UbMenuList, type UbMenuListRow } from 'src/design-system';
import type { TranslateFn } from 'src/hooks/useTranslation';
import { accountDisplayName } from 'src/utils/accountIdentity';

import type { Member } from '../types/member.types';
import type { MemberActionSet } from '../view-model/memberActions';

/**
 * Owner, 12 Oct 2026 — what a manager can do to one person on the team.
 *
 * ONE sheet for the whole list, pointed at the tapped row, for the reasons
 * `EntryActionsMenu` records: a dialog per row is a portal per row, and a
 * sheet (not an anchored popover) costs this route no positioning engine and
 * cannot be mispositioned beside a row at the bottom of a phone.
 *
 * The person is named in the title, because "Ramesh Kumar" tells the owner
 * whose access they are about to change and "Member options" tells them only
 * that they tapped something. Remove is the one red row: it is the act that
 * takes a person off the team.
 */
export interface MemberActionsMenuProps {
  readonly member: Member | null;
  readonly actions: MemberActionSet;
  readonly t: TranslateFn;
  readonly onClose: () => void;
  readonly onEdit: (membershipId: string) => void;
  readonly onBlock: (membershipId: string) => void;
  readonly onUnblock: (membershipId: string) => void;
  readonly onRemove: (membershipId: string) => void;
  readonly onRegenerate: (membershipId: string) => void;
}

export function MemberActionsMenu({
  member,
  actions,
  t,
  onClose,
  onEdit,
  onBlock,
  onUnblock,
  onRemove,
  onRegenerate,
}: Readonly<MemberActionsMenuProps>): React.JSX.Element | null {
  /* Close BEFORE acting: an item that opens a dialog while this sheet is still
     mounted leaves two overlays, and Escape closes the wrong one. */
  const run = useCallback(
    (action: (membershipId: string) => void) => {
      if (!member) return;
      onClose();
      action(member.id);
    },
    [member, onClose]
  );

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) onClose();
    },
    [onClose]
  );

  const rows = useMemo<UbMenuListRow[]>(() => {
    const list: UbMenuListRow[] = [];
    if (actions.edit) {
      list.push({
        key: 'edit',
        label: t('team.member.edit.action'),
        icon: <Pencil className="h-5 w-5" />,
        onSelect: () => run(onEdit),
      });
    }
    if (actions.regenerate) {
      list.push({
        key: 'regenerate',
        label: t('team.regenerate.action'),
        icon: <KeyRound className="h-5 w-5" />,
        onSelect: () => run(onRegenerate),
      });
    }
    if (actions.unblock) {
      list.push({
        key: 'unblock',
        label: t('team.member.unblock.action'),
        caption: t('team.member.unblock.caption'),
        icon: <ShieldCheck className="h-5 w-5" />,
        onSelect: () => run(onUnblock),
      });
    }
    if (actions.block) {
      list.push({
        key: 'block',
        label: t('team.member.block.action'),
        caption: t('team.member.block.caption'),
        icon: <Ban className="h-5 w-5" />,
        onSelect: () => run(onBlock),
      });
    }
    if (actions.remove) {
      list.push({
        key: 'remove',
        label: t('team.member.remove.action'),
        icon: <UserMinus className="h-5 w-5" />,
        tone: 'danger',
        onSelect: () => run(onRemove),
      });
    }
    return list;
  }, [actions, t, run, onEdit, onRegenerate, onUnblock, onBlock, onRemove]);

  if (!member) return null;

  return (
    <UbDialog
      open
      onOpenChange={handleOpenChange}
      title={accountDisplayName({
        name: member.fullName,
        email: member.email,
        mobile: member.mobile,
      })}
      closeLabel={t('common.action.close')}
    >
      <UbMenuList rows={rows} className="-mx-6" />
    </UbDialog>
  );
}
