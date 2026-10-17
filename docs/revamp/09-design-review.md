# 09 · Design quality review

Status: **round 2 of the foundation review, 17 Oct 2026.** Self-assessed by the design team roles in the brief. A self-assessment is not proof: see §5 for what each score still needs before it counts.

## 1. Rubric

| Category | Weight |
|---|---:|
| Mobile usability and native-app feel | 20% |
| Ease of use and workflow efficiency | 15% |
| Visual quality and consistency | 15% |
| Interaction feedback and perceived speed | 15% |
| Accessibility and clarity | 10% |
| Desktop usability | 10% |
| Production safety and preserving what works | 10% |
| Reuse and maintainability | 5% |

Pass mark: **strictly above 8.6**, for every module and overall.

## 2. What was scored

Only what is specified: the global shell and navigation, sign-in and onboarding, notifications, and the four module entry points (Shop Home, Udhaar People, Library Home, Lending Today). Whole-module scores were deferred until each module's screens were specified (wave 2 and 3, now done); they are in §5a.

## 3. Round 1 (first draft) — failed

| Area | Mobile | Ease | Visual | Feedback | A11y | Desktop | Safety | Reuse | **Weighted** |
|---|---|---|---|---|---|---|---|---|---:|
| Global shell | 8.2 | 8.3 | 8.6 | 8.4 | 8.0 | 8.5 | 8.8 | 8.8 | **8.41** |
| Sign-in, onboarding | 8.6 | 8.5 | 8.5 | 8.3 | 8.4 | 8.4 | 8.9 | 9.0 | **8.54** |
| Notifications | 8.5 | 8.6 | 8.6 | 8.4 | 8.5 | 8.8 | 9.2 | 9.0 | **8.64** |
| Shop Home | 8.4 | 8.6 | 8.8 | 8.2 | 8.1 | 8.6 | 8.2 | 8.8 | **8.45** |
| Udhaar People | 8.6 | 8.8 | 8.6 | 8.4 | 8.3 | 8.4 | 9.2 | 9.2 | **8.64** |
| Library Home | 8.2 | 8.2 | 8.6 | 8.3 | 8.2 | 8.5 | 9.3 | 9.0 | **8.46** |
| Lending Today | 8.5 | 8.3 | 8.5 | 8.3 | 8.2 | 8.3 | 9.2 | 9.0 | **8.49** |

### Why round 1 fell short, and what changed

| Area | Shortcoming | Change made in the spec |
|---|---|---|
| Shell | Keyboard could push docked Save bars under the bottom bar; one-app people would get a useless App button; switching could lose a half-typed form; Back could leave the app | bar hides while the keyboard is open; one-app people get More as today; unsaved-changes guard on switch; Back goes to the parent screen (04 §5–6, 02-global-shell) |
| Shell | Tapping a tab gave no sign of progress (the reported problem) | pending spinner on the tapped tab after 120 ms, route skeletons, top progress line (05 §3) |
| Sign-in | Fixed 4 onboarding steps for everyone; resend and wrong-code states vague | steps skipped when the chosen apps don't need them; explicit sending, wrong, expired and throttled states |
| Notifications | Opening an item from another app had no rule | switch app with guard, or a plain "not one of your apps" message |
| Shop Home | No offline or staff states; Remind depends on a server fix | offline "as of" state, staff lock line; TV-02 named as a dependency and the score capped until it lands |
| Udhaar | Direction shown by colour only in places | every amount carries its direction in words, in both languages |
| Library Home | Seat occupancy buried; reminding needed a second page; first use showed zeros | seats card with per-shift counts (existing data only), Remind on the home row, setup card, figures hidden rather than ₹0 |
| Lending Today | Collect behind an extra tap; no money-safe offline rule; done stops cluttered the list | Collect on the stop card, Collect disabled offline with a reason, done stops collapsed |

## 4. Round 2 (current specs) — passes, provisionally

| Area | Mobile | Ease | Visual | Feedback | A11y | Desktop | Safety | Reuse | **Weighted** |
|---|---|---|---|---|---|---|---|---|---:|
| Global shell | 8.8 | 8.7 | 8.6 | 9.0 | 8.3 | 8.7 | 9.0 | 9.0 | **8.76** |
| Sign-in, onboarding | 8.8 | 8.9 | 8.5 | 8.8 | 8.5 | 8.4 | 8.9 | 9.0 | **8.72** |
| Notifications | 8.8 | 8.8 | 8.6 | 8.8 | 8.6 | 8.9 | 9.4 | 9.2 | **8.84** |
| Shop Home | 8.7 | 8.8 | 8.8 | 8.8 | 8.2 | 8.6 | 8.4 | 8.8 | **8.66** |
| Udhaar People | 8.8 | 9.0 | 8.6 | 8.7 | 8.5 | 8.5 | 9.2 | 9.2 | **8.79** |
| Library Home | 8.7 | 8.7 | 8.6 | 8.6 | 8.4 | 8.6 | 9.3 | 9.0 | **8.71** |
| Lending Today | 8.9 | 8.8 | 8.5 | 8.8 | 8.4 | 8.4 | 9.2 | 9.0 | **8.74** |
| **Foundation overall** (mean) | | | | | | | | | **8.74** |

Shop Home passes by the smallest margin. It is held down by safety (8.4): the design is right, but the app today nets customer and supplier balances (TV-01) and sends Shop reminders through the Udhaar book (TV-02). Until those server fixes land, Shop Home's score is **conditional on them**.

## 5. Which scores are not yet proven

| Score | Needs before it counts |
|---|---|
| Every "Feedback" score | tap-to-first-change and INP measured on the reference phone (05 §5–6) |
| Every "A11y" score | axe sweep at 390 and 1280 in both themes, a TalkBack pass, large system text at 320 px |
| Every "Mobile" score | installed-PWA checklist on a real low-end Android and an iPhone; keyboard detection on iOS |
| Ease scores | the 9-task script with 5–8 shopkeepers (G5) |
| Safety scores for Library and Lending | contract snapshot diff empty and figure parity on a seeded book (02 §6) |
| Shop Home safety | TV-01 and TV-02 fixed on the server |

## 5a. Whole-module scores (17 Oct 2026)

Each module file has its own two rounds with the arithmetic under "## Review". Shop is the mean of its two files.

| Module | Round 1 | Round 2 | Lowest screen in round 2 |
|---|---|---|---|
| Foundation (shell, sign-in, notifications, homes) | 8.52 | 8.74 | Shop Home 8.66 |
| Shop: people and money (08) | 8.42 | 8.74 | Payments list 8.69 |
| Shop: bills, items, reports (09) | 8.48 | 8.75 | Settings 8.71 |
| **Shop** | 8.45 | **8.745** | |
| **Udhaar book** (10) | 8.45 | **8.76** | Reminders 8.66; falls to 8.60 (fail) if the Library and Lending tabs stay (owner question) |
| **Library** (11, look only) | 8.43 | **8.77** | |
| **Lending** (13, look only) | 8.42 | **8.77** | Routes 8.68 |
| **Overall** (mean of foundation and four modules) | 8.45 | **8.76** | |

Every module passes the gate (strictly above 8.6) provisionally. None counts until the checks in §5 and 11 are done: contract snapshot and figure parity for Library and Lending, device timing, the accessibility sweep, the screenshot sweeps (R-DEC-07) and shopkeeper tests. Margins are thin (0.06–0.17), so a single failed check can drop a module below the gate; that is a reason to test, not to round up.

## 6. Strongest criticisms still standing

1. The App button merges switching and More in one sheet. If people don't find other apps there, a dedicated switch (alternative B) costs a tab. Only testing settles it.
2. Desktop got less attention than phones in this round; desktop scores sit at 8.4–8.7.
3. Hindi copy is a draft in every spec.
4. The Library seat card depends on data the home may not already load; if not, it degrades to a total only.
