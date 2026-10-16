# WP-04 outgoing message inventory

First pass, 16 October 2026 (cloud session). This is the MSG-01 coverage list required by [05-editable-messages-and-reminders.md](05-editable-messages-and-reminders.md): every place the product prepares text for a merchant to send. A path not listed here is not covered.

## How it was searched

`frontend/src` was searched for:

- `UbShareSheet`;
- `buildWhatsAppUrl` / `buildSmsUrl`;
- `waUrl` / `wa_url` / `smsUrl` and `navigator.share`;
- `window.open`;
- message text areas.

`backend/apps` was searched for `wa_url`, preview/prepare/send services and `notifications`.

## The shared composer

`UbShareSheet` (`src/design-system/UbShareSheet`) is now the editable composer for client-built messages (MSG-02..05). It works like this:

- The default text sits in an editable box, and WhatsApp, SMS, Copy and More… all carry exactly what the box holds.
- A refetch never replaces typed words; "Use the original message" restores the default.
- A new opening or a different recipient starts from the default again.
- A blank message opens no channel and says why.
- The edit is kept in memory only.

Its words come from `useShareSheetLabels()`. The box itself is `UbMessageBox` (same folder), so a flow that is not a sheet — "Remind all" — uses the same rules rather than a copy. `onShared(channel, text)` hands the caller the words that left with each channel, so the caller can record them (MSG-10). A source-scan guard in `src/tests/sharedOwners.test.ts` forbids `window.open(buildWhatsAppUrl…)`.

The Lending and Library dialogs are server-prepared composers. The server returns `wa_url` built from the edited text, and the tap is recorded. They were already editable and stay the reference for server-recorded messages.

## Inventory

Channel: W = WhatsApp handoff, S = device SMS, C = copy, N = platform share, T = call. "Editable" means the final text can be changed before the channel opens.

| # | App | Trigger | Channels | Text owner | Recipient | Editable | Recorded on server | Status / evidence |
|---|---|---|---|---|---|---|---|---|
| M-01 | Udhaar / Shop customers | Khata "Remind" (`usePartyReminder` → `PartyReminderSheet`) | W S T C N | Server preview (`ledger/services/reminders.preview_reminder`) | Party mobile | **Yes**, since WP-04 (shared composer) | **Yes, the final text** (MSG-10): `/reminders/{id}/send {text}` logs the words that left and builds the returned link from them | `test_reminder_final_text.py` (failed before: the log kept the template); `PartyDetailPageContent.test.tsx` "records the words the merchant actually sent"; browser `e2e/share-composer-look.mjs` |
| M-02 | Shop / Lending / Library | Record reminder (`SourceReminderSheet`) | W S T C N | Server source preview | Document party or guardian | **Yes**, since WP-04 | **Yes, the final text** (MSG-10), same field | `test_module_reminders.py::test_a_record_reminder_logs_the_words_the_merchant_sent`; `ModuleReminders.test.tsx` |
| M-03 | Shop / Payments | Receipt share (`PaymentReceiptPageContent`) | W S C N | Client (`receipt.shareText`) | Payment party | **Yes**, since WP-04 | Not recorded | Composer tests |
| M-04 | Shop sales | Invoice, estimate, order and challan "Share on WhatsApp" (`useInvoiceDetail`) | W S C N | Client `shareText`, with the live share link minted first | Party or walk-in mobile | **Yes**, since WP-04. Before, it opened WhatsApp with fixed text through `window.open` after a request, which phones and in-app browsers block. | The share link is recorded, the text is not | `useInvoiceDetail.share.test.tsx` failed before (pop-up and no composer) and passes after |
| M-05 | Shop sales | "Copy link" | C (link only) | n/a (URL) | n/a | Not applicable: no prose | Link minted | Unchanged |
| M-06 | Udhaar / Shop | "Remind all" bulk (`BulkReminderDialog`) | W, one tap per party | Server (`bulk_reminders` → text, `wa_url` and now `mobile` per party) | Each party | **Yes**, per customer, since WP-04 (MSG-07/08): each step shows that customer's words in `UbMessageBox`; an edit rebuilds the link from the edit and the number; a blank message offers no link; the next customer starts from their own default | Scheduled row per party; the tap sends the final words to `/send`, which logs them | `RemindersPageContent.test.tsx` "Remind all with the merchant's own words" (failed before); `test_reminder_final_text.py` bulk case. Not built: one shared edit applied to everyone at once (the per-customer edit covers the need for now; a shop-wide template editor is not built). |
| M-07 | Lending | Borrower reminder / receipt (`lending/MessageDialog`) | W S T | Server (`lending/services/messages`) with `text` | Borrower | **Yes** (reference) | Recorded with text | Existing `MessageDialog.test.tsx` |
| M-08 | Library | Member fee / receipt / custom message (`library/MessageDialog`) | W | Server (`fee_messages.preview/send`, `custom_body`) | Member or guardian | **Yes** | Recorded | Existing tests |
| M-09 | Library | Bulk fee message (`BulkMessageDrawer`) | W, one tap per member | Server `bulk_prepare` with shared text | Audience | **Yes**, one shared text; no per-member override | Recorded per tap | MSG-07 per-recipient override not built |
| M-10 | Library | Counter slip after issue (`CounterPrompts` → `FinishDialog`) | W | Server slip text | Member | **Yes**, since WP-04: the slip sits in `UbMessageBox` and the link is built from what it holds; blank offers no link | Not recorded (a share, not a reminder, by the server's design) | `FinishDialog.test.tsx` (failed before); browser `e2e/library-slip-look.mjs` 22/22 at 360/1280 px |
| M-11 | Payments | UPI pay-link share (`UpiPayQrDialog`) | N (image + text), C | Client `payLink.shareText` | Chosen in the OS sheet | **Yes**, since WP-04: the words under the QR are editable and Share hands the phone exactly them; blank disables Share (Copy link carries only the link and stays) | Link recorded | `UpiPayQrDialog.test.tsx` (failed before); browser `e2e/paylink.mjs` at 390 px |
| M-12 | Shop suppliers | Payment confirmation, payable follow-up, purchase/return document share | — | — | — | Not built | — | **Not built**: no supplier-side outgoing message exists yet. It must use the composer when added (WP-04 / WP-08). |
| M-13 | Platform | Plan "contact support" link (`planDisplay`) | W | Client | YourKhata support | Not merchant-to-customer | — | Out of MSG-01 scope (merchant to us) |
| M-14 | Platform | Sign-in OTP (Message Central) | Provider SMS | Server | The user themselves | Not editable by design | Provider | Out of scope: a security message (05: in-app validation/security alerts) |

## Next

1. ~~M-06 bulk reminders editable (MSG-07/08)~~ and ~~M-01/M-02 final text in the log (MSG-10)~~: done 16 Oct 2026. `final_text` / `with_final_text` in `notifications/services/whatsapp_text.py` is the one owner of the edited-text rule (blank, over 900 characters, NUL, not a string), and Lending's dialog uses it too. A provider SMS refuses `text`, because it goes out in its approved words.
2. ~~M-10 and M-11 onto a composer~~: done 16 Oct 2026. Looking at the phone screenshot found the blank-message reason hidden under the QR dialog's sticky footer; `UbMessageBox` now scrolls it into view, and `paylink.mjs` measures it with `elementFromPoint`.
3. M-03/M-04: the receipt and invoice texts are not recorded at all; recording them needs a message-log row for a share that is not a reminder (decide with WP-08).
4. M-12 supplier messages, when built, start on the composer.
