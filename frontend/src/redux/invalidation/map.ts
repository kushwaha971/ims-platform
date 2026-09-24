import type { TInvalidationMap, TSliceKey } from './types';

/**
 * NEW-2 (QA retest, 24 Sep 2026) — what every ledger write refetches, as one
 * list so the four entries below cannot drift apart.
 *
 * `partyList` was always here: the list row's balance and `meta.totals`.
 *
 * `partyDetail` and `ledgerEntry` were not, and the khata showed it. The
 * header's BALANCE moved from the 201 (the `patch` entries below), and nothing
 * else on the page did: the credit block — "₹250.00 over the ₹1,000.00 limit",
 * the usage bar a merchant reads before lending more — and the timeline's
 * "You gave in all" / "You got in all" stayed on the page-load figures until a
 * reload. Both are the SERVER's: the credit block's exposure, available, over-
 * by, percent and status are computed with `Decimal` in `GET /parties/{id}`,
 * and the totals are `meta.summary` on the timeline's first page. The 201
 * carries neither, and recomputing them here would be money arithmetic in the
 * client that canon rule 3 forbids — and a percent that would eventually
 * disagree with the caption beside it by a point. So they are re-read.
 *
 * `refetch` rather than `stale`: the merchant is on the khata when they post,
 * looking at exactly these figures. The `patch` entries stay, and are still
 * true: the balance and the new row are on screen from the 201 before either
 * read returns. The re-read replaces them with the server's own copy, and a
 * read that was requested BEFORE a later write is dropped rather than allowed
 * to put older figures back — see `TStaleState.staleSeq`.
 */
const LEDGER_WRITE_REFETCH: readonly TSliceKey[] = ['partyList', 'partyDetail', 'ledgerEntry'];

/**
 * EXP-01 — what an expense write leaves stale beyond its own screens.
 *
 * An UNPAID expense posts a ledger credit and a void reverses it, so the party
 * list, the khata and the reports built on the ledger may all have moved.
 * `stale`, not `refetch`: the merchant is on the expense list or the cashbook
 * when they save, not on any of those — and a paid expense (the common case)
 * moves none of them, so an immediate re-read would be traffic nobody reads.
 */
const EXPENSE_LEDGER_STALE: readonly TSliceKey[] = [
  'partyList',
  'partyDetail',
  'ledgerEntry',
  'statement',
  'ledgerAging',
];

/**
 * Part 19 §19.3.6 — THE single normative statement of what a mutation
 * invalidates, as code rather than as a table nobody updates.
 *
 * `Record<TMutationName, …>` is total: adding a thunk to MUTATIONS without an
 * entry here is a TypeScript error. `TSliceKey = keyof RootState`, so naming a
 * slice that does not exist is a TypeScript error at this file's own line.
 *
 * Sprint 0 carries the two mutations the chassis has. Every later mutation adds
 * one line here in the same commit that adds it to `MUTATIONS`, and the three
 * enforcement points of §19.3.6 make forgetting either one impossible:
 *   1. compile time — a missing entry,
 *   2. compile time — a slice that does not exist,
 *   3. CI — a thunk that never reached the registry at all.
 */
export const INVALIDATION: TInvalidationMap = {
  // ── platform & settings ───────────────────────────────────────────────────
  // A new tenant means a new token and a new dataset; nothing survives.
  switchTenant: { resetAll: true },
  logout: { resetAll: true },

  // ── PLT-02 / CR-2026-09-19-A — authentication ─────────────────────────────
  // Asking for a reset link changes nothing the client caches, and — BR-2 — it
  // must not even let the client learn whether the address exists. What it DOES
  // change is one flag on the auth slice, written by that slice's extraReducers
  // on this very action, which is what `patch` declares.
  requestPasswordReset: { patch: [['auth', 'resetRequested']] },
  // A successful registration, login or reset-confirm is a NEW SESSION.
  // Anything a previous session left in the store belongs to a different user or
  // a different business, so the teardown is total — the same signal a tenant
  // switch sends (§19.6.5).
  //
  // NEW-1 — and the session SUMMARY too, which `resetAll` never touched
  // (`sessionSlice` keeps itself through `resetAllFeatureState`, because a
  // tenant switch refetches it rather than dropping it). `sessionSlice` clears
  // it on these three fulfilled actions in its own extraReducers, which is what
  // the `patch` declares: without it, the previous session's `activeTenant`
  // was still there when `/auth/me` answered for the new one, and the
  // stale-tab guard read a different tenant as "switched in another tab".
  registerAccount: { resetAll: true, patch: [['session', 'activeTenant']] },
  passwordLogin: { resetAll: true, patch: [['session', 'activeTenant']] },
  confirmPasswordReset: { resetAll: true, patch: [['session', 'activeTenant']] },
  // Setting a password changes no cached row; it changes whether the account
  // has one, which is a field of the auth slice.
  setPassword: { patch: [['auth', 'passwordSet']] },

  // ── PLT-03 — the onboarding wizard ────────────────────────────────────────
  // Creating a business re-issues the token with a new `tid`: it is a tenant
  // switch in everything but name, and anything cached before it is another
  // tenant's (or no tenant's) data.
  createTenant: { resetAll: true },
  // The later steps patch the tenant the wizard is already in. They change the
  // session summary — `enabled_modules` after the preset is applied, the tenant
  // name in the header — so the session is refetched while the user is looking
  // at the screen that changed it.
  // FR-9 — step 1 edited on a business that already exists. A PATCH of the
  // name, type and state, so it patches the same draft as steps 2 and 3; it is
  // NOT `createTenant`'s `resetAll`, because no token is re-issued and there is
  // no new tenant whose caches would have to be dropped.
  saveBusinessStep: { patch: [['onboarding', 'draft']] },
  saveGstStep: { patch: [['onboarding', 'draft']] },
  saveAddressStep: { patch: [['onboarding', 'draft']] },
  // The preset the server applies on completion changes `enabled_modules` and
  // the tenant summary. The thunk re-reads `/auth/me` and `sessionSlice`
  // applies it in its own extraReducers on this action — a patch, in place,
  // rather than a stale flag on a slice that has no stale fields.
  completeOnboarding: { patch: [['session', 'enabledModules']] },

  // ── PLT-04 — multiple businesses ──────────────────────────────────────────
  // Both write the membership list that `sessionSlice` holds, in that slice's
  // own extraReducers on these actions.
  setDefaultTenant: { patch: [['session', 'tenants']] },
  leaveTenant: { patch: [['session', 'tenants']] },

  // ── PLT-05 — the team screen ──────────────────────────────────────────────
  // Both write the list the merchant is looking at WHILE they look at it, which
  // is the whole of the `refetch` case: `stale` would wait for a remount the
  // merchant has no reason to perform. The slice applies its own optimistic
  // change first (a new row; a row that now reads "Revoked") so the screen
  // answers immediately, and the refetch behind it replaces the guess with the
  // server's own ordering, expiry and status.
  //
  // Neither is `patch` on `session`: an invitation is not a membership, so the
  // member count in `plan_limits` only moves when someone ACCEPTS, which is an
  // event on the invitee's device and not on this one.
  inviteMember: { refetch: ['invitation'] },
  revokeInvitation: { refetch: ['invitation'] },

  // DEC-012 — adding a member is the case that DOES move the member count, and
  // that is the difference from `inviteMember` above. An invitation is an
  // intent that spends a seat when the invitee accepts, on their device; a
  // member is created here, now, with their account and their seat, so
  // `plan_limits` on this device is stale the moment the 201 lands and the
  // "3 of 3 team members" banner would otherwise keep saying 2. It is `stale`
  // and not `patch`: this slice does not write the plan's counters and must not
  // claim to — `patch` is a statement that THIS mutation's own extraReducers
  // already fixed the field, and an entry that says so falsely is worse than no
  // entry, because the next reader stops looking for the refetch.
  addMember: { refetch: ['member'], stale: ['plan'] },
  // A reissue changes `must_change_password` and the expiry on one row, which
  // is what the list is FOR. It spends no seat, so the session is untouched.
  regenerateCredentials: { refetch: ['member'] },

  // ── PTY-01 — create and edit a party ──────────────────────────────────────
  // `refetch`, not `stale`: the drawer opens over the list the merchant is
  // reading, and when it closes they are looking straight at the place the new
  // row belongs. `stale` waits for a remount that is not going to happen.
  //
  // Not optimistic, unlike the team screen's invite. A party's row carries a
  // balance the server owns, an ordering the server decides
  // (`last_activity_at` NULLS FIRST) and a display code the server may have
  // assigned — so a guessed row would be in the wrong place with the wrong
  // subtitle, and the correction a moment later would look like a bug. The
  // refetch is one request against a list that is already paginated.
  //
  // No `stale: ['plan']`: DEC-001 took `max_parties` out of the enforceable
  // limits at MVP, so no counter on the plan slice moves when a party is
  // created. When that decision is revisited, this line is where it lands.
  //
  // PTY-05 added `stale: ['partyTag']`, and it closes a gap that only appears on
  // the feature's PRIMARY create path. A merchant adds a party and types a new
  // tag into the picker; the server creates the tag row inside the party's own
  // transaction, so nothing on this device ever saw a tag mutation. The list
  // refetched and the chip appeared on the row — and the tag was missing from
  // the filter, from the bulk dialog and from the next party's picker for the
  // rest of the session, because `fetchPartyTags` refuses to ask twice once it
  // has an answer. The merchant could see the tag and not use it.
  //
  // `stale` rather than `refetch`: the drawer has just closed over the list, and
  // the picker the tag is missing from is not on screen. It is fetched when
  // something next mounts that needs it, which is the definition of the cheap
  // one.
  saveParty: { refetch: ['partyList', 'partyDetail'], stale: ['partyTag'] },

  // ── PTY-03 — the promise date on the khata page ───────────────────────────
  // Two slices, two different reasons, which is why this entry is not one of
  // them.
  //
  // `patch` on `partyDetail` because this thunk's OWN extraReducers write the
  // party the PATCH returned straight into the slice — the screen the merchant
  // is looking at is already correct when the promise resolves, and a refetch
  // of it would be a round trip to learn what the response just said.
  //
  // `refetch` on `partyList` because the date is not only a detail field: it is
  // PTY-02's `collection` chip and one of the four orderings, so a list sitting
  // behind this page is now wrong about which parties are due today. It is
  // `refetch` rather than `stale` on the strength of where the merchant goes
  // next — back to the list they came from, usually within seconds, which is
  // exactly the remount `stale` would be waiting for and would not get, because
  // the list stays mounted in the router's cache.
  saveCollectionDate: {
    patch: [['partyDetail', 'party']],
    refetch: ['partyList'],
    /* LED-05 — the date moves a party between the reminders screen's buckets
       and changes their counts; that screen refreshes when it next mounts. */
    stale: ['reminders'],
  },

  // ── LED-01 — a posted ledger entry ────────────────────────────────────────
  //
  // Three things change and each gets the treatment it deserves.
  //
  // `patch` on the timeline, because the response CARRIES the new row:
  // `ledgerEntrySlice` splices it into the list in its own extraReducers on
  // this action, in the position the server's ordering would put it. A refetch
  // here would be a round trip to re-learn what the 201 already said, on the
  // connection this product is built for, at the moment the merchant is
  // watching for their entry to appear.
  //
  // `patch` on the party header for the same reason: `meta.party_balance` is
  // the balance this transaction produced, which is a better number than
  // whatever a second read a moment later happens to find.
  //
  // `refetch` on the LIST, because the response cannot patch it. The party's
  // balance changed, so its row's amount is wrong, its position in a recency
  // ordering is wrong, and the header totals — computed over the whole
  // filtered set, not over the page — are wrong by this amount. `stale` would
  // wait for a remount the merchant may never perform: they post an entry, tap
  // back, and read a list that says something else.
  //
  // And — NEW-2 — `refetch` on the khata header and the timeline, for the
  // figures on them the response does not carry: the credit block and the
  // two totals. See `LEDGER_WRITE_REFETCH`.
  postEntry: {
    patch: [
      ['ledgerEntry', 'rows'],
      ['partyDetail', 'summary'],
    ],
    /* `statement` is marked STALE rather than patched or refetched, and the
       three verbs mean three different things here. It cannot be patched: a
       running balance is a property of the whole ordering, so one new row
       invalidates every figure after it and there is no field to fix. It is not
       refetched either, because the merchant is almost never looking at it —
       the entry was posted from the khata page, and firing a second request at
       a screen nobody has open is a request nobody reads. `stale` is the
       third answer: the statement refreshes the next time it is mounted, which
       is exactly when the number matters again. */
    stale: ['statement', 'ledgerAging', 'cashbook', 'reminders'],
    refetch: LEDGER_WRITE_REFETCH,
  },

  // ── LED-02 — the opening balance ──────────────────────────────────────────
  //
  // The same three effects as a posted entry, and one more that is the whole
  // reason this is a separate thunk: whether the khata still OFFERS "Add
  // opening balance". That question is answered by whether the party has a
  // posted opening entry, which lives in `ledgerEntry.rows` — so the patch on
  // the rows is what takes the action away, and the action does not have to
  // remember to hide itself.
  postOpeningBalance: {
    patch: [
      ['ledgerEntry', 'rows'],
      ['partyDetail', 'summary'],
    ],
    /* `statement` is marked STALE rather than patched or refetched, and the
       three verbs mean three different things here. It cannot be patched: a
       running balance is a property of the whole ordering, so one new row
       invalidates every figure after it and there is no field to fix. It is not
       refetched either, because the merchant is almost never looking at it —
       the entry was posted from the khata page, and firing a second request at
       a screen nobody has open is a request nobody reads. `stale` is the
       third answer: the statement refreshes the next time it is mounted, which
       is exactly when the number matters again. */
    stale: ['statement', 'ledgerAging', 'cashbook', 'reminders'],
    refetch: LEDGER_WRITE_REFETCH,
  },

  // ── LED-03 — corrections and reversals ────────────────────────────────────
  //
  // The same two patches, and both are CLAIMS that a reducer already did the
  // work: `ledgerEntrySlice.applyReversal` strikes or drops the original and
  // places whatever replaced it, and `partyDetailSlice.applyCorrectionBalance`
  // writes the balance the server returned onto the header. A `patch` this file
  // declares and no reducer performs is the defect `postEntry` shipped with —
  // see this file's own docstring on why a false claim is worse than none.
  //
  // `refetch: ['partyList']` because the list carries every party's balance and
  // its `meta.totals`, and a correction changes both. The merchant is very
  // often one back-tap from that list.
  reverseEntry: {
    patch: [
      ['ledgerEntry', 'rows'],
      ['partyDetail', 'summary'],
    ],
    /* `statement` is marked STALE rather than patched or refetched, and the
       three verbs mean three different things here. It cannot be patched: a
       running balance is a property of the whole ordering, so one new row
       invalidates every figure after it and there is no field to fix. It is not
       refetched either, because the merchant is almost never looking at it —
       the entry was posted from the khata page, and firing a second request at
       a screen nobody has open is a request nobody reads. `stale` is the
       third answer: the statement refreshes the next time it is mounted, which
       is exactly when the number matters again. */
    stale: ['statement', 'ledgerAging', 'cashbook', 'reminders'],
    refetch: LEDGER_WRITE_REFETCH,
  },
  correctEntry: {
    patch: [
      ['ledgerEntry', 'rows'],
      ['partyDetail', 'summary'],
    ],
    /* `statement` is marked STALE rather than patched or refetched, and the
       three verbs mean three different things here. It cannot be patched: a
       running balance is a property of the whole ordering, so one new row
       invalidates every figure after it and there is no field to fix. It is not
       refetched either, because the merchant is almost never looking at it —
       the entry was posted from the khata page, and firing a second request at
       a screen nobody has open is a request nobody reads. `stale` is the
       third answer: the statement refreshes the next time it is mounted, which
       is exactly when the number matters again. */
    stale: ['statement', 'ledgerAging', 'cashbook', 'reminders'],
    refetch: LEDGER_WRITE_REFETCH,
  },

  // ── PTY-04 — archive and restore ──────────────────────────────────────────
  // Archiving MOVES a party between the two tabs of the list the merchant is
  // looking at: the row leaves Active and appears under Archived, and the
  // header totals lose whatever it contributed. `refetch` rather than `stale`
  // for the same reason PTY-01's save is — the merchant is looking straight at
  // the place the row used to be, and `stale` waits for a remount that is not
  // going to happen.
  //
  // `patch` on `partyDetail` because both thunks' own extraReducers write the
  // party the server returned, so a khata page open behind the dialog is
  // already correct.
  /* PTY-04 FR-3: an archive can carry a write-off, which posts a ledger entry
     — so the khata timeline, the statement and aging are marked stale. For a
     plain archive that costs one refetch of a timeline that has not changed,
     which is cheaper than a second thunk for the same endpoint. */
  /* NEW-2: `partyDetail` is refetched as well, for the same reason as the
     ledger writes above — a write-off moves the balance to zero, the patch
     moves the header, and the credit block is the server's and was left
     reading "₹250.00 over the limit" on a party that now owes nothing. */
  archiveParty: {
    patch: [
      ['partyDetail', 'party'],
      ['partyDetail', 'summary'],
    ],
    refetch: ['partyList', 'partyDetail'],
    /* `reminders` too: a write-off settles the balance, which clears the
       collection date and cancels the party's scheduled reminders (LED-05 FR-6). */
    stale: ['ledgerEntry', 'statement', 'ledgerAging', 'reminders'],
  },
  restoreParty: { patch: [['partyDetail', 'party']], refetch: ['partyList'] },
  // No `patch` here: a bulk archive is about rows in a list and says nothing
  // about whichever single party the detail slice happens to hold.
  bulkArchiveParties: { refetch: ['partyList'] },

  // ── PTY-05 — tags ─────────────────────────────────────────────────────────
  //
  // The distinction that runs through all five entries: a tag's IDENTITY lives
  // in `partyTag`, and COPIES of its name and colour live inside every party
  // row that carries it, because the list response embeds them (they are
  // prefetched server-side so the list never issues a per-row request). So the
  // question for each mutation is not "did the tag change" but "is a name or a
  // colour now wrong somewhere else on the screen".
  //
  // Creating one changes nothing that is already drawn — no party carries it
  // yet. The slice's own extraReducers put it in the picker, which is where the
  // merchant is looking, and that is the whole of it.
  createPartyTag: { patch: [['partyTag', 'tags']] },

  // A rename or a recolour is the case the embedded copies exist for. The join
  // stores the id and never the name, so ONE row changed in the database and
  // every chip on every list row is now showing the old spelling — which is
  // precisely the bug US-4 exists to prevent, arriving from the other side.
  // `refetch` rather than `stale` because the manager sits over the list the
  // merchant came from, and `partyDetail` because a khata page open in the
  // router's cache shows the same chips in its header.
  updatePartyTag: {
    patch: [['partyTag', 'tags']],
    refetch: ['partyList', 'partyDetail'],
  },
  // A delete removes the chip from every party that carried it — BR-5, the
  // parties survive and the label does not. Same reasoning as the rename.
  deletePartyTag: {
    patch: [['partyTag', 'tags']],
    refetch: ['partyList', 'partyDetail'],
  },
  // A merge is a rename and a delete at once: parties on the source now show
  // the target's name and colour, and the source is gone.
  // `stale` on its own slice as well as `patch`, and the pair is not a
  // contradiction: the patch removes the source tag and writes the target's new
  // name, which are the server's own answer; the COUNTS it cannot compute,
  // because `moved` is counted over live parties and the row's count excludes
  // archived ones, and adding the two produced a number neither of them meant.
  mergePartyTags: {
    patch: [['partyTag', 'tags']],
    stale: ['partyTag'],
    refetch: ['partyList', 'partyDetail'],
  },

  // The only one that changes WHICH tags a party carries rather than what a tag
  // is called. It moves rows in and out of an active tag filter, so the list the
  // merchant is looking at may be about to lose the very rows they selected —
  // `refetch`, and immediately.
  //
  // No `patch` on `partyTag`: the counts in the manager are now wrong by up to
  // two hundred, and this slice does not compute them. `stale` marks them for
  // the next time the manager mounts, which is the screen that cares. Claiming
  // a `patch` this slice does not perform would be worse than no entry at all,
  // because the next reader would stop looking for the refetch.
  bulkTagPartiesThunk: { refetch: ['partyList'], stale: ['partyTag'] },

  // ── PLT-06 / PLT-07 / WLB-01 — settings, profile, branding ────────────────
  // Each save answers with the whole resource, which its own slice writes in
  // place. The session is re-read explicitly by the hook after each of these
  // (`fetchSession`), because the tenant's name, branding and modules live in
  // `active_tenant` and the session slice does not take the stale signal. The
  // statement's letterhead needs nothing: it is fetched on every statement
  // visit (UAT D3).
  saveSettingsSection: { patch: [['settings', 'data']] },
  // The module list is in the settings payload and gates the navigation; the
  // hook re-reads both. What THIS action writes is the switch's own status.
  toggleModules: { patch: [['settings', 'modulesStatus']] },
  saveBusinessProfile: {
    patch: [
      ['businessProfile', 'data'],
      ['businessProfile', 'warnings'],
    ],
  },
  saveBranding: { patch: [['branding', 'data']] },

  // ── PLT-09 — devices ──────────────────────────────────────────────────────
  // The list the member is looking at, edited in place from the answer.
  renameDevice: { patch: [['sessions', 'items']] },
  revokeDevice: { patch: [['sessions', 'items']] },
  // AC-3: this device is signed out too, so it is a logout.
  logoutEverywhere: { resetAll: true },
  // INV-01 / INV-02 — the saved item is the response, so the detail slice
  // writes it straight in (a real patch, performed in `itemDetailSlice`). The
  // list refetches because a save can move a row between stock tabs; the
  // summary is marked stale for its next mount, as the statement is for a
  // ledger write.
  saveItem: {
    patch: [['itemDetail', 'item']],
    refetch: ['itemList'],
    stale: ['stockSummary'],
  },
  archiveItem: {
    patch: [['itemDetail', 'item']],
    refetch: ['itemList'],
    stale: ['stockSummary'],
  },
  restoreItem: {
    patch: [['itemDetail', 'item']],
    refetch: ['itemList'],
    stale: ['stockSummary'],
  },
  // INV-04 — the created master is appended by `inventoryMastersSlice`.
  createUnit: { patch: [['inventoryMasters', 'units']] },
  createCategory: { patch: [['inventoryMasters', 'categories']] },
  // INV-06 — on-hand, average, badges and the movement list all move, on
  // whichever of the three screens the merchant posted from.
  postStockAdjustment: { refetch: ['itemDetail', 'itemList', 'stockSummary'] },
  // ── EXP-01 / EXP-02 / EXP-03 — expenses and the cashbook ──────────────────
  //
  // Recording and voiding change the list the merchant is looking at and the
  // day's cash position, so both are re-read NOW. Neither is patched: the list
  // is sorted and totalled by the server over the filtered set, and a cashbook
  // is a chain in which one row moves every later opening.
  createExpense: {
    refetch: ['expenseList', 'cashbook'],
    stale: EXPENSE_LEDGER_STALE,
  },
  // `expenseFormSlice` writes the voided expense onto the open detail sheet
  // from this response, which is what the `patch` declares.
  voidExpense: {
    patch: [['expenseForm', 'detail']],
    refetch: ['expenseList', 'cashbook'],
    stale: EXPENSE_LEDGER_STALE,
  },
  // The new (or existing, for a duplicate name) row is added to the held list
  // by `expenseFormSlice`, and the picker selects it — no refetch.
  createExpenseCategory: { patch: [['expenseForm', 'categories']] },
  // ── LED-06 — manual reminders ─────────────────────────────────────────────
  //
  // A reminder moves no money, so nothing about the khata, the list or the
  // statement changes. What changes is the history: the khata's strip is
  // PATCHED from the created row (`reminderSlice` prepends it and bumps the
  // count on this action — "Reminded just now" before any read returns), and
  // the reminders screen's Sent tab and bucket figures are marked stale for
  // its next mount.
  sendManualReminder: { patch: [['reminders', 'partyRows']], stale: ['reminders'] },
  // The bulk flow's start writes scheduled rows and hands back one link each;
  // the slice holds them as the flow's steps. Nothing is sent yet.
  startBulkReminders: { patch: [['reminders', 'bulkItems']] },
  // One tapped step: the slice ticks it off; the Sent tab is now out of date.
  sendBulkStep: { patch: [['reminders', 'bulkDone']], stale: ['reminders'] },
  // Done / dismissed / a skipped step — the row is replaced in place wherever
  // the slice holds it.
  markReminderStatus: { patch: [['reminders', 'historyRows']] },
  // LED-07 FR-1 / LED-08 FR-1 — the switches; the response is the new state.
  saveReminderSettings: { patch: [['reminders', 'settings']] },

  // ── NTF-01 — the inbox ────────────────────────────────────────────────────
  // Both write the read state onto the rows the slice holds and the unread
  // count beside them, from the response; nothing else caches notifications.
  readNotification: { patch: [['notifications', 'items']] },
  readAllNotifications: { patch: [['notifications', 'items']] },

  // ── PLT-10 — "Your data" ──────────────────────────────────────────────────
  // Every answer is the new state of the thing written, and `accountDataSlice`
  // writes it in place. Requesting or cancelling a deletion also changes the
  // session's tenant status (the shell's banner): `useAccountData` re-reads
  // `/auth/me` after both, because the session is not a stale-able slice.
  requestExport: { patch: [['accountData', 'exports']] },
  requestDeletion: { patch: [['accountData', 'deletion']] },
  cancelDeletion: { patch: [['accountData', 'deletion']] },
  decideSupportAccess: { patch: [['accountData', 'support']] },

  // ── PLT-14 — the console ──────────────────────────────────────────────────
  // The saved tenant card is the response; `adminSlice` writes it in place.
  updateTenant: { patch: [['admin', 'detail']] },
  requestSupportAccess: { patch: [['admin', 'detail']] },
  // Entering or leaving a support session moves the tab to a different
  // tenant context, as a switch does, so both are `resetAll` — and a DOCUMENT
  // load follows either way, which rebuilds every slice from `/auth/me`.
  startImpersonation: { resetAll: true },
  endImpersonation: { resetAll: true },
};
