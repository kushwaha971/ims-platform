# Frontend re-plan — onboarding, design system, and what discovery found

Phase 1 (discovery) is complete: BrandHub's customer portal, BrandHub's tenant
and permission model, and DigiKhaato's current frontend were each read directly.
This is the Phase 2 plan.

Four findings contradict premises in the brief. They are first, because three of
them change what the right answer is, and one of them I will not implement
without an explicit decision.

---

## A. What discovery found

### A1. BrandHub's backend cannot be called by DigiKhaato. "Reuse BrandHub APIs" can only mean "copy the patterns"

BrandHub is a self-contained SaaS with no concept of hosting another product.
Concretely:

* Identity is one user table with a closed enum, `BrandhubUser.x_user_type ∈
  {BHI, BHT, BHPC, BHSC, BHSI}`, and login **rejects** a user whose type does not
  match the `X-User-Type` header. DigiKhaato has no valid value to send.
* JWTs are HS256 signed with `settings.SECRET_KEY` — a symmetric secret, not a
  shareable public key.
* CORS is a hard-coded allowlist of BrandHub hostnames.
* The only cross-service auth is one global `INTERNAL_SERVICE_TOKEN` that grants
  a **full JWT bypass** (`authentication_middleware.py`). Handing that to another
  product would be handing it god-mode over BrandHub.
* `Tenant` means "a BrandHub reseller/wholesale company" — it carries
  `subscription_type`, `affiliate_margins_per_product`, `exact_reseller_code`,
  `mollie_api_key`. It is a commercial entity in BrandHub's domain, not a generic
  workspace.

So DigiKhaato keeps its own Django backend. What transfers is architecture, not
endpoints.

### A2. BrandHub has effectively no backend authorization. Copying its permission model would import a hole

This is the finding that most changes the plan, because the brief asks to reuse
BrandHub's "authentication middleware, services, backend contracts" for a
permission-sensitive flow.

* `TenantCreateView` — the entire onboarding endpoint — is
  `permission_classes = [permissions.AllowAny]`.
* `TenantViewSet` and `TenantListViewset` carry a literal
  `#TODO Add auth classes when handled in FE`. `TenantListViewset.get_queryset`
  returns `Tenant.objects.order_by('-created_at')` — every tenant, unfiltered.
* **No permission class anywhere in BrandHub's backend reads
  `UserGroupFeatureAccess`.** The permission matrix is UI metadata; it is never
  enforced server-side.
* Route protection is `middleware.ts` matching the current path against a
  `featureDetails` **cookie the client holds** — and that cookie is a lossy
  projection that drops `read_access` and `write_access` entirely. Edit the
  cookie and you reach any page in your portal, and the backend will serve you.

"Only a BrandHub Admin can create a tenant" is true in BrandHub only because
only the `/interface` portal renders the button. That is precisely the thing the
brief says is not sufficient — and it is what BrandHub does.

**Plan: copy BrandHub's onboarding _ergonomics_, and write the server-side guard
BrandHub never wrote.** DigiKhaato already has the machinery for this —
`HasPermission`, a closed permission registry, fail-closed tenant scoping — and
it is genuinely better than BrandHub's. It should not be replaced by it.

### A3. `ml-uikit` is real, but DigiKhaato does not have it, and I must not install it from public npm

* In BrandHub it is real: `ml-uikit@1.1.8`, a compiled shadcn/Radix + Tailwind
  library with ~300 exports, present in `node_modules`.
* In DigiKhaato it is **absent from `package.json`, absent from `node_modules`,
  and imported by nothing.** Every `ML*` name resolves to a local stand-in under
  `src/design-system/primitives/`, whose own docstring says the internal registry
  is unreachable from the build environment.

Three of the six reported UI defects are downstream of exactly that: `MLSelect`
is a native `<select>` standing in for a Radix combobox, there is no Radix Dialog
to build a drawer on, and the focus/error interaction was never reconciled
because the real library would have owned it.

**I will not `npm install ml-uikit` from the public registry.** A package of that
name resolves on public npm, and installing a public package that shadows an
internal one is how dependency-confusion attacks land. The legitimate options are
in §C.

### A4. Admin-driven tenant creation is a product pivot, not a bug fix — and it is not what BrandHub does either

DigiKhaato's `POST /tenants` is deliberately `[IsAuthenticated]`, with this
reasoning in the code:

> §12: "any authenticated user". Creating a business is not a permission a
> business grants — it is what a person does before they have one — so the only
> gate is authentication.

The whole product is currently a self-serve merchant ledger: a shopkeeper signs
up and creates their own khata. Moving to "only a Supplier Admin or BrandHub
Admin may onboard a tenant" removes self-serve signup and makes DigiKhaato a
back-office-provisioned product.

That may well be what is wanted. It is a decision about what the product is, it
contradicts a written decision, and it invalidates parts of the existing spec
(DEC-001, the MVP scope, the personas). **This is the one item I will not start
without an explicit answer.**

---

## B. Root causes of the reported defects — all six traced

| # | Symptom | Root cause |
|---|---|---|
| a | Dark theme by default | Three compounding. `THEME_INIT` (`app/layout.tsx:36`) falls back to `prefers-color-scheme`, not light. `systemThemeObserved` re-applies the OS preference because `themeSlice.explicit` is stuck `false` — **`themeChanged` has zero dispatchers; there is no theme toggle anywhere.** `ThemeProvider.tsx:33-36` then writes that OS-derived value into a 365-day cookie, so it wins forever after. |
| b | Native `<select>` with native chevron | `MLSelect` is a raw `<select>` (`mlFormPrimitives.tsx:104-118`) standing in for ml-uikit's Radix combobox. `ML_CONTROL_BASE` has no `appearance-none`, and `MLSelect` adds `pr-8` — 32px of padding reserved for a chevron that is never drawn. There is no `UbCombobox` and no Radix/Headless/Downshift dependency. |
| c | Indigo focus ring + pink error border together | Two unconditional rules that never learned about each other. `app/globals.css:46-50` applies `--focus-ring` to **every** `:focus-visible` with no `:not([aria-invalid])` guard; `ML_CONTROL_TONE` applies `border-formError` with no focus-awareness. A focused invalid input paints, inside out: 1px `#A3123E`, a 2px card-coloured spacer, then a 2px `#4A47D6` ring. |
| d | Autofill overlaps the form | No autofill handling exists — zero `:-webkit-autofill` rules in the codebase. Made worse by `autoComplete="organization" autoFocus` on step 1 (Chrome opens the list with no user gesture) and by the form living in its own `lg:overflow-y-auto` scroll container while the popup is positioned against the viewport. |
| e | Language resets on refresh | The locale cookie is **write-only from the client's perspective**. `LanguagePicker` writes `ub_locale`; nothing reads it back into Redux. `readCookie()` exists and is never called. `localeSlice` starts at `DEFAULT_LOCALE` every load. `app/layout.tsx` reads the cookie server-side for `<html lang>` only — so `lang="hi"` is correct while the UI renders English. |
| f | No mobile navigation | `UbSidebar` is `hidden … lg:flex`. `UbDrawer` and `UbBottomNav` do not exist — no directories, no files. `useNavigation()` computes `bottomNav` and **no component consumes it.** Below 1024px there is no way to reach any route except by typing the URL. |

Two further defects found that were not reported:

* **`/onboarding/*` has no route guard at all.** It is not in `APP_ROUTE_PREFIXES`
  so `proxy.ts` waves it through, and `app/(auth)/layout.tsx` does not mount
  `RequireSession`. An anonymous visitor can load and fill the entire wizard; it
  only fails at `POST /tenants`.
* **The frontend permission machinery is dead.** `<Can>` is rendered in **zero**
  places. `usePermissions()` has one consumer using one of its three methods. The
  only live permission effect is nav filtering — which is `lg`-only, so it has no
  effect on mobile.

### How BrandHub solves (c), quoted, because it is the model to copy

BrandHub's portal **never uses a focus ring on a form control.** Focus is a
border-colour change only. The triplet appears in five independent places:

```
focus-visible:border-foreground focus-visible:outline-none focus-visible:ring-0
```

and ml-uikit's own `MLInput` keeps the error colour on focus with
`aria-invalid:focus-visible:border-[#ff3b30]`. That is the whole fix: remove the
ring from controls, express focus as a border, and let the error border win when
both apply.

---

## C. The three decisions — ANSWERED 21 Sep 2026

| # | Question | Decision |
|---|---|---|
| C1 | Relationship to BrandHub | **Separate product, BrandHub patterns.** DigiKhaato keeps its own Django backend and its own auth. BrandHub is a reference, never a callee. |
| C2 | Tenant creation | **Keep self-serve, add admin provisioning alongside.** A merchant still signs up and creates their own khata; a Supplier/Platform Admin can additionally create tenants and invite the first user. DEC-001 and the MVP scope stand unchanged. |
| C3 | `ml-uikit` | **Vendor the licensed copy** from BrandHub's `node_modules` into DigiKhaato. No public-npm install. |

The original framing of each, for the record:

### C1. What is DigiKhaato's relationship to BrandHub?

### C1. What is DigiKhaato's relationship to BrandHub?

* **Separate product, BrandHub patterns** — DigiKhaato keeps its own Django
  backend and its own auth; we copy BrandHub's component architecture, form
  patterns, layout and state conventions. (This is the only option discovery
  supports; A1 rules out calling BrandHub's APIs.)
* **DigiKhaato becomes a BrandHub portal** — a much larger piece of work,
  requiring changes inside BrandHub (a new `x_user_type`, CORS, tenant model).

### C2. Self-serve signup, or admin-provisioned tenants?

* **Keep self-serve, add admin provisioning alongside** — a merchant can still
  sign up; a Supplier/Platform Admin can additionally create tenants and invite
  their first user. Nothing existing breaks. This is my recommendation.
* **Admin-only** — remove self-serve. `/signup` goes away or becomes
  invitation-only. Contradicts DEC-001 and the MVP scope, which then need
  amending.

### C3. `ml-uikit` — how do we get it legitimately?

* **Copy from your BrandHub `node_modules`** into DigiKhaato and commit it, or
  publish it to a private registry you control. Your licensed copy; no
  dependency-confusion risk. Fastest path to real comboboxes, dialogs and drawers.
* **Build the missing primitives locally** on Radix (`@radix-ui/react-select`,
  `-dialog`) — honest, no vendoring, but it is work the real library already did
  and the result will drift from BrandHub.
* **Not an option:** `npm install ml-uikit` from public npm.

---

## D. The plan, once those are answered

Ordered so that each step is independently shippable and testable.

**Step 1 — Design-system foundations** (blocked on C3)
Get real primitives in. Then fix the focus/error model globally: scope
`:focus-visible` off form controls, express focus as a border change, let the
error border survive focus. One change fixes defect (c) everywhere at once.

**Step 2 — Theme** (independent)
Light as the true default: `THEME_INIT` falls back to `light`, not the OS. Only
persist the cookie when the user chose explicitly (`explicit === true`). Add the
theme control that `themeChanged` has been waiting for. Keep the blocking script
so there is no flash.

**Step 3 — Language** (independent)
Read `ub_locale` back into the store during app init, before first paint —
mirroring BrandHub's `initApp()`, which restores language as its very first act.
Delete the dead `readCookie` or use it. Reconcile the `localeSlice` docstring,
which currently claims a localStorage path that does not exist.

**Step 4 — Responsive navigation** (blocked on C3 for the drawer primitive)
`UbDrawer` + a menu trigger in the mobile header, consuming the `bottomNav` that
`useNavigation()` already computes. Verified at 360, 390, 768, 1024, 1440, 2560
and 3840.

**Step 5 — Form and dropdown correctness** (blocked on C3)
`UbCombobox` on a real listbox: positioning, width, scroll, keyboard, mobile.
Replace the native selects (state picker, language picker). Reserve error space
so messages do not shift layout. Add the `:-webkit-autofill` handling that does
not exist, and reconsider `autoFocus` on an `organization` field.

**Step 6 — Permissions, for real** (blocked on C2)
Guard `/onboarding/*` in `proxy.ts` and with `RequireSession`. Make `<Can>` and
`usePermissions` actually used. Backend: a permission class on tenant creation if
C2 says admin-only. Verified by attempting the API directly as an unauthorized
role, not by checking that a button is hidden.

**Step 7 — Admin onboarding flow** (blocked on C1 and C2)
Tenant list → create → configure → invite first user, following BrandHub's
resumable-wizard shape (`draft` flag + a server-held list of completed steps, so
a half-finished tenant reopens with steps ticked) but with DigiKhaato's
fail-closed permission model rather than BrandHub's absent one.

---

## E. On end-to-end testing

The criticism is fair and accepted. The onboarding UI was built and shipped
without ever being run against a live backend in a browser — which is exactly why
the defects above surfaced on first review rather than before it.

For the record, the loop does work when applied: running the two tiers together
for the first time found the CORS preflight failure that made sign-in impossible
and the `/login` redirect loop, neither of which any test could reach. It was not
applied to the onboarding screens.

From here, every step above ends with: Docker backend up, frontend up, real
browser, real journey per role, screenshots at every breakpoint, network and
console inspected, backend logs read, and the issues found fixed before the step
is called done. Not compiled, not unit-tested — run.

**Two things I cannot do, stated now rather than discovered later:**

1. **Figma.** I have no Figma file or link. Pixel comparison against Figma is not
   possible until one is shared; I can compare against BrandHub's running portal
   and its design tokens instead, and will say which of the two I checked.
2. **2K/4K "testing" is a viewport simulation**, not real hardware. I can render
   at 2560×1440 and 3840×2160 and inspect layout, but I cannot speak to physical
   DPI rendering.


---

# Progress — 21 September 2026

All six reported defects are closed, each verified in a browser against the live
stack rather than by reading code.

| # | Defect | State |
|---|---|---|
| a | Dark theme by default | **Fixed.** `THEME_INIT` falls back to light, not the OS. `systemThemeObserved` deleted — it is what made the OS authoritative, and no version of "the OS decides unless overridden" is compatible with "light is the default". Cookie renamed to `ub_theme_choice` because its meaning changed. A theme picker exists, so `themeChanged` finally has a dispatcher. Harness forces `colorScheme: 'dark'` so this cannot regress on a light CI machine. |
| b | Native `<select>` and chevron | **Fixed.** ml-uikit vendored; `UbSelect` is the Radix composite and the state field is now `UbCombobox` with a real search box. Verified: popover width equals trigger width (438/438, 324/324), typing "mah" narrows 38 states to five. |
| c | Indigo ring + pink error border together | **Fixed**, BrandHub's way: no ring on a form control, focus is a border-colour change, error survives focus. Measured: focused + invalid reports `rgb(163,18,62)` with no box-shadow, on both the select and a plain input. |
| d | Autofill overlapping the form | **Fixed.** `autoComplete="organization"` on an autofocused field opened Chrome's address book on page load — and was the wrong token anyway, since the merchant is naming a new business. Now `off`, plus the `-webkit-autofill` styling that did not exist anywhere. |
| e | Language resets on refresh | **Fixed.** The cookie was write-only from the client's side; `readCookie()` had zero callers. `PreferencesBootstrap` restores in a layout effect, so it lands before paint rather than flashing English. |
| f | No mobile navigation | **Fixed.** `MobileNavDrawer` on vaul, sharing `NavSections` with the rail so the two cannot drift. Verified at 360, 390 and 768: opens with all 11 links, Escape closes, following a link closes. |

Plus two that were not reported:

* **`/onboarding/*` had no route guard at all** — absent from the proxy's list and
  with no `RequireSession`. Now guarded through `SESSION_ONLY_ROUTE_PREFIXES`,
  which exists because onboarding needs a session and must *not* need a tenant.
* **Forms jumped on validation.** A field with no hint had no message row, so the
  first failed submit pushed everything below it down the page. Measured after:
  0px movement, 0.0000 cumulative layout shift.

## Standing evidence

Two harnesses, both run against the live stack:

* `e2e/journey.mjs` — 72/72 across eight viewports (360 → 3840 plus a
  short-height case). Fails on console errors, page errors, failed requests,
  unexpected 4xx/5xx and redirect loops.
* `e2e/security.mjs` — 10/10. Every case checked on both tiers: a browser typing
  the URL, and the API called directly with no cookies and no browser to redirect.

Gates: 719 frontend tests, 715 backend, lint and type-check clean, production
build green, bundle gate green.

## What remains

* **Step 7 — admin tenant onboarding.** The largest piece: tenant list, create,
  configure, invite the first user. Needs backend work too (an invitation entity
  with a real pending/accepted/expired lifecycle, which BrandHub does not have,
  and an admin permission on tenant creation).
* **`<Can>` is still rendered nowhere**, deliberately. No permission-gated control
  exists in the product yet; wiring it in would be inventing a use for machinery
  that is already correct.
* **Figma.** Still no file or link, so no pixel comparison has been made or
  claimed. Comparison has been against BrandHub's tokens and conventions only.
