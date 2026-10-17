# Notifications

Same backend: `GET /notifications?cursor&limit&unread&category`, `GET /notifications/unread-count`, `POST /notifications/{id}/read`, `POST /notifications/read-all`; 60 s polling while visible. No push.

## Desktop popover (bell in the top bar)

| Field | |
|---|---|
| Purpose | Glance at what needs attention without leaving the screen. |
| Layout | `UbPopover`, 380 px wide, max 480 px tall, anchored under the bell, closes on Escape, outside click or opening an item. Header: "Notifications · 3 new", "Mark all as read". Body: latest 8 (one page of the existing list with `limit=8`), each row: type icon (reminder, stock, import, export, support, library), title in bold when unread with a teal dot, one-line body, relative time ("12 min ago"), and an action button where the type has one (e.g. "Open import"). Footer: "See all notifications" → `/notifications`. |
| States | **Loading**: 4 row skeletons. **Empty**: "You're all caught up" with a small check. **Error**: "Couldn't load notifications · Try again"; the unread count stays as last known. **Mark all**: button busy, rows lose bold optimistically, roll back with a snackbar on failure (safe: no money). |
| Accessibility | bell `aria-label` "Notifications, 3 unread", `aria-expanded`; popover is a dialog with a heading; rows are links; focus returns to the bell on close. |

## Phone page · `/notifications` (NEW route)

| Field | |
|---|---|
| Purpose | Read and act on notifications comfortably with a thumb. |
| Layout | Header: Back + "Notifications", ⋯ with "Mark all as read". Chips: All · Unread. Rows as above, 72 px min, grouped Today · Yesterday · Earlier. `UbLoadMore` at the end (cursor paging). Pull to refresh. Bottom bar visible. |
| Opening an item | marks read, opens its route; if the route is in another app the person can open, switches app first (unsaved-changes guard); if not, shows "This is from Library, which isn't one of your apps." |
| States | as the popover, plus offline: last loaded list with "No internet" strip. |

Tracking: problems — modal everywhere (A-04) · decisions — popover on desktop, page on phones · dependencies — `NotificationList` split (06 §5) · risk — low · approval — pending · build — not started · tests — notification e2e at 390/1280, axe · outcome — —
