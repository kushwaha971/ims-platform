# Module-based subscriptions — review and recommendations

11 Oct 2026. Asked for by the owner: review whether the product can later charge
per module, and say what to change. **Nothing here is built, and no payment or
subscription system was added.** This is what exists, where it falls short, and
the order to do things in.

## 1. What exists today (read from the code)

| Thing | Where | What it does |
| --- | --- | --- |
| **Plan** | `platform_plan` (`models/partner.py`) | `code`, `name`, `modules[]`, `limits{}`, `price_inr_month`, `is_active`. Two plans are seeded: `free` (3 users, 200 MB) and `unlimited`; both carry every released module. |
| **Partner** | `platform_partner` | `allowed_modules[]`, `default_plan`. A white-label ceiling above the plan. |
| **Tenant** | `platform_tenant` | one `plan`, one `partner`, `enabled_modules[]` — what the owner has switched on. |
| **Effective entitlement** | `services/entitlements.for_tenant` | modules = plan ∩ partner (+ a per-tenant `modules_extra` override); limits = plan limits with per-tenant overrides. Cached per request. |
| **Per-tenant override** | tenant setting `entitlement_overrides`, written by the platform console | extra modules and changed limits for one business, audited. |
| **Release gate** | `UNRELEASED_MODULES` | a module nobody may see yet (Gym, Hotel) is in no response. |
| **Apps** | `apps_registry.AppSpec` | the unit a merchant understands: Shop, Library, Lending. Each has an anchor module and the capabilities it uses. |
| **Per-person access** | `MembershipAppGrant` | which apps a member is in, and their role in each. |
| **Enforcement** | permission classes and `effective_modules` | a request for a module the tenant does not have is refused (verified on 11 Oct: `/sales/invoices` answers 403 for a library-only business). |
| **Limits** | `assert_can_add_member`, `raise_plan_limit`, `record_limit_hit` | one limit is enforced today, `max_users`; a hit is recorded for the console. |
| **Choice at sign-up and later** | `GET /onboarding/apps`, `POST /tenants {apps}`, `POST /tenants/current/apps` | DEC-016. One service (`set_app_running`) for both. |

So the **entitlement half of a subscription system is already here and is
sound**: one function answers "may this business use this module", every
request goes through it, and there are three independent ceilings (release,
partner, plan) plus a per-tenant override.

## 2. What is missing for per-module billing

1. **A plan is one fixed bundle.** A business has exactly one `plan`, and a plan
   is a list of modules. "Shop on Free and Library on Premium" cannot be said.
   Per-module pricing would need a plan per combination (7 for three apps, 31 for
   five).
2. **No tier inside a module.** A module is on or off. "Library Basic: 50
   members; Library Pro: unlimited, with messages" has nowhere to live.
   `LIMIT_KEYS` is a flat list of platform-wide limits.
3. **No time.** There is no trial end, no paid-until date, no grace period, no
   "cancelled, runs until the 30th". `Tenant.status` is active or suspended for
   the whole business.
4. **No lifecycle per module.** Turning an app off is the owner's choice
   (`set_app_running`); there is no state for "on, but unpaid" — which must NOT
   behave like off (see §4.4).
5. **No record of what was agreed.** `price_inr_month` is one number on the
   plan. There is no price history, no subscription row, no invoice, so a price
   change would silently change what every existing business "pays".
6. **`enabled_modules` mixes two questions**: what the owner wants on, and (by
   intersection at read time) what they are entitled to. That is fine today and
   becomes confusing the day a module can lapse.
7. **The landing page's pricing** (`landingPricing` catalogue, hidden behind
   `SHOW_PRICING`) describes four whole-product plans. It would have to be
   rewritten around apps.

## 3. Recommended model

Keep `for_tenant()` as the single door. Change what stands behind it.

```
platform_product           one sellable thing = an app (shop, library, lending) or an add-on
  code, kind(app|addon), app_code, is_active

platform_price             a product at a tier, with a price that never changes once used
  product, tier(free|basic|pro…), interval(month|year), amount_inr, currency,
  limits{}, features[]      ← e.g. {"library.members": 50}, ["library.messages"]
  valid_from, valid_to      ← a new price is a new row

platform_bundle            several prices sold together at one amount
  code, prices[], amount_inr, interval

platform_subscription      one business's agreement — what was agreed, not what is listed today
  tenant, status(trialing|active|past_due|cancelled|expired)
  current_period_start, current_period_end, trial_end, cancel_at_period_end

platform_subscription_item one row per app the business subscribes to
  subscription, price, status, trial_end, started_at, ended_at
```

and `for_tenant()` becomes: *modules = (capabilities of every app with a live
subscription item) ∩ partner ∩ released, plus overrides; limits and features =
merged from those items' prices, plus overrides.*

Why this shape:

- **Per-module pricing, free and premium modules, feature limits** are all
  `platform_price` rows: a free tier is a price of zero with small limits.
- **Bundles** are a discount over several prices, not a separate entitlement
  path, so "is this module on" has one answer.
- **Trials** are per item (`trial_end`), so a business paying for Shop can try
  Lending for 14 days without its whole account becoming a trial.
- **Upgrades and downgrades** replace one item's price; the old row gets
  `ended_at`. History is kept, which is also what an invoice needs.
- **A price change never touches an existing business**: its item points at the
  old price row.
- **Today's two plans migrate cleanly**: every tenant gets one subscription with
  one free-tier item per app it runs. Nothing a merchant sees changes.

## 4. Rules to decide before any of it is built

1. **The unit sold is the app, not the capability.** A merchant buys "Library",
   never "dues" or "attendance". Shared capabilities (parties, ledger, payments)
   come with any app that uses them and are never billed twice. The registry
   already says which is which.
2. **Limits are named by app** (`library.members`, `shop.invoices_per_month`,
   `lending.active_loans`) and enforced where the row is created, inside the
   transaction — the way `assert_can_add_member` does it and the way the credit
   limit does it in the ledger. A limit checked in the client is not a limit.
3. **Features inside a module are a set on the price**, checked through one
   helper (`entitlement.has("library.messages")`), never by plan code. A plan
   code compared in feature code is how every later price change becomes a
   code change.
4. **A lapsed module becomes read-only; it does not disappear.** The books are
   the merchant's, and for a GST-registered business they must stay readable for
   72 months. So: `past_due` → a banner and full use for a grace period;
   `expired` → reads and exports work, writes are refused with a clear reason and
   one button. Never the 403 an unsubscribed module gets. This is a third state
   beside on and off, and it is the main reason `enabled_modules` (the owner's
   switch) and the subscription (the right to it) must be kept apart.
5. **Downgrades never delete.** Going from 500 members to a 50-member tier keeps
   all 500; it refuses the 501st. Same rule as archiving a party with a balance.
6. **The owner is the only one who changes it**, as with apps today; an
   accountant can see the plan, not change it.
7. **Partners keep their ceiling.** A white-label partner may sell only some
   apps; `allowed_modules` stays above everything.
8. **Trial without a card**, consistent with sign-up needing only a mobile
   number. What happens at the end of a trial must be written on the screen that
   starts it.

## 5. What was done now, because it costs nothing later

- The app is already the unit a merchant chooses, at sign-up and afterwards, and
  both go through one service. That service is where a subscription check will
  go: one place, not two.
- The sign-up list comes from the server (`GET /onboarding/apps`). The day apps
  have prices, that response gains a price and a "free trial" flag per app and
  the screen needs no restructuring.
- A business that chose only Library has no Shop modules. Per-module billing
  would have been wrong from the first invoice if every business secretly had
  the Shop.

## 6. Order of work, when it is wanted

1. `Entitlement.has(feature)` and app-scoped limit keys, with the two existing
   plans expressed in them. No behaviour change. (Small.)
2. The read-only state for a module, behind a flag, with its tests. This is the
   one piece that touches every write path, so it is worth doing before money.
3. The five tables, a migration that gives every tenant a free subscription, and
   `for_tenant()` reading from them. Still no payments.
4. Trials: `trial_end` per item, the banner, the end-of-trial rule.
5. Only then a payment provider, as an adapter (ADR-021: a new dependency needs
   its own ADR), with webhooks drained by the existing job table.
6. The pricing page and the in-app plan screen.

Steps 1 to 4 need no payment provider and no new dependency.

## 7. How comparable products do it

Checked on 11 Oct 2026 from public pages; prices change, so treat the figures as
illustrative and confirm before quoting them.

- **Odoo** asks which app you want when a trial starts; its older flow provisioned
  the instance from that one choice and said more apps could be added later. One
  app is free; paid plans are per user and include all apps.
- **Zoho** sells each app separately, per user, and also a bundle (Zoho One).
  Third-party guides put the break-even at about three to four apps. Admins then
  assign apps to people or groups — the same idea as `MembershipAppGrant`.
- **Khatabook** is described as: mobile number and OTP, then language and
  business name. No module choice, because it is one product.

The pattern worth copying is Odoo's first screen and Zoho's two ways to buy: let
somebody start with one thing for free, price each app on its own, and offer a
bundle that is obviously cheaper once they use three.

Sources: [Capterra — Odoo pricing](https://capterra.com/p/135618/Odoo/pricing/),
[Odoo forum — pricing](https://www.odoo.com/forum/help-1/odoo-pricing-178501),
[Zoho community — Zoho One vs individual products](https://help.zoho.com/portal/de/community/topic/zoho-one-vs-individual-products),
[Zoho One admin guide — app assignment](https://help.zoho.com/portal/en/kb/one/admin-guide/managing-apps/articles/zohoone-app-assignment-methods),
[Aaxonix — Zoho One vs individual apps](https://aaxonix.com/resources/zoho-one-vs-individual-apps),
[Miracuves — how Khatabook works](https://miracuves.com/blog/what-is-khatabook-and-how-does-it-work/).
