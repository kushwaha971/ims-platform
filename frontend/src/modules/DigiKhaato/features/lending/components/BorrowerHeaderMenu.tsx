'use client';

import { useCallback, useState, type Ref } from 'react';

import { Ban, CircleCheck, MoreHorizontal, Pencil } from 'lucide-react';

import { CompactDialog } from 'src/components/records/CompactOverlays';
import { UbButton, UbStack } from 'src/design-system';
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
  const [open, setOpen] = useState(false);

  /* Close the sheet BEFORE opening the next overlay, or Escape closes the
     wrong one (the khata menu's finding). */
  const run = useCallback((action?: () => void) => {
    setOpen(false);
    action?.();
  }, []);

  const items = [
    { key: 'edit', label: t('lending.borrower.edit.action'), icon: Pencil, action: onEdit },
    { key: 'block', label: t('lending.borrower.block.action'), icon: Ban, action: onBlock },
    {
      key: 'unblock',
      label: t('lending.borrower.unblock.action'),
      icon: CircleCheck,
      action: onUnblock,
    },
  ].filter((item) => item.action !== undefined);

  if (items.length === 0) return null;

  return (
    <>
      <UbButton
        ref={triggerRef}
        variant="outlineNeutral"
        icon={<MoreHorizontal className="h-4 w-4" aria-hidden />}
        iconOnly="mobile"
        className="max-sm:h-10 max-sm:w-10"
        aria-label={t('lending.borrower.menu.moreActions')}
        onClick={() => setOpen(true)}
        data-testid="lending-borrower-menu"
      >
        {t('lending.borrower.menu.more')}
      </UbButton>
      <CompactDialog
        open={open}
        onOpenChange={setOpen}
        title={t('lending.borrower.menu.moreActions')}
        closeLabel={t('common.action.close')}
      >
        <UbStack gap={1}>
          {items.map((item) => (
            <UbButton
              key={item.key}
              variant="ghost"
              fullWidth
              className="justify-start"
              icon={<item.icon className="h-4 w-4" aria-hidden />}
              onClick={() => run(item.action)}
              data-testid={`lending-borrower-${item.key}`}
            >
              {item.label}
            </UbButton>
          ))}
        </UbStack>
      </CompactDialog>
    </>
  );
}
