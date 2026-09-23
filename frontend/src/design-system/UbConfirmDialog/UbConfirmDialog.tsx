'use client';

import { memo, type RefObject } from 'react';

import { TriangleAlert } from 'lucide-react';

import { UbButton } from 'src/design-system/UbButton';
import { UbDialog } from 'src/design-system/UbDialog';

/**
 * Part 23 §23.3 — the confirm. It exists as its own component rather than as a
 * `UbDialog` usage note because the rules it enforces are exactly the ones a
 * hand-rolled confirm gets wrong:
 *
 *  - **The confirm button names the ACT**, not "OK" — "Leave business", not a
 *    word the user has to map back onto the question (PLT-04 §8).
 *  - **The consequence is the body**, in one sentence: "You will lose access
 *    until invited again."
 *  - **A destructive confirm does not dismiss on a backdrop tap**, because a
 *    stray tap on a phone is not consent.
 *  - **The destructive action is OUTLINED danger** in `--form-error`, never a
 *    filled red block (§23.5).
 */
export interface UbConfirmDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  /** The consequence, in one sentence. */
  readonly description: string;
  /** Names the act: "Leave business", "Discard changes". */
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  readonly closeLabel: string;
  readonly onConfirm: () => void;
  readonly busy?: boolean;
  readonly busyLabel?: string;
  readonly destructive?: boolean;
  /**
   * Where focus returns on close if the element that opened this is no longer
   * in the document — e.g. an item in a menu sheet that closed as it opened
   * this one (QA D1, WCAG 2.4.3). Pass the control that opened the menu.
   */
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
}

function UbConfirmDialogBase({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  closeLabel,
  onConfirm,
  busy = false,
  busyLabel,
  destructive = true,
  returnFocusRef,
}: Readonly<UbConfirmDialogProps>) {
  return (
    <UbDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      closeLabel={closeLabel}
      dismissOnBackdrop={!destructive}
      returnFocusRef={returnFocusRef}
      icon={
        destructive ? <TriangleAlert aria-hidden className="h-5 w-5 text-warning" /> : undefined
      }
      footer={
        <>
          <UbButton variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            {cancelLabel}
          </UbButton>
          <UbButton
            variant={destructive ? 'destructive' : 'primary'}
            onClick={onConfirm}
            busy={busy}
            busyLabel={busyLabel}
          >
            {confirmLabel}
          </UbButton>
        </>
      }
    />
  );
}

UbConfirmDialogBase.displayName = 'UbConfirmDialog';
export const UbConfirmDialog = memo(UbConfirmDialogBase);
