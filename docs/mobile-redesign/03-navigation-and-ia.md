# 03 — Mobile information architecture and navigation

## 1. The model

Below `lg` (1024 px), every app gets the same frame:

```
┌──────────────────────────────┐
│ App bar (56)                 │  title or business switcher · search · bell · ⋯
├──────────────────────────────┤
│                              │
│ Content (scrolls)            │
│                              │
│                     [＋ FAB] │  one primary action, if the screen has one
├──────────────────────────────┤
│ Nav bar (64 + safe area)     │  4 destinations + More
└──────────────────────────────┘
```

- **Top-level screens** (the five tabs) show the nav bar.
- **Detail screens** (a khata, a bill, a report) push on top: ← back, a title,
  at most two icons and ⋯. The nav bar hides; a docked action bar may replace
  it.
- **Task screens** (new bill, add party) are full screen with ✕, and a docked
  Save. Leaving with unsaved work asks once.
- **Sheets** carry choices and short forms; **dialogs** carry confirmations.

At `lg` and up nothing changes: the rail, the top bar and every page layout
stay exactly as they are (see `06-implementation-plan.md` §2).

## 2. Tabs per app

Tabs come from each app's manifest (`bottomNav: true`, max 4, ordered), so the
shell still never names an app. The fifth slot is always **More**.

| App | 1 | 2 | 3 | 4 | 5 | FAB on tab 1 |
|---|---|---|---|---|---|---|
| Shop | Home | Parties | Bills | Items | More | — (Quick actions on Home) |
| Library | Today | Students | Seats | Fees | More | Check in |
| Lending | Today | Loans | Borrowers | Routes | More | Collect |

Changes to the manifests this needs:

- **Shop:** add `bottomNav` to `dashboard`; the existing three (customers,
  invoices, items) stay. Suppliers becomes the second segment of Parties rather
  than a tab. (Today `dashboard` is not flagged and `customers` is first.)
- **Library:** unchanged (home, members, seats, fees are already flagged).
- **Lending:** add `lendingRoutes` → four. Messages goes to More.

Badges reuse `AppNavItem.badge` (`overdueReminders`, `lowStock`), which exists
and is also unused today.

## 3. Where every Shop destination goes

Nothing is removed. Each of today's 25 rows has a place, at most two taps from
any tab.

| Today's sidebar row | Mobile home | Taps from any tab |
|---|---|---|
| Dashboard | **Home** tab | 1 |
| Customers / Suppliers | **Parties** tab, segmented | 1 |
| Bills (invoices) | **Bills** tab | 1 |
| Estimates, Sales orders, Challans, Credit notes | Bills tab title switcher · also More › Sell | 2 |
| Items | **Items** tab | 1 |
| Stock summary, Low stock, Price lists | Items ⋯ · also More › Stock | 2 |
| Aging, Reminders | Home › Needs attention · More › Customers & suppliers | 2 |
| Purchases, Purchase orders, Debit notes, Expenses | More › Buy | 2 |
| Payments, Cashbook | More › Money | 2 |
| Reports | More › Reports | 2 |
| Team, Settings | More › Business | 2 |
| Tags (manager) | Parties ⋯ · More | 2 |
| Imports | Parties / Items ⋯ · More › Stock | 2 |
| Business switcher | Home app bar · More › Business | 1 |
| Account, language, theme, sign out | More › You | 1 |
| Search | App bar 🔍 on every tab | 1 |
| Notifications | App bar 🔔 on every tab | 1 |

The More list is **built from the same `sections` `useNavigation()` returns**,
minus the four tab rows, so the sidebar and More can never disagree — the same
guarantee `NavSections` gives the drawer today.

## 4. The header, rebuilt

| Today (phone) | Proposed |
|---|---|
| ☰ · logo · switcher "Sharm…" · 🔍 · 🔔 · avatar | **Home:** switcher (full name + app) · 🔍 · 🔔 |
| | **Other tabs:** large title · (⋯) · 🔍 · 🔔 |
| | **Detail:** ← · title · ≤ 2 icons · ⋯ |

The account avatar and ☰ leave the header: account is in More, navigation is
the bar. The logo leaves too; the business tile on Home is the brand moment,
and a white-label tenant's own mark goes there.

## 5. Key journeys, step counts

Counted as taps from opening the app, best case, current vs proposed.

| Journey | Today | Proposed |
|---|---|---|
| Write "You gave ₹500" to Ramesh | ☰ › Customers › Ramesh › You gave › type › Save = **6** | Parties › Ramesh › You gave › type › Save = **5** (or Home › Gave/got › Ramesh › type › Save) |
| Walk-in bill, two items | ☰ › Bills › + › scroll past 4 fields › item › item › scroll › Save = **8+** | Bills › New bill › Add item › item › item › Done › Save bill = **7**, total always visible |
| Who owes me for 60+ days? | ☰ › Aging = **2** | Home › "bills overdue" = **2** |
| Find Estimates | ☰ › scroll › Estimates = **3** | Bills › title › Estimates = **3** (or More › Estimates) |
| Sign out | avatar › Sign out › confirm = **3** | More › Sign out › confirm = **3** |
| Check the business you are in | read "Sharm…" — **cannot** | read the Home header = **0** |

The proposal is not chosen for fewer taps — several are equal. It is chosen
because the taps are **visible** (nothing hides behind ☰), **reachable** (the
bottom half of the screen), and **labelled** (words, not icon squares).
