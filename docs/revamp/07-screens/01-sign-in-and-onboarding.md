# Sign in and onboarding

## Sign in · `/login` and `/signup`

| Field | |
|---|---|
| Purpose | Get a person into their business with a mobile number and a 4-digit code (DEC-013/014). One flow for new and returning people. |
| Who and when | Owners and staff, often on a cheap phone, sometimes on a weak network, often the first time they see the product. |
| Phone layout | Logo and one line ("Your shop's accounts, on your phone") at the top; **Mobile number** field (`UbPhoneInput`, +91 fixed, numeric keypad, 16 px text); one marigold button "Get code" docked above the keyboard; small links: "Sign in with email" (to `/login/email`), privacy and terms. Language chip (English · हिंदी) top right. |
| Desktop layout | Centred card 420 px on a white page, the same fields; a quiet illustration panel on the left at ≥ 1280 px only. |
| What matters most | the number field → the button → the language switch. |
| Components | `UbPhoneInput`, `UbButton`, `UbLink`, `UbChoiceChips` (language), existing `OtpSignInPageContent`. |
| Main / other actions | Get code / switch language, use email. |
| Navigation | After the code: the server's `landing` (last app's home); a first-time person goes to onboarding step 1. |
| States | **Sending**: button "Sending code…", field locked, no second request. **Wrong number format**: inline "Enter a 10-digit mobile number" only after leaving the field or pressing the button. **Too many tries** (OTP throttle 5 / 10 min): "Too many tries. Try again in 8 minutes." with the time from the server. **No internet**: "No internet. Connect and try again." The typed number is kept. |
| Accessibility | Label "Mobile number" visible, `autocomplete="tel-national"`, `inputmode="numeric"`; error tied with `aria-describedby`; 44 px targets. |
| Must keep working | `/login/email` for console and older accounts; e2e harnesses sign in there. Message Central called only from the server. |
| Fewer taps | Number is remembered on this device after a successful sign-in (prefilled, editable). |

## Code entry (same route, step 2)

| Field | |
|---|---|
| Purpose | Confirm the code. |
| Phone layout | "Enter the code sent to 98765 43210 · Change"; 4 boxes (`UbOtpInput`), Android SMS autofill (`autocomplete="one-time-code"`); auto-submits on the 4th digit; "Resend code in 0:42" counting down from the server's 60 s. |
| States | **Checking**: boxes locked, small spinner under them. **Wrong code**: boxes shake once (not with reduced motion), clear, message "That code didn't match. Try again." **Expired**: "This code has expired. Get a new one." with the resend button enabled. **Success**: brief check, then the landing screen's skeleton at once (no blank white). |
| Must keep working | 60 s resend enforced by the server; 90-day sliding session. Code length should come from the server (PRODUCT-REVIEW G2). |

## Email sign-in · `/login/email`, password reset, set password, accept invite
Kept as they are in function. Visual alignment only: same card, same button and field sizes, same error wording style. Not linked from the main flow except "Sign in with email".

## Onboarding · `/onboarding/step/1…4`

| Field | |
|---|---|
| Purpose | Set up a business in under two minutes: name, which apps, and only the questions those apps need (DEC-016). |
| Who | A new owner, right after the first code. |
| Phone layout | Full-screen steps with a thin progress bar ("Step 1 of 3") and Back. **Step 1**: business name; "What do you want to use?" as large tiles from `GET /onboarding/apps` (icon, name, one plain line: "Shop — bills, stock, customers"; "Udhaar book — who owes you"; "Library — seats, fees, students"; "Lending — loans and collections"). Multi-select; at least one. **Step 2** (only if Shop chosen): business type grid. **Step 3**: address and GST, both skippable ("Add later"). **Done**: a summary of what was switched on and one button per chosen app: "Open Shop". |
| Desktop layout | Same steps in a 640 px centred column; tiles 2 per row. |
| Components | existing `OnboardingStepPageContent`, `AppChoiceGrid`, `BusinessTypeGrid`, `PresetSummaryCard`, `UbStepper`, `UbPressable`. |
| States | **Saving a step**: Continue shows busy; the step is saved before moving on so a reload resumes (existing `tenants/resumable`). **App list failed**: "Couldn't load the app list. Try again." with retry; never a hard-coded list. **Only one app offered** (partner limits): the tile is pre-selected with a line saying so. |
| Accessibility | Tiles are checkboxes with visible check marks; headings per step. |
| Must keep working | `POST tenants {apps}`, `business_type` only with Shop, `apply_preset` governs Shop capabilities only; never give a module that wasn't chosen. `e2e/onboarding-apps.mjs` 186 checks. |
| Fewer taps | Steps not needed by the chosen apps are skipped entirely (today step count is fixed at 4). |

## First use of an app · `AppSetupCard`

On the first open of each app, its home shows a short setup card instead of empty figures: three steps with checkmarks (e.g. Library: "Add seats and shifts · Add your fee plans · Enrol your first student"), each a link to the existing screen, and "Do this later". Disappears when done or hidden (existing `apps/{code}/setup` + `/hide`). Empty dashboard cards are hidden until there is data (PRODUCT-REVIEW).

Tracking (whole file): problems — fixed 4 steps, no remembered number, landing for non-Shop businesses · decisions — skip unneeded steps, server-sent code length · dependencies — `landing` resolver (BP-07) · risk — low · approval — pending · build — not started · tests — onboarding-apps e2e, credentials e2e · outcome — —
