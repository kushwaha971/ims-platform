# 16. Adding an app

A new product (gym, hotel, clinic, anything) is added by **registering** it, never by editing shared code. This is the checklist. `docs/platform/14` explains why it is shaped this way. `apps/platform_app/tests/test_new_app_by_registration.py` and `frontend/src/modules/DigiKhaato/features/navigation/newAppByRegistration.test.tsx` prove that a gym registered this way gets a switcher entry, a menu, a home, a landing and a checklist with no shared file touched.

## Words first

A **capability** (called a "module" in the code) is a unit of entitlement and of permission codenames: `parties`, `ledger`, `payments`, `gym`.

An **app** is a product a business runs. It has its own menu, home page, words, setup and roles. It uses capabilities, some of them shared with other apps.

The **anchor** is the one capability whose presence makes the app exist for a business.

## Server: four registrations, all in the app's own `AppConfig.ready()`

1. **The capability.** Add the module code to `ModuleCode`, its dependencies to `MODULE_DEPENDENCIES` and its engines to `ENGINES_USED_BY` (`platform_app/services/tenant_settings.py`). Keep it in `UNRELEASED_MODULES` until the owner releases it.
2. **The app.** `register_app(AppSpec(code, label_id, anchor, capabilities, entry_permission, home_path, order))`. The code is lowercase letters and is never renamed, because grants and `membership.last_app` store it. Business capabilities (`platform`, `team`, `notifications`, `help`) belong to no app.
3. **The setup checklist.** `register_app_setup(code, steps)`, where `steps(tenant)` returns `SetupStep(key, label_id, path, done, permission)`. `done` is a fact read from the books, never a tick. A person sees only the steps their permissions allow.
4. **Everything the app plugs into** goes through the registries that already exist:
   - module roles;
   - number kinds;
   - the reminder seam;
   - the dues subject registry;
   - the attendance policy;
   - module panels on the khata.

   Verticals never import each other.

That is all the platform needs. The session then carries the app in `apps` for everyone who can open it, and in `apps_addable` for owners whose plan includes the anchor. `/auth/switch-app`, `/tenants/current/apps`, `/auth/leave-app` and `/apps/{code}/setup` all work for it unchanged.

## Client: one manifest, one line

1. **`features/<app>/app.ts`** exports an `AppManifest`:
   - `code`, the same as the server's;
   - `labelId`;
   - `routePrefixes`;
   - `sections`;
   - `navigation`, which lists only built pages;
   - optional `shell` capabilities;
   - optional `words`: shared message id → this app's message id, for example `'parties.detail.badge.customer': 'gym.words.person'`;
   - optional `peopleHref`, the app's own list of people.

   It imports icons, routes and the manifest type, and nothing else. `src/tests/appManifests.test.ts` enforces this.
2. **One line** in `src/modules/appManifests.ts`.
3. **Pages** under `app/(app)/<app>/…`, each a Suspense boundary and one page-content import. Gate the route group with `RequireModule`.
4. **The home page** puts `<AppSetupCard app="<code>" appName={t(labelId)} />` under its header.
5. **Words** go in the app's own catalogue prefix (`locales/catalogues.json`), then run `npm run i18n:split`.

Never write `=== '<app>'` in shared code. The architecture test fails the build if `src/components` or `features/navigation` names an app. Ask the manifest instead: `shell.partySearch`, `words`, `peopleHref`.

## Before release

- **Route matrix.** Declare the new routes in `tests/integration/test_sprint1_matrix.py` where their prefixes require it.
- **Browser pass.**
  - The owner adds the app from the switcher and lands on its home.
  - The checklist shows, and its links work.
  - A staff member granted only this app sees only its menu.
  - The app's words appear on a shared khata.
- **Release.** Remove the module from `UNRELEASED_MODULES` only with the owner's go-ahead.
