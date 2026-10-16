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

Its words come from `useShareSheetLabels()`. A source-scan guard in `src/tests/sharedOwners.test.ts` forbids `window.open(buildWhatsAppUrl…)`.

The Lending and Library dialogs are server-prepared composers. The server returns `wa_url` built from the edited text, and the tap is recorded. They were already editable and stay the reference for server-recorded messages.

## Inventory

Channel: W = WhatsApp handoff, S = device SMS, C = copy, N = platform share, T = call. "Editable" means the final text can be changed before the channel opens.

| # | App | Trigger | Channels | Text owner | Recipient | Editable | Recorded on server | Status / evidence |
|---|---|---|---|---|---|---|---|---|
| M-01 | Udhaar / Shop customers | Khata "Remind" (`usePartyReminder` → `PartyReminderSheet`) | W S T C N | Server preview (`ledger/services/reminders.preview_reminder`) | Party mobile | **Yes**, since WP-04 (shared composer) | The reminder log stores the SERVER text, not the edit | Composer tests in `UbShareSheet.test.tsx`; browser `e2e/share-composer-look.mjs` 24/24 at 360/1280 px. Gap: MSG-10 audit of the final text. |
| M-02 | Shop | Bill/source reminder (`SourceReminderSheet`) | W S T C N | Server source preview | Document party | **Yes**, since WP-04 | Same gap as M-01 | Composer tests |
| M-03 | Shop / Payments | Receipt share (`PaymentReceiptPageContent`) | W S C N | Client (`receipt.shareText`) | Payment party | **Yes**, since WP-04 | Not recorded | Composer tests |
| M-04 | Shop sales | Invoice, estimate, order and challan "Share on WhatsApp" (`useInvoiceDetail`) | W S C N | Client `shareText`, with the live share link minted first | Party or walk-in mobile | **Yes**, since WP-04. Before, it opened WhatsApp with fixed text through `window.open` after a request, which phones and in-app browsers block. | The share link is recorded, the text is not | `useInvoiceDetail.share.test.tsx` failed before (pop-up and no composer) and passes after |
| M-05 | Shop sales | "Copy link" | C (link only) | n/a (URL) | n/a | Not applicable: no prose | Link minted | Unchanged |
| M-06 | Udhaar / Shop | "Remind all" bulk (`BulkReminderDialog`) | W, one tap per party | Server (`bulk_reminders` → `wa_url` per party) | Each party | **No**. Fixed server text per party. | Scheduled row per party, marked on tap | **Open (MSG-07/08)**: needs a template edit + preview step before the batch is built |
| M-07 | Lending | Borrower reminder / receipt (`lending/MessageDialog`) | W S T | Server (`lending/services/messages`) with `text` | Borrower | **Yes** (reference) | Recorded with text | Existing `MessageDialog.test.tsx` |
| M-08 | Library | Member fee / receipt / custom message (`library/MessageDialog`) | W | Server (`fee_messages.preview/send`, `custom_body`) | Member or guardian | **Yes** | Recorded | Existing tests |
| M-09 | Library | Bulk fee message (`BulkMessageDrawer`) | W, one tap per member | Server `bulk_prepare` with shared text | Audience | **Yes**, one shared text; no per-member override | Recorded per tap | MSG-07 per-recipient override not built |
| M-10 | Library | Counter slip after issue (`CounterPrompts`) | W | Server slip `waUrl` | Member | **No** | Not recorded as a message | **Open**: move onto a composer |
| M-11 | Payments | UPI pay-link share (`UpiPayQrDialog`) | N (image + text), C | Client `payLink.shareText` | Chosen in the OS sheet | **No** | Link recorded | **Open**: the OS sheet takes the text as given; offer the composer for the text part |
| M-12 | Shop suppliers | Payment confirmation, payable follow-up, purchase/return document share | — | — | — | Not built | — | **Not built**: no supplier-side outgoing message exists yet. It must use the composer when added (WP-04 / WP-08). |
| M-13 | Platform | Plan "contact support" link (`planDisplay`) | W | Client | YourKhata support | Not merchant-to-customer | — | Out of MSG-01 scope (merchant to us) |
| M-14 | Platform | Sign-in OTP (Message Central) | Provider SMS | Server | The user themselves | Not editable by design | Provider | Out of scope: a security message (05: in-app validation/security alerts) |

## Next

1. M-06 bulk reminders: add a template edit and preview step before `POST /reminders/bulk`, sending the approved text so each `wa_url` uses it (MSG-07/08). This needs a backend `text` field on the bulk endpoint.
2. M-01/M-02: send the edited final text to the reminder log when the merchant taps a channel (MSG-10). This is a server change on the reminder `mark` / `send` path.
3. M-10 and M-11 onto a composer.
4. M-12 supplier messages, when built, start on the composer.
