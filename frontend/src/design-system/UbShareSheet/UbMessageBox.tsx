'use client';

import { memo, useId } from 'react';

import { UbButton } from 'src/design-system/UbButton';
import { UbTextArea } from 'src/design-system/UbTextArea';

/**
 * WP-04 — the editable message box: the words a merchant is about to send,
 * a "Use the original message" button once they have changed them, and the
 * line that says why nothing opens while the box is blank.
 *
 * It is the part of `UbShareSheet` that "Remind all" also needs (MSG-07), so
 * it is one component rather than a second copy of the same rules. It holds
 * no state: `draft` is `null` while the merchant has typed nothing, and then
 * the box shows `message` — the default — and follows it if it changes.
 */
export interface UbMessageBoxLabels {
  /** The caption over the box — "Message". */
  readonly preview: string;
  /** Puts the default text back after an edit. */
  readonly reset: string;
  /** Why the channels are off while the message is blank. */
  readonly empty: string;
}

export interface UbMessageBoxProps {
  /** The default words. */
  readonly message: string;
  /** The merchant's edit, or `null` for "unchanged". */
  readonly draft: string | null;
  readonly onDraftChange: (next: string | null) => void;
  readonly labels: UbMessageBoxLabels;
  readonly rows?: number;
}

/** The words that will go: the edit, or the default when there is none. */
export const finalMessage = (message: string, draft: string | null): string => draft ?? message;

/** A message with nothing but spaces in it opens no channel. */
export const isBlankMessage = (text: string): boolean => text.trim() === '';

function UbMessageBoxBase({
  message,
  draft,
  onDraftChange,
  labels,
  rows = 5,
}: Readonly<UbMessageBoxProps>) {
  const boxId = useId();
  const text = finalMessage(message, draft);
  const blank = isBlankMessage(text);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={boxId} className="ds-body-s-medium text-text-tertiary">
          {labels.preview}
        </label>
        {draft !== null && draft !== message && (
          <UbButton variant="ghost" size="sm" onClick={() => onDraftChange(null)}>
            {labels.reset}
          </UbButton>
        )}
      </div>
      {/* The final text, editable. It is also the fallback when the clipboard
          refuses: the merchant can select it by hand. */}
      <UbTextArea
        id={boxId}
        data-ub-share-preview=""
        value={text}
        onChange={onDraftChange}
        rows={rows}
        invalid={blank}
        aria-describedby={blank ? `${boxId}-empty` : undefined}
      />
      {blank && (
        <p id={`${boxId}-empty`} role="alert" className="ds-body-s-regular text-formError">
          {labels.empty}
        </p>
      )}
    </div>
  );
}

UbMessageBoxBase.displayName = 'UbMessageBox';
export const UbMessageBox = memo(UbMessageBoxBase);
