# Sales draft recovery contract — WP-02

Implementation scope: invoice/bill-of-supply drafts, estimates, sales orders and delivery challans. Purchase draft recovery is a separate remaining verification item; do not infer that it is covered by sales tests.

## Identity and ownership

The editor mints `client_draft_key` before its first create request and stores it with the current device copy. New device-copy keys include tenant, signed-in user, document family and slot. Unowned legacy copies remain stored but are not automatically offered to another signed-in user. No contact/pricing data is added to the retry identity table.

`POST` accepts an optional 1–64 character alphanumeric/underscore/hyphen key. The server's unique `(tenant, actor_key, family, key)` claim is the concurrent creation lock. Invoice and bill-of-supply share the invoice family; other document families are separate. Authorization runs normally before recovery. Omitting a key preserves existing API behavior; it does not promise deduplication to legacy callers.

The claim, document, lines and audit commit in one transaction. Failed validation rolls back the claim. A successful first create returns 201. Reusing a key returns 200 with the **current** document and `meta.draft_recovered=true`; submitted retry contents are not applied. Estimate validity and challan transport adapters must not mutate recovered documents.

## Edits and conflict handling

Manual save, autosave and save-before-issue use the shared sales editor queue. Each request reads the latest acknowledged identifier/version when it starts. Newer typing remains dirty when an older save finishes.

A recovered version-1 draft is updated through an explicit PATCH against version 1, using the current local form. A competing update therefore causes the normal stale-version conflict. Recovery of a newer draft opens conflict review before any overwrite. The local copy retains its original expected version, including through reload. Restoring a device copy based on a different server version also requires review.

A recovered posted document is read-only in the editor and is not issued again. Late save/load responses are ignored after editor/account teardown. Aborting a client request does not imply that the server rolled it back; the durable key remains the recovery mechanism.

## Discard and retention

Deleting a keyed draft nulls the claim's document reference. The retained claim is a tombstone: retry returns 404 with an explanation to start a new document, rather than resurrecting discarded work. Claims are independent of the existing 24-hour posting idempotency cache. Device copies retain the existing seven-day expiry; claims/tombstones are retained with business data, with no new scheduled purge.

Migration `sales.0008_durable_draft_creation` is additive. It does not rewrite old invoices, stock costs, ledger entries or master pricing. Rollback must not drop the claim table after accepting keyed writes without a deliberate recovery/retention decision. Never purge real data as part of this work.

## Evidence and limits

See the latest `QA.md` checkpoint for exact automated results and browser screenshots. Regression scenarios include all four route families, changed retry contents, concurrent first requests, actor/tenant/family isolation, corrected validation, recovery after the short cache window, already-posted documents, discard tombstones, lost-response/remount, overlapping saves, stale local copies and late responses after reset.

Desktop and 390px browser checks cover actual draft save/reload and accessible mobile save actions. A physical network interruption, physical-device storage failure and purchase-editor recovery are not certified by these checks. Guarded storage can be unavailable in private/quota-limited environments; in-memory retries still reuse the key, but a reload cannot recover an identity the browser could not persist. Multiple distinct unsynced new drafts in separate tabs still share the existing per-user/family `new` device slot; multi-draft offline workspace design is outside this slice.
