# 07 · Screen specifications

Every screen gets one section in the file for its area, written with the template below. A screen is **specified** when every field is filled; it is **approved** when the owner says so in [12-decision-log.md](../12-decision-log.md).

## Files and coverage

| File | Screens | Status |
|---|---|---|
| [01-sign-in-and-onboarding.md](01-sign-in-and-onboarding.md) | sign in (OTP), code entry, email sign-in, invite, onboarding steps 1–4, app setup card | specified |
| [02-global-shell.md](02-global-shell.md) | phone bottom bar + App sheet, desktop sidebar, headers, route loading, You page, More, business switch, install and update prompts | specified |
| [03-shop-home.md](03-shop-home.md) | Shop Home | specified (from the Counter Mode design page) |
| [04-udhaar-home.md](04-udhaar-home.md) | Udhaar book People list (its entry point) | specified |
| [05-library-home.md](05-library-home.md) | Library Home (UI only) | specified |
| [06-lending-today.md](06-lending-today.md) | Lending Today (UI only) | specified |
| [07-notifications.md](07-notifications.md) | desktop popover, phone page | specified |
| [08-shop-people-and-money.md](08-shop-people-and-money.md) | customers, suppliers, Shop person page, payments, receipts, cash book, expenses | specified, 8.74 (round 2, provisional) |
| [09-shop-bills-items-reports.md](09-shop-bills-items-reports.md) | sales, bill editor, purchases, items, stock, import, reports, settings | specified, 8.75 (round 2, provisional) |
| [10-udhaar-book.md](10-udhaar-book.md) | person khata, entry sheet, corrections, opening balance, statement, old dues, reminders, archive, tags | specified, 8.76 (round 2, provisional) |
| [11-library.md](11-library.md) | counter, students, student page, seats, fees, attendance, messages, money, books, copies, settings, public page | specified, 8.77 (round 2, provisional), look only |
| [12-shared-overlays.md](12-shared-overlays.md) | every drawer, dialog, sheet and popover pattern, phone vs desktop | specified (scored inside each module) |
| [13-lending.md](13-lending.md) | loans, new loan, loan page, collect, not paid, borrowers, routes, messages | specified, 8.77 (round 2, provisional), look only |

The Counter Mode design page (`/mnt/project-files/shop-design-direction/counter-mode.html`, published artifact) is the visual reference for Shop Home, Receive payment, Customers, bill actions, receipt message, date picker, item search, total bar and Settings. Those wave-2 specs copy their decisions from it rather than redesigning.

## Template

```markdown
## <Screen name>  ·  `<route>`

| Field | |
|---|---|
| Purpose | |
| Who and when | |
| Phone layout | |
| Desktop layout | |
| What matters most (top to bottom) | |
| Components | existing Ub* and feature components; new ones marked NEW |
| Main action / other actions | |
| Navigation in and out | |
| States | loading · empty · first use · error · partial failure · success · offline · no permission |
| Accessibility | |
| Must keep working | (from 02) |
| Fewer taps | |

Tracking: current problems · decisions and why · dependencies · risks · approval · build status · tests · outcome
```
