## 17. Seat Management – Occupancy, Shift-Based Allocation, Student Listings & Smart Availability

I noticed another important improvement required in the Library module's seat management workflow.

I want the seat management system to be **simple, intuitive, and intelligent**, without unnecessary filters, complicated navigation, or extra pages.

Think like a Senior SaaS Product Architect and UI/UX Designer, considering the actual daily operations of a library owner in India.

### 1. Seat Selection – Show All Assigned Students

When a library owner clicks on any seat, the system should display **all students currently assigned to that seat**, along with their relevant details.

For example, suppose Seat A-12 is used by three students across different shifts:

- Morning Shift (6 AM–12 PM): Rahul
- Afternoon Shift (12 PM–6 PM): Priya
- Evening Shift (6 PM–12 AM): Amit

When the owner clicks Seat A-12, show all three students on the same screen, including:

- Student name and contact information.
- Assigned shift and timings.
- Membership status.
- Fee payment status.
- Membership start and expiry dates.
- Seat assignment details.
- Relevant quick actions.

Clicking any student's name or card should navigate directly to their **Student Detail Page**, where all student-related information, fee collection, reminders, and other actions are available.

Do not introduce unnecessary intermediate pages.

### 2. Seat Occupancy Must Be Calculated Dynamically

A seat may have different numbers of students depending on its assigned shifts and availability.

Examples:

| Seat | Assigned Students   | Occupancy        |
| ---- | ------------------- | ---------------- |
| A-01 | No students         | Empty            |
| A-02 | 1 of 3 shift slots  | Partially Filled |
| A-03 | 2 of 3 shift slots  | Partially Filled |
| A-04 | 3 of 3 shift slots  | Fully Occupied   |
| A-05 | 1 full-time student | Fully Occupied   |

**Important:** Occupancy must be calculated using actual time-slot availability, not simply the number of students assigned to a seat.

A seat with one full-time student may be completely unavailable, whereas a seat with two students in separate shifts may still have one available shift.

### 3. Simple Default Listing and Filters

By default, show **All Seats**, regardless of their occupancy.

Provide only essential filters:

- All Seats (default)
- Empty
- Partially Filled
- Fully Occupied

Avoid unnecessary filters and complicated dropdowns.

Each seat card should clearly show:

- Seat number.
- Occupancy status.
- Number of assigned students.
- Available and occupied shifts.
- Relevant assignment information.
- Creation date and creator information where useful, preferably in secondary details rather than cluttering every card.

The interface should make it easy to identify available seats without requiring users to open every seat individually.

### 4. Shift-Based Seat Allocation

Support multiple students using the same physical seat across different, non-overlapping shifts.

For example:

**Seat A-12**

| Shift     | Time       | Student   |
| --------- | ---------- | --------- |
| Morning   | 6 AM–12 PM | Rahul     |
| Afternoon | 12 PM–6 PM | Priya     |
| Evening   | 6 PM–12 AM | Available |

In this case:

- The seat is partially occupied.
- The morning shift is unavailable.
- The afternoon shift is unavailable.
- The evening shift is available.
- Only compatible time slots should be offered during student onboarding.

If the evening shift is assigned to another student, the seat becomes fully occupied for the configured shift schedule.

### 5. Full-Time Seat Allocation

If a student books a seat for the entire operating day, the system must prevent other students from booking that same seat during overlapping hours.

Example:

Seat A-05 is assigned to Rahul for the full operating day.

Expected behavior:

- The seat becomes Fully Occupied.
- All overlapping shift options become unavailable.
- The seat cannot be selected for another student during the existing assignment period.
- Availability should reopen automatically when the assignment expires or is legitimately cancelled, according to the membership and seat-allocation rules.

The same rule must apply in reverse: if a seat already has active shift-based assignments, it should not be available for a full-time booking that overlaps those assignments.

### 6. Smart Seat Availability During Student Onboarding

When adding or editing a student, the seat selection process must automatically validate availability based on:

- Selected shift.
- Shift start and end times.
- Membership start date.
- Membership end date.
- Existing seat assignments.
- Full-time reservations.
- Overlapping time slots.
- Active, future, expired, or cancelled assignments.

**Do not allow users to select a seat that is already fully occupied or unavailable for their selected time slot and membership period.**

Unavailable seats should either be disabled with a clear explanation or hidden when the user is specifically selecting an available seat.

Example:

"Seat A-12 is already booked for the Morning Shift. Please select another seat or an available shift."

Seat availability must be validated on the backend as well as the frontend to prevent double booking if two users attempt to assign the same seat simultaneously.

### 7. Important Edge Cases

Handle the following correctly:

1. A seat has only one assigned student.
2. A seat has two students in different shifts.
3. A seat has three students in three separate shifts.
4. A seat has one full-time student.
5. A student's membership expires.
6. A student changes shifts.
7. A student changes seats.
8. A student renews their membership.
9. Two shift timings partially overlap.
10. Two users try to book the same seat simultaneously.
11. A future booking exists, but the seat is currently available.
12. A library uses custom shift timings instead of predefined morning, afternoon, and evening shifts.
13. A library has different operating hours or overnight shifts.
14. An assignment is cancelled or transferred.

Seat availability must consider both **time and date ranges**, not just the present occupancy status.

### 8. Apply This UX Philosophy Across All Modules

This requirement is not limited to Library seat management.

Wherever YourKhata has a similar allocation, booking, assignment, or resource-management workflow, follow the same principles:

- Show all related records when an item is selected.
- Provide direct access to individual detail pages.
- Display clear availability and occupancy statuses.
- Use minimal, meaningful filters.
- Default to showing all records.
- Prevent conflicting assignments.
- Calculate availability dynamically.
- Avoid unnecessary navigation.

Do not blindly apply seat-specific logic to unrelated modules. Reuse the underlying design principles while respecting each module's business requirements.

### 9. Expected Implementation

Audit the existing seat management and student onboarding workflows.

Verify:

- Current seat data model and assignment relationships.
- Shift configuration and time-slot validation.
- Occupancy calculation logic.
- Student-to-seat associations.
- Membership date handling.
- Frontend seat selection.
- Backend conflict prevention.
- Seat listing and filtering.
- Student detail navigation.
- Mobile responsiveness.
- Concurrent booking protection.

Implement the required improvements and test all relevant scenarios.

### Final Goal

**A library owner should be able to open Seat A-12, immediately see every student assigned to it across all shifts, understand which time slots are occupied or available, and open any student's detail page with one click.**

During student onboarding, the system should intelligently show valid seat options and prevent overlapping or unavailable bookings.

Keep the experience clean, fast, and understandable for rural and nontechnical users.

**The system should handle allocation complexity behind the scenes instead of making users manage it manually.**

Add clear acceptance criteriaDefine occupancy calculation rules
## UX17 implementation rules and acceptance criteria

The owner's latest requirement above changes the existing 4 Oct rule that
expired memberships keep their desks until explicitly freed. An expired
assignment must now stop blocking future availability. Unpaid fees remain
Library dues; freeing a seat must never erase a charge or payment. Suspension
alone does not cancel an otherwise valid reservation.

### Occupancy and booking rules

1. The default seat list describes today in the business timezone and shows
   **All seats**. Its only occupancy filters are Empty, Partially Filled and
   Fully Occupied. Upcoming reservations appear in secondary details; they do
   not make a currently unused seat look occupied today.
2. An assignment is relevant only while its reservation date range applies
   and it has not been cancelled, transferred away or closed. Membership start
   and end dates define the permitted assignment dates; a membership without
   an end remains reserved until an explicit release/closure. Do not infer
   cancellation from an unpaid balance or fee badge.
3. Compare actual half-open time intervals `[start, end)`: a shift ending at
   12:00 can share a seat with one starting at 12:00. Any positive overlap
   conflicts. Compare overnight occurrences across adjacent calendar dates in
   the business timezone, including the final night's next-morning hours.
4. The candidates are the library's active configured shifts, using their real
   times rather than fixed morning/afternoon/evening labels. Existing no-shift
   assignments reserve the whole day and block every overlapping candidate.
   With no configured shifts, the existing whole-day option is the candidate.
5. **Empty:** no assignment occupies the seat on the displayed day.
   **Partially Filled:** at least one assignment occupies it and at least one
   configured shift can still be booked without an overlap.
   **Fully Occupied:** it has a whole-day assignment, or every configured
   candidate shift conflicts with an assignment. Count unavailable *time-slot
   options*, not students; overlapping configured shifts are checked separately
   using their intervals, never treated as independent capacity just because
   their names differ. Do not add an occupancy percentage based on headcount.
6. Onboarding/editing availability answers a different question from today's
   list: the selected shift must be free for the **entire requested membership
   period**. A conflict on any requested date makes that option unavailable,
   even if the seat is empty today. Explain the conflicting seat/shift and
   offer another compatible option directly in the form.
7. A seat's panel lists all current students across shifts, with upcoming
   reservations clearly separated. Show contact, shift times, membership dates
   and status, Library fee status and relevant actions. Student names/cards link
   directly to their Student Detail page; no intermediate detail page.
8. The server repeats date/time availability validation while serializing
   writes for the same seat. Admission, seat/shift changes, renewals, cancellation
   and transfers use the same conflict rule. A rejected operation leaves the
   prior assignment and financial records intact.

### Concrete acceptance cases

- [ ] No holders: Empty; every configured shift is available.
- [ ] One of three adjacent shifts occupied: Partially Filled; two available.
- [ ] Two of three occupied: Partially Filled; one available.
- [ ] All three occupied: Fully Occupied; no candidate can be booked.
- [ ] One whole-day holder: Fully Occupied; every overlapping shift is refused.
- [ ] Existing shift holder: an overlapping whole-day booking is refused too.
- [ ] A partial overlap is refused; touching endpoints remain compatible.
- [ ] Custom and overnight shifts use their real intervals, including a
      previous night's overlap with the following morning.
- [ ] Seat click shows every current student across shifts and direct links,
      without applying a hidden selected-shift filter to that list.
- [ ] Expiry/cancellation releases availability at the reservation's actual end;
      unpaid fees and payment history remain unchanged.
- [ ] A future reservation leaves today's unused seat Empty but blocks the
      conflicting future period in admission/editing.
- [ ] A seat/shift transfer updates both old and new availability atomically.
- [ ] Renewal that would overlap an existing future reservation is refused
      without partially changing dates, fees or seat allocation.
- [ ] Two simultaneous conflicting bookings produce exactly one successful
      assignment; the losing request receives an actionable conflict.
- [ ] Tenant scope and Library permissions apply to all occupant information
      and writes; no money from Shop, Lending or Udhaar book enters fee totals.
- [ ] Desktop 1280 px and phone 360 px show readable statuses, counts and
      available shifts without horizontal overflow or extra navigation.

Use the same test-first, live screenshot, gate and per-item commit workflow
as the QA handoff. This document records requirements and rules; UX17 remains
pending until the above cases are verified against the implementation.
