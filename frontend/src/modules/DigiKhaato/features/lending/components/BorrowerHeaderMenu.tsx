'use client';

import { type Ref } from 'react';

import { Ban, CircleCheck, Pencil } from 'lucide-react';

import { COMPACT_OVERLAY_CLASSNAME } from 'src/components/records/CompactOverlays';
import { UbMoreActions } from 'src/design-system';
import type { TranslateFn } from 'src/hooks/useTranslation';

/**
 * The borrower page's ⋯ (owner, 12 Oct 2026): Edit, and Block or Unblock.
 *
 * The khata page's pattern (`parties/components/PartyHeaderMenu.tsx`) for the
 * reasons it gives there: one menu at every width, so the header row never
 * runs off a 360 px phone as actions are added; a sheet built on `UbDialog`
 * rather than an anchored popover, which would pull a positioning engine into
 * this route for three buttons; and "+ Loan" stays OUT of it, because giving a
 * loan is why a lender opens this page and editing a phone number is not.
 *
 * The page passes an item only when the viewer may use it (owner or admin,
 * §19.7.5: hidden, not disabled). With nothing to offer there is no ⋯ at all.
 * The ⋯ and its sheet are `UbMoreActions`, which owns closing the sheet before
 * a row opens its drawer (WP-03 D-04a).
 */
export interface BorrowerHeaderMenuProps {
  readonly t: TranslateFn;
  readonly onEdit?: () => void;
  /** Exactly one of these two is passed: the borrower is either active or blocked. */
  readonly onBlock?: () => void;
  readonly onUnblock?: () => void;
  /** For the dialogs this menu opens, as their `returnFocusRef` (WCAG 2.4.3). */
  readonly triggerRef?: Ref<HTMLButtonElement>;
}

export function BorrowerHeaderMenu({
  t,
  onEdit,
  onBlock,
  onUnblock,
  triggerRef,
}: Readonly<BorrowerHeaderMenuProps>): React.JSX.Element | null {
  return (
    <UbMoreActions
      label={t('lending.borrower.menu.more')}
      title={t('lending.borrower.menu.moreActions')}
      closeLabel={t('common.action.close')}
      triggerRef={triggerRef}
      className="max-sm:h-10 max-sm:w-10"
      sheetClassName={COMPACT_OVERLAY_CLASSNAME}
      testId="lending-borrower-menu"
      rows={[
        {
          key: 'edit',
          label: t('lending.borrower.edit.action'),
          icon: <Pencil className="h-5 w-5" />,
          onSelect: onEdit,
          testId: 'lending-borrower-edit',
        },
        {
          key: 'block',
          label: t('lending.borrower.block.action'),
          icon: <Ban className="h-5 w-5" />,
          onSelect: onBlock,
          testId: 'lending-borrower-block',
        },
        {
          key: 'unblock',
          label: t('lending.borrower.unblock.action'),
          icon: <CircleCheck className="h-5 w-5" />,
          onSelect: onUnblock,
          testId: 'lending-borrower-unblock',
        },
      ]}
    />
  );
}
