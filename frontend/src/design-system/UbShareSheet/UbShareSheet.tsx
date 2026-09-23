'use client';

import { memo, useCallback, useSyncExternalStore, type RefObject } from 'react';

import { Copy, MessageCircle, MessageSquare, Share2 } from 'lucide-react';

import { mlButtonClasses } from 'src/design-system/primitives';
import { UbButton } from 'src/design-system/UbButton';
import { UbDialog } from 'src/design-system/UbDialog';
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
 * ── "More…" only where it exists ──────────────────────────────────────────
 * `navigator.share` is on phones and some desktops and absent on others. A row
 * that throws on click is the unbuilt-feature rule broken by the platform, so
 * the row is not rendered when the API is missing or refuses the payload. The
 * check is a `useSyncExternalStore` snapshot with a `false` server snapshot, so
 * a server render and the first client render agree.
 */
export type UbShareChannel = 'whatsapp' | 'sms' | 'copy' | 'native';

export interface UbShareSheetLabels {
  readonly whatsapp: string;
  readonly sms: string;
  readonly copy: string;
  /** The platform share sheet — "More…". */
  readonly more: string;
  readonly close: string;
  /** The caption over the message preview — "Message". */
  readonly preview: string;
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
  phone,
  labels,
  onShared,
  onFailed,
  returnFocusRef,
  className,
}: Readonly<UbShareSheetProps>) {
  const nativeShare = useSyncExternalStore(
    noopSubscribe,
    () => canUseNativeShare({ title, text: message }),
    () => false
  );

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

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
    if (await copyText(message)) {
      onShared?.('copy');
      close();
    } else {
      /* The sheet stays open on a failed copy: the preview is right there and
         selectable, which is the merchant's way through. */
      onFailed?.('copy');
    }
  }, [message, onShared, onFailed, close]);

  const handleNative = useCallback(async () => {
    try {
      await navigator.share({ title, text: message });
      onShared?.('native');
      close();
    } catch (error) {
      if (!isShareAbort(error)) onFailed?.('native');
    }
  }, [title, message, onShared, onFailed, close]);

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
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <span className="ds-body-s-medium text-text-tertiary">{labels.preview}</span>
          {/* Read-only and selectable: it is also the fallback when the
              clipboard refuses. `whitespace-pre-line` keeps the message's own
              line breaks, which are part of what the customer will read. */}
          <p
            data-ub-share-preview=""
            className="ds-body-s-regular max-h-40 overflow-y-auto whitespace-pre-line break-words rounded-control bg-surface-sunken px-3 py-2 text-text-primary"
          >
            {message}
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <a
            href={buildWhatsAppUrl(message, phone)}
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
            href={buildSmsUrl(message, phone)}
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
      </div>
    </UbDialog>
  );
}

UbShareSheetBase.displayName = 'UbShareSheet';
export const UbShareSheet = memo(UbShareSheetBase);
