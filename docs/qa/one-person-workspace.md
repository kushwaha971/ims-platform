## 16. Unified Detail Page – One-Stop Management Without Further Navigation

Another important UX requirement: **When a user opens any student, customer, borrower, supplier, or contact's detail page, that page should become their primary workspace for managing everything related to that person.**

I do not want users to navigate through multiple additional pages to view information, record payments, send reminders, or check balances.

Think from the perspective of rural and nontechnical users. Their primary goal is to finish daily tasks quickly, not explore complicated page hierarchies.

### A. Library – Student Detail Page

For example, when a library owner clicks on a student, the Student Detail page should be the final destination for managing that student.

On the same page, users should be able to see:

**Student Information**
- Student name, phone number, and membership details.
- Assigned seat and seat availability/status.
- Membership plan, joining date, and expiry date.
- Current membership status.

**Financial Information**
- Total applicable fees.
- Total fees collected.
- Current outstanding balance.
- Next payment due date.
- Overdue fees, if any.
- Partial payments.
- Advance payments, if supported.
- Previous payment history.

**Quick Actions**
- Collect Fees
- Send WhatsApp Reminder
- View or Change Seat
- Renew Membership
- Edit Student Information
- View Payment History

### Example User Flow

A library owner opens Rahul's profile.

<box border radius="xl" padding={3} gap={3}>
  <row align="center" justify="between">
    <row align="center" gap={2}>
      <box background="surface-secondary" radius="lg" padding={2}>
        <icon name="user-round" size="lg"/>
      </box>
      <box gap={1}>
        **Rahul Kumar**
        <text color="secondary" size="xs">Student · Seat A-12 · Active</text>
      </box>
    </row>
    <badge color="success">Active</badge>
  </row>
  <grid columns={3} gap={2}>
    <grid-item>
      <box background="surface-secondary" radius="md" padding={2} gap={1}>
        <text color="secondary" size="2xs">Total Fee</text>
        **₹1,000**
      </box>
    </grid-item>
    <grid-item>
      <box background="surface-secondary" radius="md" padding={2} gap={1}>
        <text color="secondary" size="2xs">Paid</text>
        **₹600**
      </box>
    </grid-item>
    <grid-item>
      <box background="surface-secondary" radius="md" padding={2} gap={1}>
        <text color="secondary" size="2xs">Pending</text>
        **₹400**
      </box>
    </grid-item>
  </grid>
  <row gap={2}>
    <box flex="1" background="rgba(22,163,74,0.09)" radius="md" padding={3} align="center" gap={1}>
      <icon name="wallet"/>
      <text weight="medium" size="xs">Collect Fee</text>
    </box>
    <box flex="1" background="surface-secondary" radius="md" padding={3} align="center" gap={1}>
      <icon name="message-circle"/>
      <text weight="medium" size="xs">Reminder</text>
    </box>
    <box flex="1" background="surface-secondary" radius="md" padding={3} align="center" gap={1}>
      <icon name="history"/>
      <text weight="medium" size="xs">History</text>
    </box>
  </row>
  <divider color="subtle"/>
  <text weight="medium" size="sm">Recent Payments</text>
  <row align="center" justify="between">
    <box gap={1}>
      <text size="sm">Fee payment</text>
      <text color="secondary" size="xs">10 October 2026</text>
    </box>
    **+₹600**
  </row>
  <caption>Illustrative layout only. The implementation should use real application data.</caption>
</box>

If the owner wants to collect the remaining ₹400, clicking "Collect Fee" should open a small dialog or mobile bottom sheet directly on this page.

The dialog should support:

- Any valid payment amount, including partial payment.
- Payment date, defaulting to today but allowing previous dates.
- Payment method.
- Optional note.
- Save action.

After saving, update the student balance, payment history, and status immediately from the authoritative data.

**Do not navigate to another payment page.**

### B. Lending – Borrower Detail Page

When a user opens a borrower, that page should provide:

- Borrower information.
- All active and completed loans.
- Total principal and outstanding amounts.
- Upcoming and overdue repayments.
- Collection history.
- Current repayment status.
- Quick repayment entry.
- Backdated collection entry.
- Send Reminder.
- New Loan action.

If a borrower has multiple loans, the user should be able to select the appropriate loan within the payment dialog without navigating to another page.

### C. Business – Customer and Supplier Detail Pages

**Customer Detail Page**
- Customer information.
- Sales and invoices.
- Total outstanding receivables.
- Amount collected.
- Pending and overdue amounts.
- Payment history.
- Collect Payment action.
- Send Reminder action.

**Supplier Detail Page**
- Supplier information.
- Purchases and bills.
- Total outstanding payables.
- Amount already paid.
- Pending balances.
- Payment history.
- Record Supplier Payment action.
- Relevant payment communication.

All common actions should be accessible directly from the respective detail page.

### D. UdharBook – Contact Detail Page

When opening a personal UdharBook contact, show:

- Contact information.
- Money given.
- Money borrowed.
- Outstanding balances.
- Previous repayments.
- Transaction history.
- Add Money Given.
- Add Money Borrowed.
- Record Repayment or Settlement.
- Send Reminder where appropriate.

Keep personal money transactions separate from organization or module-owned financial records.

### E. Consistent Quick Payment Experience Across Modules

Use a shared, reusable payment-entry UI pattern.

The underlying business logic must remain module-specific.

Every relevant payment dialog should provide:

1. A clearly identified person and financial obligation.
2. Existing outstanding amount.
3. Editable payment amount.
4. Payment date, including backdated entries.
5. Relevant payment method.
6. Optional note or reference.
7. Clear Save action.
8. Immediate refresh of balances and transaction history after success.

Handle advance payments, overpayments, allocation, and validation according to the applicable module's financial rules.

### F. Important UX Rules

- **One detail page should be the main management workspace for that record.**
- No unnecessary nested detail pages.
- No separate pages just for common payment or reminder actions.
- Prefer dialogs, bottom sheets, expandable sections, or inline editing.
- Keep key financial information visible without excessive scrolling.
- Show the most important actions prominently.
- Keep payment history accessible on the same page.
- Use simple labels and intuitive icons.
- Do not create a cluttered page by displaying every possible setting at once.
- On mobile, use a compact card layout with clear primary actions.
- Allow users to return directly to their previous list with their search and filter state preserved.
- Keep advanced configuration in secondary controls when necessary.

### G. Real-World Acceptance Criteria

Test the following workflows:

**Library:** Open student → view pending fee → collect partial payment → see updated balance, all from the same page.

**Lending:** Open borrower → choose loan → add yesterday's missed repayment → see updated balance and schedule without leaving the page.

**Business:** Open customer → collect invoice payment → see updated outstanding amount and payment history on the same page.

**Supplier:** Open supplier → record partial payment → view remaining payable without additional navigation.

**UdharBook:** Open contact → add money-given entry → record settlement → view the updated history on the same page.

**Reminder:** Open any relevant detail page → click Reminder → edit the default message → open WhatsApp with the final text without navigating to another application page first.

### Final Requirement

**YourKhata should follow a "One Person, One Workspace" design philosophy across all modules.**

Once a user opens a student, borrower, customer, supplier, or UdharBook contact, they should be able to complete almost all routine work related to that person from the same page.

Avoid unnecessary navigation, but preserve clear access to complex workflows when genuinely required.

Build this as a consistent, scalable product pattern while keeping each module's financial calculations, permissions, and business logic independent.

**Our goal is not more screens or more features on screen. Our goal is helping users finish their actual work with minimum effort, minimum confusion, and maximum accuracy.**