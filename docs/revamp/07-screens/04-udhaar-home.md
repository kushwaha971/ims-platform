# Udhaar book entry point · People · `/khata`

| Field | |
|---|---|
| Purpose | A standalone khata like a paper book: who owes me, whom I owe, and add an entry in two taps. |
| Who and when | Any shopkeeper or person keeping personal credit; often opened just to add one entry and close. |
| Phone layout | Header "Udhaar book", search, bell. **Summary bar** (two figures side by side, never netted into one): "You will get ₹12,400 · from 18 people" (green) and "You will give ₹3,200 · to 4 people" (red). Chips: All · You will get · You will give · Settled. People list: name, last entry ("2 days ago · You gave ₹500"), amount on the right with its direction word under it ("you will get"). Extended FAB "+ Add person" above the bottom bar. |
| Desktop layout | Sidebar; summary as two stat cards; table with Name, Mobile, Last entry, Amount + direction, Remind; row opens the person on the right half (split view at ≥ 1280 px) or the full person page. |
| What matters most | the two totals → search → the list sorted by most recent activity. |
| Components | existing `PartyListPageContent` (book `main`), `UbStatSummary`, `UbFilterChip`, `UbDataGrid` card mode, `UbFab`, `UbAmount` (sign never inside the number, §23.2.6). |
| Main / other | open a person (→ docked You gave / You got) / add person, remind, filter. |
| Wording | Only this app says You gave / You got (DEC-019). Every amount carries its direction in words, not only colour: "₹500 · you will get". Hindi: "आपको मिलेंगे" / "आपको देने हैं". |
| States | **First use**: "Write your first udhaar" with one button "+ Add person" and a one-line example. **Search no match**: "No one called 'ramesh' · + Add Ramesh". **Loading**: list skeleton (warm-up already starts this request, `AppRouteWarmup`). **Error**: list-level retry. **Offline**: cached list readable (service worker caches `/parties`); adding an entry says it needs a connection unless the offline queue covers it. |
| Accessibility | each row reads "Anita Verma, you will get 445 rupees, last entry 2 days ago". |
| Must keep working | `?book` handling (anything but `shop` reads Udhaar), the URL filters (`usePartyListUrl`), tags filter, warm-up claim-once. |
| Fewer taps | person page opens with the docked You gave / You got pair; amount field focused with numeric keypad (the `autoFocus` dialog fix already in). |

Tracking: problems — reuses the Shop list component, so wording must be per book · decisions — two totals never netted · dependencies — none · risk — low · approval — pending · build — not started · tests — parties e2e, ledger e2e, statement e2e · outcome — —
