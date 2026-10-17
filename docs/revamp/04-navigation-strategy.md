# 04 · App-wide navigation strategy

Status: **proposed; N-1 (the phone App button) approved by the owner 17 Oct 2026**, 17 Oct 2026.
Builds on `docs/mobile-redesign/03` and `docs/platform/14`; replaces neither, changes the parts named here.

## 1. The model in one picture

```
Business  (Shree Ganesh Kirana)            ← chosen at sign-in, changed rarely
  └─ App  (Shop · Udhaar book · Library · Lending)   ← changed often by multi-app people
       └─ Section  (Home · Bills · Customers · …)    ← changed all the time
            └─ Screen → sheet / drawer / dialog
```

Each level gets one control, and the controls don't move between screens.

| Level | Phone | Desktop |
|---|---|---|
| Business | top of the App sheet (below) and `/switch` | sidebar header menu (existing `TenantSwitcherMenu rail`) |
| App | **5th bottom-bar slot: the App button** (new) | sidebar: app list at the top of the rail (changed) |
| Section | bottom-bar tabs (existing, 4 per app) | sidebar rows of the active app (existing) |
| Screen | header title + Back | page header + breadcrumbs on detail pages |

## 2. Phone: the App button (N-1, approved)

**Today**: 4 app tabs + More. Switching app is inside the header's business menu.

**Proposal**: the 5th slot stays where More is, but becomes the **App button**:
- Its icon is the active app's own icon, its label is the active app's short name ("Shop", "Udhaar", "Library", "Lending"), with a small ▴ mark. So the bar always says which app you are in.
- Tapping it opens one bottom sheet, the **App sheet**:
  1. **Apps** — a 2 × 2 grid of the apps this person can open (from the session's accessible apps; never a module they lack). The active one is filled teal with a check. Each tile shows one live figure from its own book only (e.g. Library "6 fees due", Shop "₹18,450 to collect"), when the person's role can see it.
  2. **More in Shop** — the rows that used to be on `/more` for the active app.
  3. **You** — profile, language, theme, devices, sign out; the business name with "Switch business".
- One tap from any screen to any app; two taps to any More row. Reachable with a thumb.
- **A person with one app** sees "More" in that slot, exactly as today, and the sheet has no Apps grid.

Why not a 6th tab: five is the comfortable maximum for labelled tabs at 320 px (mobile-redesign/02, Material guidance); a sixth would shrink every label in Hindi. Why not keep switching in the header: the header is at the top of a tall phone and holds the business menu, so apps and businesses get mixed up (platform/14 R-findings).

Alternative B (rejected unless the owner prefers it): 3 tabs + App + More. It costs every app one tab, and the Shop's Customers/Suppliers split (owner decision) needs both tabs.

### Switching behaviour
- **Keeps your place per app.** Switching to Library opens the Library screen you last had open (top-level screens only), not always its Home. Stored per business per app in session storage; falls back to the app's home.
- **Never loses work.** If the current screen has unsaved changes (the existing draft/unsaved guard), switching asks "Leave without saving?" first; Shop bill drafts are already kept (draft recovery, shop-ims 09).
- **No full reload.** It is a client navigation (`router.push`) inside the same shell, with the route-level loading state from 05 shown at once.
- **Shared screens follow the app you came from.** `/parties/[id]`, `/payments`, `/expenses` keep using `history.state.yourkhataApp` (existing `historyApp.ts`).

## 3. Desktop: the sidebar

**Today**: dark rail, business/app menu at the top, the active app's sections below.

**Proposal**:
- Top: business name with a menu (switch business, settings) — existing.
- Then an **Apps** group: one row per accessible app with its icon. The active app is expanded and shows its sections indented below it; the others are collapsed rows. Clicking a collapsed app opens it (with the same "keeps your place" rule). This puts the module hierarchy in the rail without a menu to open.
- Active section: teal-on-dark band with a marigold left edge (Counter Mode v5).
- Bottom of the rail: Settings and Team (existing `PLATFORM_NAV_ITEMS`).
- Collapsible to icons at 1024–1279 px; keyboard: `Ctrl K` opens search, `g` then a letter jumps to a section (later, optional).
- Desktop does **not** get a bottom bar or an App sheet.

## 4. Header rules

| | Phone | Desktop |
|---|---|---|
| Top-level screen | app name and screen title left; search and bell right | page title; search, bell, account right |
| Detail screen | Back arrow + the record's name (e.g. "Anita Verma"), ⋯ menu right | breadcrumb "Customers › Anita Verma" |
| Editor | Close (×) + "New bill"; Save lives in the bottom dock | same title; Save in the page footer dock |
| Safe area | header padded by `env(safe-area-inset-top)` in standalone mode (fixes A-14) | n/a |

## 5. Back

- Back goes to the **parent screen** of the current one inside the app (existing `upHref`), not browser history, when the history entry is outside the app or absent. This fixes "Back can leave the app" (PRODUCT-REVIEW P1).
- Android system back closes an open sheet or dialog first, then goes back.
- From an app's home, Back on Android leaves the app (expected system behaviour); it never jumps to another app.

## 6. When the bottom bar shows

Kept from today (`mobileNav.ts`), with one change:
- Shown on top-level screens and lists, and on read-only detail pages.
- Hidden on editors (`/new`, `/edit`), full-screen pickers, and the person page, which has its own docked actions.
- **Change**: hidden while the on-screen keyboard is open on any screen (visual viewport shorter than the layout viewport by more than 150 px), so docked Save bars sit right above the keyboard and nothing overlaps. Needs device testing.

## 7. Notifications (N-2)

- **Desktop: a popover** from the bell (380 px wide, anchored under it), not a modal. Contents: unread count in the title, the latest 8, unread dot and bold title, type icon, relative time, one action button where the notification has one, "Mark all as read", and "See all notifications" → `/notifications`.
- **Phone: a page** `/notifications` (new route, same data). Full-height list, Back to where you were, pull-to-refresh, "Mark all as read" in the ⋯ menu, filter chips All · Unread. The bell in the header opens it.
- Tapping a notification marks it read and opens its screen; if the screen belongs to another app the person can open, it switches app (with the unsaved-changes rule).
- Same endpoints, same 60 s polling (owner directive: in-app list, no push). No backend change. Full spec: 07-screens/07-notifications.md.

## 8. Where things start

- **PWA start**: `start_url` becomes `/` and the server sends the person to their **last used app's home** (the existing `resolve_landing` path, platform/14), instead of always `/dashboard` (fixes A-05, A-12). Needs a change to `proxy.ts` to send signed-in people through the landing resolver; no API change if `resolve_landing` already returns the app home (verify in Phase 1).
- **PWA shortcuts**: built per app is not possible in a static manifest, so shortcuts become generic: "New bill" (Shop), "Udhaar entry" (khata), "Receive fee" (Library), "Collect" (Lending) — each guarded by `RequireModule`, so a person without that app lands on a friendly "Not in your apps" screen. Decision R-DEC-05 in 12.

## 9. Profile and account (A-13)

A **You** page (`/account`, new route, presentation only): name, mobile, role in this business, language, theme (Light · Dark · Same as phone), devices, sign out. It reuses the existing session, `useAccountActions.setTheme` and devices service. Business settings stay in Settings. On phones it is reached from the App sheet; on desktop from the account menu.
