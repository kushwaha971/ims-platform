# Editable messages and reminders — universal requirement

**MSG-01: every merchant-facing flow that prepares default outgoing text must let the user edit the final text before send/share.** This applies across the entire Shop/IMS and other supported apps. The current Lending implementation is a reference, not evidence that every other path already complies.

## Coverage inventory

| Context | Messages to inventory and migrate |
|---|---|
| Shop Customers | Due/overdue reminders, bill/receipt share, statements, credit/refund updates |
| Shop Suppliers | Payment confirmation, payable follow-up, purchase/order/return document share |
| Sales/purchases | Estimates, order/delivery updates, invoice, credit/debit-note and correction notices where supported |
| Udhaar | Individual/bulk reminders, payment acknowledgements and statements |
| Library | Fees, receipts, overdue books, renewal and other configured outbound notices |
| Lending | Receipts, repayment reminders, statements and supported loan notices |
| Bulk/scheduled workflows | Template preview, recipient personalization, per-recipient overrides and schedule approval |

Audit every visible button, action menu, drawer, direct WhatsApp/SMS link, default template, send endpoint and scheduled-message entry point. Inventory columns: app, trigger, channel, current template owner, recipient resolver, editor availability, permissions/consent, length constraint, delivery semantics, test and migration status. A flow absent from the inventory is not accepted as covered.

## One shared composer

MSG-02: open context → choose supported channel/recipient → generate default → edit final text → preview → explicit Send or Open WhatsApp/Open messages. Do not jump straight to a noneditable default message.

MSG-03: keep recipient, business/app context, document reference, amount and relevant date visible separately from the editable text. Editing prose cannot modify financial records. Generate variables from authoritative data and ensure no unresolved placeholder is sent.

MSG-04: ordinary rerenders/refetches must not replace typed edits. Offer Reset to default explicitly. A changed recipient, document or business needs a deliberate context transition; never silently carry one person's message into another person's composer.

MSG-05: show the exact final text, valid recipient and channel constraints. Whitespace-only/invalid text is blocked with clear feedback; cancellation sends nothing. Hindi, line breaks, emoji, URLs, symbols and international numbers round-trip correctly. Respect existing backend/module limits and disclose SMS segment consequences where relevant.

MSG-06: sharing a generated document preserves its authoritative content and tenant branding. Editable accompanying text and the document are distinct artifacts. Handle expired/revoked links without sending a dead reference. A future channel inherits the same composer requirement.

## Channel and delivery behavior

| Channel | Required behavior | Honest status |
|---|---|---|
| WhatsApp handoff | Encode the edited final text to the selected permitted recipient; user completes send in WhatsApp | Opened WhatsApp/handoff, not Delivered |
| Device SMS | Open messaging app with edited text and recipient where supported; manual fallback otherwise | Opened messages, not Sent/Delivered |
| Provider SMS/WhatsApp, if configured | Send the approved snapshot through authorized adapter; stable logical request ID, limits and delivery callbacks | Queued/Sent/Failed/Delivered only when provider evidence supports each status |
| Call | Show correct number and initiate supported telephone action | Call initiated; no fabricated answer/completion |

Provider delivery is a separate capability requiring configured service, approved sender/templates where applicable, cost limits and operational support. Expose a valid manual fallback instead of implying an unconfigured service works. This specification does not introduce an email service.

## Bulk and scheduled cases

MSG-07: edit the shared template before enabling a schedule or confirming a batch. Preview representative and exceptional recipients, expand variables per recipient, show recipient count/exclusions, allow supported per-recipient overrides and require explicit confirmation of the final scope.

MSG-08: queue an approved text/version snapshot. Later template edits affect future messages according to an explicit rule; never silently rewrite an already approved send. Revalidate recipient eligibility, consent, authorization and the triggering business condition at execution: a settled bill must not receive an unpaid reminder. In approved dynamic-template mode, resolve documented variables from current authoritative data while retaining the approved template version. In edited final-text mode, do not silently overwrite user text when financial facts change; hold/skip stale messages for review according to an explicit policy. Cancellation, partial failure and retry must not duplicate successful sends.

Where a channel does not support bulk automatic sending, provide a truthful supported handoff flow; do not simulate bulk delivery with multiple untracked browser windows.

## Security, privacy and audit

MSG-09: enforce tenant/book access, recipient ownership, consent/opt-out, permissions, sender identity and rate/spend limits on the server. Free text must not bypass destination restrictions or expose another customer's data. Phone-contact import does not itself authorize messaging.

MSG-10: provider sends are idempotent and audited with actor, business/book, target record, recipient, channel, template/version and outcome. Store final content only under the approved retention/access policy; avoid putting sensitive text or credentials into general logs and tracking URLs. Browser handoffs cannot claim provider delivery evidence.

Message drafts default to in-memory scope; any persisted restore behavior needs an explicit user/business/recipient key and privacy lifecycle. Financial entries and immutable audit history are not editable message templates. In-app validation/security alerts are outside the outgoing merchant-message editor requirement.

## Acceptance tests

MSG-11: each inventory row has a regression proving edited text reaches the final handoff/request unchanged; reset/cancel, invalid input, rerender retention, wrong-recipient rejection and missing permission are covered. Validate URL encoding and preview/request parity.

MSG-12: test supported/unsupported mobile and desktop channels, popup blocking, no contact/no number, international numbers, changed record while composing, network loss after send, duplicate click, provider error, opt-out, schedule edit/cancel and partial bulk failures. No real external messages are required for automated QA; physical-device handoffs and provider sandbox evidence are recorded separately.

Done means all applicable outgoing paths comply, use the shared owner, and have evidence. A textarea added to one reminder drawer does not satisfy the universal requirement.
