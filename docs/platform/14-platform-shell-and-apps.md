# 14 — Platform shell and independent apps: architecture review

Status: review written 5 Oct 2026 on `dev` at `354b6bf`, before any refactor. Owner decisions taken the same day (§6). Steps 1 and 2 of §7 are done; the rest follow in order.

This chapter answers the owner's eight-point brief of 5 Oct 2026. Four problems were reported: an existing user sent to onboarding, modules that look and behave the same, one shared sidebar, and a module switcher that makes the sidebar scroll. All four were traced in the code and reproduced in the browser before anything was changed. The order of the chapter is the one the brief asked for: current architecture, root causes, proposed architecture, migration plan, then implementation and validation as the plan runs.

## 1. Words this chapter uses

The codebase uses "module" for two different things, and that is the first root cause (R6), so this chapter separates them.

An **app** is a product domain a business runs: Shop & billing, Library, Lending & collections, later Gym, Hotel, and others. An app has its own menu, home page, words, settings, setup and workflows. Today the code calls this a "workspace", and it exists only in the frontend.

A **capability** is a unit of entitlement and permission: `parties`, `ledger`, `sales`, `purchases`, `inventory`, `library`, `lending`, `dues`, `attendance`. This is what `ModuleCode` lists, what a plan grants and what `enabled_modules` holds. Several apps can use one capability: the library and lending both use `parties`, `ledger`, `payments` and `dues`.

A **business** is a tenant. A **membership** is one person's place in one business, with one role.

## 2. Current architecture, as traced

### 2.1 Authentication, membership and the first screen

```
create account ─┬─ sign-up (POST /auth/register)              → owner of nothing yet
                ├─ owner creates a login (POST /members)       → temp password, must_change_password
                ├─ owner invites (POST /invitations, accept)   → no password yet
                └─ scripts / data fixes (ORM)                  → anything, onboarding_step = 0
sign in ─┬─ POST /auth/login
         ├─ POST /auth/password/reset/confirm                 → also issues a session
         └─ POST /auth/password/change (temp → own)
   server: start_session() picks the membership: explicit tenant, else is_default, else the only one
   body:   session_payload.build() → user, tenants[] (role, status, onboarding_step), active_tenant, permissions
client decides where to go, in five separate places:
   postAuthDestination()         view-model/authDisplay.ts      (sign-in, reset, register)
   noTenantDestination()         RequireSession.tsx              (every app page, refresh, deep link)
   SetPasswordPageContent        → always /onboarding/step/1
   ForcePasswordChangePageContent → always /dashboard
   useOnboarding                 → /dashboard when complete
then /dashboard (the Shop's report page) redirects a vertical to its own first menu row.
```

Onboarding progress is stored per business, on `platform_tenant.onboarding_step`, written only by the wizard: 1 after step 1, up to 4 when finished. The column defaults to 0. The server's own definition of "unfinished" is steps 1–3 (`services/onboarding.py`, `tenant__onboarding_step__gte=1, __lt=4`). The wizard is a Shop wizard: business type, GST and address.

### 2.2 Entitlements, roles and apps

The backend side is in good shape and is kept. `effective_modules(tenant)` is plan ∩ partner ∩ the business's own choice, minus unreleased modules. Verticals register everything they own from `AppConfig.ready()`: posting sources, payment targets, dues subjects, reminder sources and policies, number series, party roles and module roles (`register_module_role`). Verticals never import each other, and an architecture test enforces it.

What the backend does not have is the app. It knows `library` is a capability. It does not know that a business "runs the Library app", what that app's home page is, or which app a person was last using. A membership has one role for the whole business, and a role is a set of codenames across every capability. Nothing records "Ravi works only in Lending" except a lending-only module role.

### 2.3 Navigation and the active app

All navigation is one static list, `features/navigation/sidebarConfig.ts`: 498 lines, 32 rows, each tagged with `workspace: 'shop' | 'library' | 'lending' | 'any'`. The app list (`WORKSPACES`) is a closed union type with hand-kept URL prefixes for the Shop. `useNavigation()` filters the list by entitlement and permission, then picks the active app in this order: the app that owns the current URL; the app remembered for this business in `localStorage` (`ub_workspace`); then the first app in a fixed order that puts a vertical before the Shop.

Shared pages (customers/parties, payments, dashboard, team, settings) belong to no app. They render Shop words ("Customers", "udhaar", "khata") whatever app is active, and they draw whatever menu was last remembered. Shared code tests app names directly: `UbAppTopBar` and `MobileQuickSearch` show the party search only when `workspace === 'shop'`, and the reminders page has a `SHOP_SCOPE` constant. Adding Gym today means editing the union type, `WORKSPACES`, the shared list, the landing order and every `=== 'shop'` check.

### 2.4 The switcher

The business menu (switch business, add a business, leave a business) is an `MLMenu` rendered inside the sidebar's own `overflow-y-auto` box, positioned `absolute` but not portalled. The app pills (Lending | Shop) are a row inside the navigation list itself.

## 3. Root causes

**R1. The first-screen decision is made by the client, in five places, and they disagree.** The server sends facts and each screen re-derives "where now" its own way. `SetPasswordPageContent` sends everyone to onboarding step 1 without looking at the session. `ForcePasswordChangePageContent` sends everyone to the Shop dashboard. The route guard enforces a different rule from the sign-in screen: the sign-in sends an unfinished owner to the wizard, while a deep link walks straight past it.

**R2. Step 0 means different things on each side.** The server says a business is unfinished at steps 1–3. The client says unfinished is `< 4`, so step 0 counts too. Every business made by a script, seed, support fix or data migration has step 0. Its owner is sent to `/onboarding/step/1` at every sign-in, refresh and password reset, however set up the business is.

Reproduced: "Script Made Traders", with its modules on and only reachable by deep link.

**R3. The business a sign-in opens is the oldest default, not the one the person uses.** `start_session()` takes `is_default`, which `_promote_default` gives to the oldest active membership. Take someone who once started a business and abandoned it, and was later added to a real one. They are sent into the abandoned business's wizard on every sign-in.

Reproduced: "Asha", staff at Verma Finance, lands on `/onboarding/step/2` of her half-made shop every time.

**R4. "Onboarding" conflates three different things.** Setting up the business identity (name, GST, address: owner, once per business), setting up an app (a library's plans and seats, lending's first route: per app, never blocking) and a person's first password (per user) are three states. The code has one wizard and a step number, and the client treats them as "is this person new".

**R5. The active app lives only in the browser.** It is guessed from the URL, then from `localStorage`. So it is per browser rather than per person, it is lost in a private window, a phone and a laptop disagree, and the server cannot send anyone to "their" app after sign-in. That is why the universal landing is the Shop dashboard, which then redirects.

**R6. App and capability are one word, and the app layer is a frontend afterthought.** Because "module" means capability everywhere else, the product idea of an app was bolted on as a tag on a shared menu list. Every app reads from the same list, the same shared pages and the same words, so they look alike: that is the reported "modules behave the same".

Business types make it worse. "Services", "Retail" and "Food" are presets inside the Shop app, deliberately (canon: business type never changes behaviour). But the onboarding grid presents them like separate products, so a Services business correctly gets the Shop and looks identical to every other choice.

**R7. Apps are not registered, they are listed.** No app owns its navigation, routes, words, home page or setup. A new app means editing shared files in six places. An architecture rule exists for the backend (verticals never import each other) and has no frontend equivalent.

**R8. The switcher is part of the scrolling navigation.** It is a non-portalled popup inside the sidebar's scroll box, so it is clipped to the sidebar's width, covers the menu and grows the rail's scroll height.

Reproduced: 8 businesses on a 600 px window, the rail scrolls and names are cut.

## 4. Proposed architecture

```
Platform shell (shared, knows no app by name)
  identity & sessions ─ business (tenant) ─ membership & role ─ entitlements (capabilities)
  app registry ─ landing resolver ─ context switcher ─ design system ─ notifications ─ audit
Apps (each registers itself; never imports another app)
  shop · library · lending · gym · hotel · …   each with: navigation, routes, home, words,
                                                settings, setup checklist, permissions it needs
Engines shared by apps: parties · ledger · payments · dues · attendance · bookings
```

### 4.1 The server decides where a person goes (fixes R1–R4)

A single function, `resolve_landing(user, membership)`, lives in `platform_app/selectors/landing.py` and returns one of the following. Every endpoint that issues or reads a session puts it in the body as `landing`: login, register, reset confirm, password change, switch, refresh and `/auth/me`.

| `landing.kind` | When | Where the client goes |
|---|---|---|
| `set_password` | `must_change_password` | the password screen |
| `no_business` | no active membership and no invitation | create a business |
| `invitation` | only invited memberships | the chooser that lists them |
| `choose_business` | several active, none resolvable | the chooser |
| `business_setup` | role owner, and the business was made by the wizard and stopped at step 1–3 | the wizard at the next step |
| `app` | otherwise | that app's home (`landing.path`) |

The client keeps one generic executor and deletes the five copies. The route guard asks the same `landing` (from `/auth/me`) rather than re-deriving it, so sign-in, refresh, deep link and password reset agree by construction.

Step 0 is defined once, on the server: "not made by the wizard", never setup-pending. The business a session opens is the one asked for, else the one last used (`membership.last_used_at`, written on switch and on sign-in), else the default, else the only one. A user added to a new business who keeps using it is never sent back to an abandoned one.

Onboarding is scoped three ways and never global. Business setup is per business, owner only, and blocking only for a wizard-made business. App setup is per business per app, a checklist on that app's home, and never blocking. A person's first password is per user.

### 4.2 Apps are registered, on both sides (fixes R5–R7)

Backend: `platform_app/apps_registry.py`, `register_app(code, label_id, requires, entry_permission, home_path, order, setup_status=None)`, called from each app's `AppConfig.ready()`. The Shop registers from a small `apps/shop` config, so it is an app like the others, not the default.

The session gains `apps`: the active business's apps the person can open (entitled ∩ `entry_permission` held), each with its home and setup status. It also gains `active_app`, which is `membership.last_app` if still accessible, else the first by order. Switching app is `PATCH /memberships/current {last_app}`. The active app is then per person per business, on every device, and the landing above can send someone to "their" app.

Frontend: `src/platform/apps/registry.ts`, `registerApp(...)`, and each app's manifest lives in its own feature folder, e.g. `features/lending/app.ts` with `{code, labelId, icon, routePrefixes, navigation, quickSearch?, terminology?}`. A single `src/apps.ts` imports the manifests; adding an app is a new manifest line.

`useNavigation()` becomes generic: `registry[activeApp].navigation ∩ permissions ∩ entitlements`, plus the platform's own rows (Team, Settings). `sidebarConfig.ts`, the `Workspace` union and every `=== 'shop'` check are removed. An app capability flag (`quickSearch`) replaces the name test.

Shared pages read the active app from the session, not from memory. Their words come from the app's `terminology`: a library's parties page says "Students", lending's says "Borrowers".

An architecture test fails the build if shared code (`src/components`, `src/platform`, shared features) names an app.

### 4.3 The context switcher sits outside the menu (fixes R8)

The sidebar's header becomes one control, the context switcher: the business name and the current app. It opens a portalled panel: a popover anchored to the header on desktop, a bottom sheet on a phone. The panel has its own scroll and lists the person's businesses (switch, add, leave) and the business's apps (switch; for the owner, add or turn off an app). It never changes the sidebar's size, the sidebar body holds only the active app's navigation, and the app pills leave the menu. With many businesses the panel searches. Keyboard: Enter or Space opens it, arrows move through it, and Escape returns focus to the header.

## 5. What stays as it is

The backend's capability entitlements, vertical registries, module roles, per-business onboarding storage, the dues and ledger engines and the reminder seam are all sound and stay. The route-level `RequireModule` gate stays. So does the rule that a business type is a preset and never changes behaviour; it stays a Shop setting and is no longer presented as if it chose a product.

## 6. Owner decisions (5 Oct 2026)

1. **The owner assigns apps per person, with a role per app.** A person's access is a list of grants, each one business → app → role. The owner of a business is in every app with full rights and needs no grant. Everyone else holds explicit grants, set on the Team screen ("Ravi: Lending — agent; Shop — staff"). The menu, the switcher, the landing and the permissions follow the grants. This is the model of Atlassian's product access (one site; per-person, per-product access and role) and Zoho One's apps per user.
2. **"Leave" depends on who asks.** The owner turns an app off for the business: the data is kept and the menu goes for everyone. Anyone else removes themselves from that app. Leaving a business is unchanged.
3. **Sign-up does not ask which app.** Everything follows the person's actual grants instead. A new business starts with the Shop, and its owner adds apps from the switcher.
4. **The whole refactor goes first,** one step at a time, and the lending documents follow it.

### 6.1 Rules the owner fixed for the future

- **A business you own and a business you work in are separate contexts.** Each membership carries its own role, grants, permissions, menu and data. Owner rights in one never apply in another, and switching business swaps all of it. The switcher groups them as "Your businesses" and "Where you work". The case the owner gave: "I work here, and I own my side business along with that."
- **One account on yourkhata.com for all of them.** One email and password; every business the person owns or works in is in the same switcher. White-label partners keep their own domains for their own merchants, which is separate.
- **Billing belongs to the business, and its owner pays.** Plans, subscriptions and seats attach to the tenant, never to the user account. A person never pays for a business they only work in; a staff seat is counted on, and paid by, the business that granted it. When payments are built they hang off the business (`tenant.plan`, seats from its memberships and grants), with the owner as payer. This is how Slack and Atlassian bill workspaces and sites.

### 6.2 Reference patterns, by concern

| Concern | Pattern adopted | Seen in |
|---|---|---|
| Identity | one account, many organisations, a separate role in each | Slack, Notion, Atlassian |
| First screen | reopen the organisation and product last used, server-decided | Slack, Notion, Linear |
| Products inside an organisation | per-person product access with a role per product | Atlassian, Zoho One |
| Switching | a floating org/app switcher, outside the product's own navigation | Atlassian app switcher, Slack workspace menu |
| Extensibility | each product registers a manifest (menu, routes, permissions) | Atlassian Forge, Shopify app extensions, Microsoft Teams apps |
| Billing | per organisation, paid by its owner, seats per product | Slack, Atlassian |

## 7. Migration plan

Each step ships on its own on `dev` with tests, a browser QA pass and a commit, in this order. No step breaks a page the previous one left working.

1. **Landing resolver — done.** Server: `selectors/landing.py`, `membership.last_used_at` (migration 0014), `preferred_membership` (last used; then a usable default, so an owner's own half-made side business never takes over a sign-in) and `is_own_draft`, the single definition of "unfinished" (owner, wizard step 1–3; step 0 never). Every session body carries `landing`. Client: `src/types/landing.types.ts`, `view-model/landing.ts`, the one place a landing becomes a path, and `hooks/useGoToLanding.ts`. Removed: `postAuthDestination`, `noTenantDestination`, `resolveActiveTenant`, `PostAuthDestination`, and the hard-coded destinations of both password screens and of the business switch. Tests: `test_landing.py` 12 (each sign-in row of §8), `landing.test.ts`, `SetPasswordPageContent.test.tsx`. Browser: the three reported cases, a new staff login with a temporary password, and a password reset all land correctly; refresh and deep links hold.
2. **App registry and grants, server — done.** `platform_app/apps_registry.py` (`AppSpec`: code, anchor capability, the capabilities a grant covers, entry permission, home, order; `BUSINESS_CAPABILITIES` that belong to no app). The Shop registers from `PlatformConfig`, the Library and Lending from their own `AppConfig`s. `platform_membership_app_grant(membership, app, role)` and `membership.last_app` (migration 0015). `permissions_for` scopes a member with grants to their business role's business capabilities plus each grant's role within that app's capabilities; owners and grant-less (legacy) memberships are unchanged. The session gains `apps`, `active_app`, and `landing.app`/`landing.path`. New endpoints: `POST /auth/switch-app` (remembered per person per business) and `GET`/`PUT /members/{id}/apps` (owner and admin; only an owner gives `admin`; a module role only in its own app; the owner takes no grants; `permissions_version` bumped). Tests: `test_app_grants.py` 16, `test_landing.py` updated, the route matrix declares switch-app.
3. **App registry, client — done (3a).** Each app declares its menu in its own folder (`features/shop/app.ts`, `features/library/app.ts`, `features/lending/app.ts`: code, route prefixes, sections, rows, `shell` capabilities), listed once in `src/modules/appManifests.ts`; the platform's Team and Settings rows are `PLATFORM_NAV_ITEMS`. `useNavigation` is generic: the apps a person may open come from the session's `apps`, the menu is the open app's (the page's app, else the server's `active_app`, else the first), and opening another app's page directly tells the server (`switchApp`). The Shop menu is grouped the way Vyapar and Zoho group it — Home, Customers & suppliers, Sales (bills, estimates, credit notes), Purchases, Items & stock (items, stock summary, low stock), Money, Insight. Removed: `sidebarConfig.ts`, `workspaceMemory.ts` and `ub_workspace` (the app is the server's, so laptop and phone agree), the `Workspace` union, and the top bar's `=== 'shop'` (now `shell.partySearch`). `/dashboard` is the Shop's page: it used to "follow the app the person is in", which made choosing Shop in the switcher bounce back to the app being left; sign-in now lands on `landing.path`, the logo and the not-found page on the open app's first row, and joining a business on that business's landing. Tests: `useNavigation.test.tsx` 11, `appManifests.test.ts` (manifests import only icons and routes; every `app.ts` is listed; unique keys; shared code never names an app), `routes.test.ts` (every manifest row has a page). Browser: each app's menu, the switcher both ways, a deep link into each app, a shared page keeping the menu, sign-in reopening the last app on another width, and a Library-only staff member who sees no switcher, is sent from `/dashboard` to the Library, and is refused Shop bills. Next (3b): separate Customers and Suppliers lists.
4. **Context switcher.** Portalled panel; add and turn off an app; leave a business; the stable sidebar.
5. **Setup scoped to apps.** App setup checklists on each app's home, never blocking; the business-type grid reads as a Shop setting, not a product choice (decision 3).
6. **Words per app.** Shared pages read the active app's terminology.
7. **A new app by registration only.** A guide plus a test app in the test suite that registers a manifest and gets a menu, a home and a landing with no shared file edited.

## 8. Validation matrix

Each row is a test, unit or API, and is walked in the browser at the step that delivers it.

| Scenario | Expected |
|---|---|
| Brand-new user | business creation, then the chosen app's home |
| Existing user, own finished business | their last used app |
| Existing user added to another business | the business they use; the new one in the switcher |
| Existing user given another app | that app in the switcher; landing unchanged |
| Owner of a script-made business (step 0) | the app, never the wizard |
| Owner of a wizard business stopped at step 2 | the wizard at step 3 on sign-in and refresh of the wizard; a deep link opens the page asked for (the business works) |
| Staff of an unfinished business | the app (never a wizard they cannot complete) |
| Several businesses, none default | the chooser |
| Only an invitation | the chooser listing it |
| Temp password | the password screen, then the landing |
| Reset password | the same landing as a sign-in |
| Logout, sign in on another device | the same business and app |
| Refresh and deep link | the page itself, with its own app's menu |
| Switching app or business | menu, words and home follow; persists across devices |
| Permission-restricted rows | absent, never disabled |
| Add an app / turn off an app | appears / disappears for everyone; data kept |
| 50 businesses on a 600 px window | the sidebar never scrolls; the panel does |
| Renaming one app | no other app changes |
| A new app | registered, not copied |
