# 08 · Backend change proposals

Status: **proposals only. None is approved. None may be built without the owner's written approval.** 17 Oct 2026.

The revamp is mainly UI, UX and frontend performance. A backend change is listed here only if the audit found a demonstrated need. Library and Lending contracts are fixed: proposals for them change no request, response, rule or table; they only make the same answer arrive faster or safer, and each still needs approval.

Every proposal has the same fields: why, what it touches, before vs after, risk, compatibility, data impact, tests, rollback.

## BP-01 · Lending "Today" runs one query per active loan

- **Why**: `GET /lending/today` computes `figures()` for every active loan in the book, unpaginated (`apps/lending/services/collections.py:423-424`). On a book with a few thousand loans this is the slowest screen a collector opens, every morning. Not yet measured: Phase 1 must time it on a seeded book before this proceeds.
- **Touches**: `GET /lending/today` only.
- **Before → after**: same response, byte for byte. Figures computed in one or two aggregate queries over `DuesDue` instead of per loan.
- **Risk**: medium; the figures are money and must match.
- **Compatibility**: no contract change.
- **Data**: none.
- **Tests**: figure parity test — old and new implementation over a fuzzed book must return identical JSON; a query-count budget in `tests/performance/`.
- **Rollback**: keep the old function behind a setting for one release; flip back.

## BP-02 · Lending loan list and reminders, one figures query per row

- **Why**: `GET /lending/loans` (`views/loans.py:46`, `services/loans.py:694`) and `GET /lending/reminders` (`messages.py:261-289`) run `figures()` per row.
- **Touches**: those two endpoints. Same shape as BP-01, same tests and rollback. Lower priority: they are paged (loans) or smaller.

## BP-03 · Library member list, 4–5 queries per row

- **Why**: `GET /library/members` builds `member_summary` per row (`services/members.py:141-160`, `:245`; `loans.py:161`). A 50-row page is 200+ queries.
- **Touches**: `GET /library/members` only. Same response.
- **Risk**: medium (dues and block reasons are shown to staff).
- **Tests**: response parity on a seeded library of 2,000 members; query budget.
- **Rollback**: as BP-01.

## BP-04 · Library overdue fines computed per loan

- **Why**: `fine_for` runs 2–3 queries per overdue loan on `GET /library/loans` and `/overdue` (`services/loans.py:183`, `:238`). Settings and closed days can be loaded once per request.
- **Touches**: those endpoints; same response. Low risk if parity-tested.

## BP-05 · Duplicate protection on money actions that have none

The client can and will lock buttons (05 §4). The server is the last guard. The audit found money-moving writes with no idempotency scope:

| Endpoint | Money? | Today | Proposal |
|---|---|---|---|
| `POST /library/members/{id}/deposit/receive` | yes | no key | add `@idempotent("library.deposit.receive")`, key optional (same as other scopes) |
| `POST /library/members/{id}/deposit/apply`, `/refund` | yes | no key | same pattern |
| `POST /library/charges/{id}/waive`, `/reverse` | yes | no key | same pattern |
| `POST /lending/loans/{id}/collections`, borrower collections | yes | key **optional** | keep optional on the server (old clients), make the new client always send one |
| `POST /lending/loans/{id}/write-off` | yes | amount must match | no change needed |
| `POST /lending/collections/{id}/void` | yes | safe by filter | no change needed |

- **Compatibility**: an optional key changes nothing for a client that doesn't send it, so old installed apps keep working. Library is frozen, so even this needs approval; the alternative is client-side locking only.
- **Risk**: low. **Data**: one row per keyed request in the existing idempotency table.
- **Tests**: same key + same body replays; same key + different body 409; no key behaves as today.
- **Rollback**: remove the decorator.

## BP-06 · Throttling on Library and Lending writes

- **Why**: no throttle class on Library (except reports) or Lending (`config/settings/base.py:196` has no default). A runaway client loop or repeated taps can hit write endpoints without limit.
- **Proposal**: deferred. Adding a throttle could refuse a legitimate busy counter; needs traffic data first. Recorded so it isn't lost.

## BP-07 · Landing for installed apps

- **Why**: the PWA opens `/dashboard` for everyone (A-05). The server already resolves a landing (`landing` in `auth/me`).
- **Proposal**: frontend only (`proxy.ts` and manifest `start_url`); **no backend change** if `landing` already returns the last app's home. Phase 1 verifies. Listed here only so the dependency is visible.

## Not proposed

- No change to any Library or Lending calculation, model, migration, or response field.
- No new notification types, no push (owner directive; NTF-04 needs ADR-024).
- No pagination change on Library/Lending lists (page-number paging is part of their contract); long lists are handled in the client (05 F8).
