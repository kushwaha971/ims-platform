'use client';

import {
  memo,
  useCallback,
  useId,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from 'react';

import { Copy, MessageCircle, MessageSquare, Phone, Share2 } from 'lucide-react';

import { mlButtonClasses } from 'src/design-system/primitives';
import { UbButton } from 'src/design-system/UbButton';
import { UbDialog } from 'src/design-system/UbDialog';
import { UbTextArea } from 'src/design-system/UbTextArea';
import { copyText } from 'src/utils/clipboard';
import { cn } from 'src/utils/cn';
import { buildSmsUrl, buildWhatsAppUrl, canUseNativeShare, isShareAbort } from 'src/utils/share';

/**
 * Part 23 §23.3 / NTF-03 FR-1 — the one share surface.
 *
 * ── What it does, and what it deliberately does not claim ─────────────────
 * It hands the merchant a message and four ways to send it themselves:
 * WhatsApp, SMS, the clipboard, and the platform's own share sheet where there
 * is one. Nothing is sent by this product (DEC-012), so nothing here — and
 * nothing a caller does with `onShared` — may say "sent". `onShared('whatsapp')`
 * means WhatsApp was OPENED with the text in it; the merchant still has to
 * press send, and may not (NTF-03 BR-1).
 *
 * ── Why the two apps are LINKS, not buttons that call `window.open` ───────
 * NTF-03 FR-13's fallback — "render the `wa_url` as a real `<a target=_blank>`
 * the user taps directly" — is simply the primary path here. A real anchor
 * cannot be popup-blocked (in-app browsers and PWA standalone mode block
 * `window.open`), it survives a long-press "open in new tab", and `sms:` is a
 * scheme the OS hands to the messaging app, which is exactly what an anchor
 * is for. The sheet closes on the NEXT tick rather than inside the click, so
 * the anchor is still in the document when the browser follows it.
 *
 * ── Why a dialog and not an anchored popover ──────────────────────────────
 * The same finding `PartyHeaderMenu` records: `@radix-ui/react-popover` cost
 * the khata route +10.9 KB and the bundle gate refused it. `UbDialog` is
 * hand-rolled on `createPortal`, is already on every route that shares, and is
 * a bottom sheet on a phone — which is what a share sheet is on a phone.
 *
 * ── Why the design system does not raise the toast itself ─────────────────
 * The design system never reads Redux (eslint `import/no-restricted-paths`), so
 * outcomes are reported through `onShared` / `onFailed` and the caller routes
 * them to the global snackbar — `useShareFeedback` does that in one line.
 *
 * ── The merchant edits the words (MSG-01..05, WP-04) ──────────────────────
 * `message` is the DEFAULT, not the final text. It sits in an editable box,
 * and every channel — WhatsApp, SMS, copy, More… — carries exactly what the box
 * holds, so the preview and what is sent cannot differ. While nothing has been
 * typed the box follows the default (a refetch may improve it); once the
 * merchant types, a refetch never replaces their words, and "Reset to default"
 * is the deliberate way back. A new opening or a different recipient starts
 * from the default again: one person's message must never reach another's
 * chat. An empty or whitespace-only message opens nothing and says why. The
 * edit lives in memory only — nothing about it is stored.
 *
 * ── "More…" only where it exists ──────────────────────────────────────────
 * `navigator.share` is on phones and some desktops and absent on others. A row
 * that throws on click is the unbuilt-feature rule broken by the platform, so
 * the row is not rendered when the API is missing or refuses the payload. The
 * check is a `useSyncExternalStore` snapshot with a `false` server snapshot, so
 * a server render and the first client render agree.
 */
export type UbShareChannel = 'whatsapp' | 'sms' | 'copy' | 'native' | 'call';

export interface UbShareSheetLabels {
  readonly whatsapp: string;
  readonly sms: string;
  readonly copy: string;
  /** The platform share sheet — "More…". */
  readonly more: string;
  readonly close: string;
  /** The caption over the message preview — "Message". */
  readonly preview: string;
  /** The dial row, drawn only when `callHref` is given (LED-06 FR-4). */
  readonly call?: string;
  /** Puts the default text back after an edit — "Reset to default". */
  readonly reset: string;
  /** Why the channels are off while the message is blank. */
  readonly empty: string;
}

export interface UbShareSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  /**
   * Who it goes to, in words — "To Ramesh Traders · +91 98123 45678". NTF-03
   * §8: the recipient is visible BEFORE the action, so a wrong number is caught
   * before WhatsApp opens rather than after.
   */
  readonly description?: string;
  /** Exactly what will be put in front of the customer; shown as a preview. */
  readonly message: string;
  /**
   * The SMS link's text when it differs from the WhatsApp message — an SMS is
   * billed per segment, so the reminder's SMS words are shorter (LED-06 §17).
   * Absent means the same text goes both ways.
   */
  readonly smsMessage?: string;
  /**
   * Something the merchant should read before they send — "You reminded
   * Ramesh yesterday" (LED-06 FR-10). Rendered above the preview.
   */
  readonly notice?: ReactNode;
  /** A `tel:` href; when present a Call row is drawn under SMS (LED-06 FR-4). */
  readonly callHref?: string | null;
  /**
   * Drawn INSTEAD of the preview and the channels while the message is not
   * ready — a skeleton while the server composes it, an error with Try again.
   * The same dialog stays mounted across the swap, so focus and the return
   * target survive it (QA D1).
   */
  readonly pending?: ReactNode;
  /** Any spelling; normalised by `toWhatsAppDigits`. Absent → pick the chat. */
  readonly phone?: string | null;
  readonly labels: UbShareSheetLabels;
  /** A channel was opened (or the text copied). Never evidence of delivery. */
  readonly onShared?: (channel: UbShareChannel) => void;
  /** The clipboard refused, or the platform sheet failed for a reason other than dismissal. */
  readonly onFailed?: (channel: UbShareChannel) => void;
  /**
   * Where focus returns on close if the element that opened this is no longer
   * in the document — e.g. an item in a menu sheet that closed as it opened
   * this one (QA D1, WCAG 2.4.3). Pass the control that opened the menu.
   */
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
  readonly className?: string;
}

const noopSubscribe = (): (() => void) => () => undefined;

/** 44 px rows (LED-06 §5: channel buttons ≥ 44 px, labelled), icon then words. */
const ROW = 'w-full justify-start';

function UbShareSheetBase({
  open,
  onOpenChange,
  title,
  description,
  message,
  smsMessage,
  notice,
  callHref,
  pending,
  phone,
  labels,
  onShared,
  onFailed,
  returnFocusRef,
  className,
}: Readonly<UbShareSheetProps>) {
  /* `null` = untouched, so the box follows the default. The edit belongs to one
     opening for one recipient; adjusting state during render (not in an effect)
     means the old words are never drawn against the new recipient. */
  const session = open ? (phone ?? '') : null;
  const [edit, setEdit] = useState<{ session: string | null; text: string | null }>({
    session,
    text: null,
  });
  if (edit.session !== session) setEdit({ session, text: null });
  const draft = edit.session === session ? edit.text : null;
  const text = draft ?? message;
  const smsText = draft ?? smsMessage ?? message;
  const blank = text.trim() === '';
  const setDraft = useCallback(
    (next: string | null) => setEdit((current) => ({ ...current, text: next })),
    []
  );

  const nativeShare = useSyncExternalStore(
    noopSubscribe,
    () => canUseNativeShare({ title, text }),
    () => false
  );

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  const boxId = useId();

  /* The anchor's own default action opens the app; this only reports it and
     closes the sheet once the browser has followed the link. */
  const openedVia = useCallback(
    (channel: UbShareChannel) => () => {
      onShared?.(channel);
      window.setTimeout(close, 0);
    },
    [onShared, close]
  );

  const handleCopy = useCallback(async () => {
    if (await copyText(text)) {
      onShared?.('copy');
      close();
    } else {
      /* The sheet stays open on a failed copy: the preview is right there and
         selectable, which is the merchant's way through. */
      onFailed?.('copy');
    }
  }, [text, onShared, onFailed, close]);

  const handleNative = useCallback(async () => {
    try {
      await navigator.share({ title, text });
      onShared?.('native');
      close();
    } catch (error) {
      if (!isShareAbort(error)) onFailed?.('native');
    }
  }, [title, text, onShared, onFailed, close]);

  /* A call needs no text, so it stays offered while the message is blank. */
  const callRow =
    callHref && labels.call ? (
      <a
        href={callHref}
        onClick={openedVia('call')}
        className={mlButtonClasses(
          'ghost',
          'lg',
          cn(ROW, 'outline-none focus-visible:shadow-focus')
        )}
      >
        <Phone aria-hidden className="h-4 w-4" />
        <span>{labels.call}</span>
      </a>
    ) : null;

  return (
    <UbDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      closeLabel={labels.close}
      returnFocusRef={returnFocusRef}
      className={className}
    >
      {pending ? (
        <div className="flex flex-col gap-4">{pending}</div>
      ) : (
        <div className="flex flex-col gap-4">
          {notice}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={boxId} className="ds-body-s-medium text-text-tertiary">
                {labels.preview}
              </label>
              {draft !== null && draft !== message && (
                <UbButton variant="ghost" size="sm" onClick={() => setDraft(null)}>
                  {labels.reset}
                </UbButton>
              )}
            </div>
            {/* The final text, editable. It is also the fallback when the
              clipboard refuses: the merchant can select it by hand. */}
            <UbTextArea
              id={boxId}
              data-ub-share-preview=""
              value={text}
              onChange={setDraft}
              rows={5}
              invalid={blank}
              aria-describedby={blank ? `${boxId}-empty` : undefined}
            />
            {blank && (
              <p id={`${boxId}-empty`} role="alert" className="ds-body-s-regular text-formError">
                {labels.empty}
              </p>
            )}
          </div>

          {blank ? (
            <div className="flex flex-col gap-1">
              <UbButton
                variant="primary"
                size="lg"
                className="w-full"
                disabled
                icon={<MessageCircle aria-hidden className="h-4 w-4" />}
              >
                {labels.whatsapp}
              </UbButton>
              <UbButton
                variant="ghost"
                size="lg"
                className={ROW}
                disabled
                icon={<MessageSquare aria-hidden className="h-4 w-4" />}
              >
                {labels.sms}
              </UbButton>
              {callRow}
              <UbButton
                variant="ghost"
                size="lg"
                className={ROW}
                disabled
                icon={<Copy aria-hidden className="h-4 w-4" />}
              >
                {labels.copy}
              </UbButton>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <a
                href={buildWhatsAppUrl(text, phone)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={openedVia('whatsapp')}
                className={mlButtonClasses(
                  'primary',
                  'lg',
                  'w-full outline-none focus-visible:shadow-focus'
                )}
              >
                <MessageCircle aria-hidden className="h-4 w-4" />
                <span>{labels.whatsapp}</span>
              </a>
              <a
                href={buildSmsUrl(smsText, phone)}
                onClick={openedVia('sms')}
                className={mlButtonClasses(
                  'ghost',
                  'lg',
                  cn(ROW, 'outline-none focus-visible:shadow-focus')
                )}
              >
                <MessageSquare aria-hidden className="h-4 w-4" />
                <span>{labels.sms}</span>
              </a>
              {callRow}
              <UbButton
                variant="ghost"
                size="lg"
                className={ROW}
                icon={<Copy aria-hidden className="h-4 w-4" />}
                onClick={() => void handleCopy()}
              >
                {labels.copy}
              </UbButton>
              {nativeShare && (
                <UbButton
                  variant="ghost"
                  size="lg"
                  className={ROW}
                  icon={<Share2 aria-hidden className="h-4 w-4" />}
                  onClick={() => void handleNative()}
                >
                  {labels.more}
                </UbButton>
              )}
            </div>
          )}
        </div>
      )}
    </UbDialog>
  );
}

UbShareSheetBase.displayName = 'UbShareSheet';
export const UbShareSheet = memo(UbShareSheetBase);
