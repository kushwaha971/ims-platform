import type { TInvalidationMap } from './types';

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
  registerAccount: { resetAll: true },
  passwordLogin: { resetAll: true },
  confirmPasswordReset: { resetAll: true },
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
  saveParty: { refetch: ['partyList'] },
};
