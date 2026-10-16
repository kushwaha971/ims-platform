'use client';

import { useCallback, useState } from 'react';

import { finalMessage, isBlankMessage } from 'src/design-system';
import { withWhatsAppText } from 'src/utils/share';

/**
 * WP-04 — one server-prepared message the merchant may change before it goes:
 * the draft for `UbMessageBox`, the words that will leave, and the WhatsApp
 * link to open — the server's own while nothing is changed, rebuilt from the
 * edit (to the same number) once something is, and `null` while the message is
 * blank or there is no link. An edit belongs to the message it was made on: a
 * new prepared text (the desk rewrote a custom message) starts from it again.
 */
export interface EditableMessage {
  /** The merchant's edit, or `null` while they have changed nothing. */
  readonly draft: string | null;
  readonly setDraft: (next: string | null) => void;
  /** The words that will leave. */
  readonly text: string;
  /** The WhatsApp link to open, or `null` when there is nothing to open. */
  readonly href: string | null;
}

export const useEditableMessage = (
  message: string,
  waUrl: string | null | undefined
): EditableMessage => {
  const [edit, setEdit] = useState<{ source: string; text: string | null }>({
    source: message,
    text: null,
  });
  if (edit.source !== message) setEdit({ source: message, text: null });
  const draft = edit.source === message ? edit.text : null;
  const setDraft = useCallback(
    (next: string | null) => setEdit((current) => ({ ...current, text: next })),
    []
  );
  const text = finalMessage(message, draft);
  const href =
    !waUrl || isBlankMessage(text)
      ? null
      : draft !== null && draft !== message
        ? withWhatsAppText(waUrl, text)
        : waUrl;
  return { draft, setDraft, text, href };
};
