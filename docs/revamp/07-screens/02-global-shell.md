# Global shell: navigation, headers, loading, account

Strategy and reasons are in [04-navigation-strategy.md](../04-navigation-strategy.md). This file is the screen-level spec.

## Phone bottom bar · every app screen below 1024 px

| Field | |
|---|---|
| Purpose | Move between the active app's main sections, and reach other apps. |
| Layout | 64 px + bottom safe area, white surface, top hairline. Five slots, equal width, icon 24 px over a label (11–12 px, never cut; Hindi at 320 px checked). Slots 1–4: the app's `bottomNav` rows from its manifest. Slot 5: **App button** (people with 2+ apps) or **More** (one app). |
| Per app | Shop: Home · Bills · Customers · Suppliers · [Shop ▴]. Udhaar: People · Aging · Reminders · (3 tabs, so a 4th slot is free: "Add entry" is NOT put there — actions stay on screens) · [Udhaar ▴]. Library: Home · Students · Seats · Fees · [Library ▴]. Lending: Today · Loans · Borrowers · Routes · [Lending ▴]. Note: Shop's manifest order today is Home, Customers, Suppliers, Bills; the order shown here matches the Counter Mode design page and needs owner confirmation (R-DEC-04). Library's "Members" tab is labelled "Students" only if that is the word the manifest's i18n already uses for that business type — verify; no rename otherwise. |
| Active state | teal icon with a 42 × 26 px teal-wash pill behind it, teal bold label. App button shows the active app's icon and short name. |
| Feedback | pressed: pill darkens within one frame; navigation pending: the target tab's icon is replaced by a small spinner after 120 ms; the page shows its skeleton. |
| Visibility | hidden on editors, full-screen pickers, the person page, and while the keyboard is open (04 §6). |
| Accessibility | `nav` landmark "Main"; current tab `aria-current="page"`; App button is a `button` with `aria-haspopup="dialog"` and label "Apps and more, now in Shop". |
| Must keep working | manifest-driven items, badges, `--ub-nav-offset` lift for docks, FAB and toasts. |

## App sheet · opened from the App button

| Field | |
|---|---|
| Layout | Bottom sheet, up to 85% height, drag handle, closes on swipe down, Back, or tapping outside. Sections: **Apps** (2 × 2 tiles, 88 px tall: icon, name, one figure from that app's own book if the role allows, e.g. "₹18,450 to collect"; active app filled teal with a check) · **More in Shop** (rows: Items, Purchases, Payments, Cash book, Reports, Expenses… from the manifest's non-tab rows) · **You** (profile row with name and business; Language; Theme; Switch business; Sign out). |
| Figures on tiles | Only from data already loaded for that app (dashboard / home caches); if not loaded, no figure is shown rather than a spinner. No new endpoint. |
| Switching | Tap an app tile → sheet closes → target app's last top-level screen (or home) with its skeleton immediately; unsaved-changes guard first. |
| States | one app only: no Apps section, title "More". Owner with apps that can be added: a quiet "+ Add an app" tile leading to the existing add-app flow (owner only). |
| Accessibility | dialog with title "Apps and more"; focus to the first tile; tiles are buttons with `aria-current` on the active app. |

## Desktop sidebar · 1024 px and up

| Field | |
|---|---|
| Layout | 232 px dark teal rail (Counter Mode v5): business name and menu at top; **Apps** group with the active app expanded to its sections and the others collapsed; Settings and Team at the bottom. Collapses to a 64 px icon rail at 1024–1279 px with tooltips. |
| Active | lighter band with a marigold left edge; `aria-current="page"`. |
| Feedback | pressed row darkens; pending navigation shows a small spinner at the row's right after 120 ms and the top progress line. |
| Keyboard | Tab order top to bottom; `Ctrl K` focuses search. |
| Must keep working | `activeNav.ts` longest-prefix matching, permission-filtered rows, `TenantSwitcherMenu rail`. |

## Headers

| Screen kind | Phone | Desktop |
|---|---|---|
| Top level | app icon + screen title; search and bell on the right | title, search field (Shop: party search; others: their existing search), bell, account |
| Detail | Back + record name (wraps to 2 lines, never "Ramesh Trad…") + ⋯ | breadcrumb + title + actions |
| Editor | × + "New bill", Save in the dock | same, Save in the footer dock |

Top safe area padded in standalone mode. The header never scrolls away on phones (sticky), so Back is always reachable.

## Route loading · every navigation

`loading.tsx` per route group with four skeleton families: **home** (figure line + two panels), **list** (search bar + 8 row placeholders), **detail** (header block + tabs + rows), **form** (fields + dock). Shapes match the real screens so nothing jumps (CLS ≤ 0.05). Plus `RouteProgress` (2 px teal line at the very top, appears after 120 ms, finishes on paint). Reduced motion: the line is static.

## You page · `/account` (NEW route, existing data)

Name and mobile (from `auth/me`), role in this business, Language (English · हिंदी), Theme (Light · Dark · Same as phone), Devices signed in (existing devices screen), Sign out. Business settings are not here; they stay in Settings. Phone: from the App sheet; desktop: account menu → "Your account".

## More page · `/more`

Kept as a route for links and bookmarks; its content becomes the same rows as the App sheet's "More in …" and "You" sections, rendered as a page. Single source of rows (06 §5).

## Business switch · `/switch`

Unchanged in function. Visual alignment: list of businesses with role and apps under each name; current one checked; "Add a business" for those allowed.

## Install and update prompts (NEW, presentation only)

- **Install**: after the second successful session on Android Chrome (captured `beforeinstallprompt`), a dismissible card on Home: "Add YourKhata to your home screen · opens faster, works with weak signal · Add / Not now". Never shown in standalone mode; "Not now" hides it for 30 days (local storage, try/catch). iPhone: a one-line hint with the Share icon, shown once.
- **Update ready**: when a new service worker is waiting, a snackbar "A new version is ready · Reload". Never reloads by itself while a form has unsaved changes.

## States shared by the shell

| State | What shows |
|---|---|
| Session expired | sheet "You've been signed out. Sign in again to continue." Unsaved form text kept in the draft store where drafts exist; after sign-in, return to the same screen. |
| No permission for a screen | page "You don't have access to this. Ask the owner." with a button back to the app's home. |
| App not in your apps (old link) | page "Library isn't one of your apps" with "Go to Shop". |
| Offline | existing network strip under the header; cached screens readable; Save buttons say why they are disabled. |
| Server error on a whole page | existing `error.tsx` with "Try again"; partial failures stay inside their panel (existing `unavailable` parts). |

Tracking: problems — A-01, A-03, A-10, A-13, A-14 · decisions — N-1 App button (pending), sidebar app tree, `/account` · dependencies — `UbBottomNav` action item, `useNavigate`, `RouteProgress` · risks — sheet discoverability; keyboard detection on iOS · approval — pending · build — not started · tests — desktop-unchanged, journey, nav e2e at 320/390/768/1280 in both themes · outcome — —
