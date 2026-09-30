'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

import {
  UbBottomBar,
  UbBox,
  UbButton,
  UbCard,
  UbDisclosure,
  UbEmptyState,
  UbPageHeader,
  UbPageShell,
  UbSkeleton,
  UbStack,
  UbStatusBanner,
} from 'src/design-system';
import { usePermissions } from 'src/hooks/usePermissions';
import { useScrolledPast } from 'src/hooks/useScrolledPast';
import { useTranslation } from 'src/hooks/useTranslation';
import { ROUTES, partyStatementPath } from 'src/routes';
import { copyText } from 'src/utils/clipboard';

import { PartyLedgerTimeline } from 'modules/DigiKhaato/features/ledger/components/PartyLedgerTimeline';
import { useLedgerEntryForm } from 'modules/DigiKhaato/features/ledger/hooks/useLedgerEntryForm';
import { useOpeningBalance } from 'modules/DigiKhaato/features/ledger/hooks/useOpeningBalance';
import { usePartyReminder } from 'modules/DigiKhaato/features/ledger/hooks/usePartyReminder';

import { usePartyArchive } from '../hooks/usePartyArchive';
import { usePartyDetail } from '../hooks/usePartyDetail';
import { usePartyForm } from '../hooks/usePartyForm';
import { roleBadgeLabel } from '../view-model/partyRoleDisplay';

import { PartyCollectionDate } from './PartyCollectionDate';
import { PartyDetailHeader } from './PartyDetailHeader';
import { PartyHeaderMenu } from './PartyHeaderMenu';
import { PartyInfoPanel } from './PartyInfoPanel';
import { PartyModulePanels } from './PartyModulePanels';

import type { PartyDetail } from '../types/party.types';

/**
 * PTY-03 — the khata page.
 *
 * ── The half that was waiting for a table has arrived ─────────────────────
 * This shipped without the timeline and without the two quick actions, because
 * `apps/ledger` had a models.py containing a docstring: there was no
 * `ledger_entry` table, so there was nothing to list and a "You gave" button
 * would have opened nothing. LED-01 built the table, so both are here now —
 * the timeline is the ledger feature's own component, and the buttons open its
 * drawer.
 *
 * The transactions card renders a first-use empty state when the party has no
 * entries, and that is still TRUE rather than a placeholder: it means this
 * party has none, not that the product cannot record any.
 *
 * ── What is still NOT here ───────────────────────────────────────────────
 * Three of the five quick actions FRD §7 lists — the invoice, the estimate and
 * the payment against a document — and the statement share link. The first
 * three are about `sales_document` and `payments_payment`, the last about
 * `parties_share_link`, none of which have tables, and the judgement is the one
 * this page was built on: a control that opens nothing teaches a merchant that
 * the product is broken rather than unfinished. LED-06's reminder IS here, in
 * the ⋯ menu, because it needs no table: the merchant sends it themselves
 * through `UbShareSheet` (see `usePartyReminder`).
 */
/**
 * `ssr: false` because a drawer is never part of a server render: it opens on
 * an interaction, so `open` is false in every server pass and there is no
 * hydration mismatch to avoid.
 */
const PartyFormDrawerLazy = dynamic(
  () => import('./PartyFormDrawer').then((m) => m.PartyFormDrawer),
  { ssr: false }
);

/**
 * LED-01's entry drawer, lazily, for the same measured reason.
 *
 * It carries React Hook Form's resolver, the ledger Yup schema and six
 * controls, and the merchant who opened this page to READ a balance should not
 * download them. `ssr: false` because `open` is false in every server pass.
 */
const LedgerEntryDrawerLazy = dynamic(
  () =>
    import('modules/DigiKhaato/features/ledger/components/LedgerEntryDrawer').then(
      (m) => m.LedgerEntryDrawer
    ),
  { ssr: false }
);

/**
 * LED-02's drawer, lazily and for a sharper reason than the other two.
 *
 * It is opened at most ONCE in a party's whole life — a party has one opening
 * balance and then never needs this again — so putting it in the route chunk
 * charges every merchant who ever opens a khata for a form almost none of them
 * will see twice.
 */
const OpeningBalanceDrawerLazy = dynamic(
  () =>
    import('modules/DigiKhaato/features/ledger/components/OpeningBalanceDrawer').then(
      (m) => m.OpeningBalanceDrawer
    ),
  { ssr: false }
);

export interface PartyDetailPageContentProps {
  readonly id: string;
}

/* PTY-04's dialog is opened once in a party's life and read on every visit
   to the khata, so it loads when it opens — the same rule as the party form
   and LED-03's drawers. The write-off form (FR-3) made it the heaviest thing
   on the page that most visits never render: +3 KB on the route, statically. */
/* The reminder sheet loads when it opens, like the archive dialog: carried
   statically, the sheet, its link builders, the clipboard path and now the
   reminders slice cost the khata route on every visit to read a balance. */
const PartyReminderSheetLazy = /* @__PURE__ */ dynamic(() =>
  import('modules/DigiKhaato/features/reminders/components/PartyReminderSheet').then(
    (m) => m.PartyReminderSheet
  )
);

const PartyReminderStripLazy = /* @__PURE__ */ dynamic(() =>
  import('modules/DigiKhaato/features/reminders/components/PartyReminderStrip').then(
    (m) => m.PartyReminderStrip
  )
);

const PartyArchiveDialogLazy = /* @__PURE__ */ dynamic(() =>
  import('./PartyArchiveDialog').then((m) => m.PartyArchiveDialog)
);

/* PAY-01 / PAY-03 — the payments drawer and the Collect QR, each in its own
   chunk with the payments slices inside it: a khata opened to READ a balance
   downloads neither. */
const PaymentFormDrawerLazy = /* @__PURE__ */ dynamic(() =>
  import('modules/DigiKhaato/features/payments/components/PaymentFormDrawer').then(
    (m) => m.PaymentFormDrawer
  )
);
// ── A6 ── PLT-X04: the guardian/payer section and module panels, in their own
// chunk and only for a business with a module that has roles.
const PartyRelationsSectionLazy = /* @__PURE__ */ dynamic(() =>
  import('./PartyRelationsSection').then((m) => m.PartyRelationsSection)
);

const CollectQrSheetLazy = /* @__PURE__ */ dynamic(() =>
  import('modules/DigiKhaato/features/payments/components/CollectQrSheet').then(
    (m) => m.CollectQrSheet
  )
);

/** PAY-01 FR-1 — the drawer's preset from the khata (a local mirror of `PaymentContext`). */
interface KhataPaymentPreset {
  readonly presetMode?: 'upi';
  readonly presetAmount?: string;
  /** PUR-02 — "Pay supplier": money out against the supplier's purchase bills. */
  readonly direction?: 'out';
}

export function PartyDetailPageContent({
  id,
}: Readonly<PartyDetailPageContentProps>): React.JSX.Element {
  const { t, d } = useTranslation();
  const router = useRouter();
  const partyForm = usePartyForm();
  const entryForm = useLedgerEntryForm();
  const opening = useOpeningBalance(id);
  const {
    party,
    cachedRow,
    summary,
    credit,
    status,
    error,
    isLoading,
    notFound,
    isArchived,
    collectionStatus,
    setCollectionDate,
    refetch,
  } = usePartyDetail(id);

  const archive = usePartyArchive(id);
  /* The header's ⋯. Every dialog it opens returns focus here when it closes,
     because the menu item that opened it closed with the menu (QA D1). */
  const moreRef = useRef<HTMLButtonElement | null>(null);
  /* The same test the timeline is drawn on: a tenant without the ledger module
     has no statement to read, and a role that may not read entries must not be
     handed a link to a page that would refuse them (§19.7.5 — hide, never
     disable). */
  const { can, hasModule } = usePermissions();
  const canReadLedger = hasModule('ledger') && can('ledger.entry.read');

  /* Whether the header's You gave / You got pair has scrolled up out of view.
     Read on every width; the dock it drives is `sm:hidden`, because from `sm`
     up the pair sits beside the title and a laptop's khata rarely scrolls it
     away from a reachable place. */
  const [pairRef, pairScrolledPast] = useScrolledPast<HTMLDivElement>();

  const [copied, setCopied] = useState(false);
  const [paying, setPaying] = useState<KhataPaymentPreset | null>(null);
  const [collecting, setCollecting] = useState(false);
  const handleCopyMobile = useCallback(async (mobile: string) => {
    setCopied(await copyText(mobile));
  }, []);
  /* The confirmation is a moment, not a state: leaving "Copied" on the button
     forever makes it a label rather than feedback, and the next copy then
     changes nothing on screen. */
  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const backToList = useCallback(() => router.push(ROUTES.PARTIES), [router]);
  const openEdit = useCallback(() => {
    if (party) partyForm.openEdit(party as PartyDetail);
  }, [partyForm, party]);

  /* FR-1's promise, in one line: the header draws from whichever of the two is
     available, and the cached row is available the instant the merchant taps a
     row in the list. The fields it cannot supply — GSTIN, addresses, the info
     panel — are what the fetch is for, and they are below the fold on a phone. */
  const shown = party ?? cachedRow;

  /* Hoisted out of the dependency array rather than written as
     `shown?.lastActivityAt`: the React compiler cannot preserve a memo whose
     dependency is an optional chain, and it says so rather than silently
     dropping the memoisation. */
  const lastActivityAt = shown?.lastActivityAt ?? null;
  /* A6 — the roles worded once, from each module's catalogue (singular). */
  const roleBadges = party?.roleBadges;
  const roleLabels = useMemo(
    () =>
      roleBadges?.flatMap((role) => {
        const label = roleBadgeLabel(t, role);
        return label ? [{ code: role.code, label }] : [];
      }),
    [roleBadges, t]
  );
  const asOf = useMemo(() => (lastActivityAt ? d(lastActivityAt) : null), [lastActivityAt, d]);

  /* LED-06 — the SAME balance the header prints (`summary` when the detail has
     landed, the cached row until then), so the figure in the message can never
     differ from the one the merchant is looking at when they tap. Offered only
     once the detail has loaded: `party`, not `shown`, because the archived flag
     a cached list row carries may be a page old. */
  const reminder = usePartyReminder(
    party
      ? {
          id,
          name: party.name,
          balance: summary?.balance ?? party.balance,
          mobile: party.mobile,
          isArchived,
        }
      : null
  );

  if (notFound) {
    return (
      <UbPageShell>
        <UbEmptyState
          variant="error"
          title={t('parties.detail.notFound')}
          description={t('parties.detail.notFound.body')}
          action={
            <UbButton variant="secondary" onClick={backToList}>
              {t('parties.detail.backToList')}
            </UbButton>
          }
        />
      </UbPageShell>
    );
  }

  if (status === 'failed' && shown === null) {
    return (
      <UbPageShell>
        <UbEmptyState
          variant="error"
          title={t('parties.detail.error.title')}
          description={error?.message ?? t('parties.detail.error.body')}
          requestId={error?.requestId ?? null}
          requestIdLabel={t('common.error.reference')}
          action={
            <UbButton variant="secondary" onClick={refetch}>
              {t('common.action.retry')}
            </UbButton>
          }
        />
      </UbPageShell>
    );
  }

  if (isLoading || shown === null) {
    return (
      <UbPageShell>
        <UbSkeleton variant="card" />
      </UbPageShell>
    );
  }

  const infoPanel = party ? (
    <PartyInfoPanel
      t={t}
      party={party}
      addedOn={party.createdAt ? d(party.createdAt) : null}
      lastActivity={asOf}
      collectionControl={
        <PartyCollectionDate
          t={t}
          value={party.collectionDate}
          onChange={setCollectionDate}
          saving={collectionStatus === 'loading'}
          /* Archived is read-only (FR-14), and so is a role that cannot write
             a party. Both are shown as text rather than as a disabled picker:
             a greyed-out control invites a merchant to work out why. */
          disabled={isArchived || !partyForm.canWrite}
          formatted={party.collectionDate ? d(party.collectionDate) : null}
        />
      }
    />
  ) : (
    <UbSkeleton variant="card" />
  );

  /* The khata's everyday pair. Hidden rather than disabled when the role
     cannot write (§19.7.5 / R-SEC-2), and absent for an archived party. */
  const canRecord = Boolean(party) && !isArchived && entryForm.canWrite;
  /* PAY-01 — against bills, for a role that records payments; PAY-03's QR is a
     read (§12), offered while the party owes the shop something. */
  const canPay =
    Boolean(party) && !isArchived && hasModule('payments') && can('payments.payment.write');
  const balanceNow = summary?.balance ?? shown.balance;
  const receivable = balanceNow && !balanceNow.startsWith('-') ? balanceNow : '';
  /* PUR-02 — what the shop owes this supplier, as a magnitude: the default
     amount of "Pay supplier". A negative balance is "You will give". */
  const payable = balanceNow?.startsWith('-') ? balanceNow.slice(1) : '';
  const canCollect =
    Boolean(party) && !isArchived && hasModule('payments') && can('payments.payment.read');
  const entryPair = (
    <>
      <UbButton variant="primary" onClick={() => entryForm.openEntry(id, 'debit')}>
        {t('ledger.entry.gaveAction')}
      </UbButton>
      <UbButton variant="secondary" onClick={() => entryForm.openEntry(id, 'credit')}>
        {t('ledger.entry.gotAction')}
      </UbButton>
    </>
  );

  return (
    <UbPageShell
      header={
        <UbPageHeader
          title={shown.name}
          /* LED-01 FR-1 — the two actions this page exists for, and the most
             frequent thing anybody does in this product. They stay as BUTTONS
             while everything else moved behind the menu, because the target
             is eight seconds from tapping the party to the entry being saved
             and a menu costs a tap and a decision on the one action that
             cannot afford either. On a phone the header lays them out as an
             equal-width pair under the name, like two tabs.

             Hidden rather than disabled when the role cannot write (§19.7.5 /
             R-SEC-2): a greyed button with a tooltip is a support call. */
          primaryActions={canRecord ? entryPair : undefined}
          primaryActionsRef={pairRef}
          actions={
            /* Edit, Add opening balance and Archive. All three are things done
               once a month or once in a party's life, and at five buttons the
               row ran 275 px off the right edge of a 360 px phone — see
               `PartyHeaderMenu` for the whole story. Archive is still on THIS
               screen, which was PTY-04's argument: a merchant filing somebody
               away is looking at the balance while they decide. Hidden for an
               archived party, whose flow is PTY-04's Restore. */
            party && !isArchived ? (
              <PartyHeaderMenu
                t={t}
                triggerRef={moreRef}
                statementHref={canReadLedger ? partyStatementPath(id) : undefined}
                onRemind={reminder.canRemind ? reminder.openSheet : undefined}
                /* Money in for a customer (or a party marked as neither);
                   money out for a supplier. A party that is both gets both. */
                onRecordPayment={
                  canPay && (shown.isCustomer || !shown.isSupplier)
                    ? () => setPaying({})
                    : undefined
                }
                onPaySupplier={
                  canPay && shown.isSupplier ? () => setPaying({ direction: 'out' }) : undefined
                }
                onCollect={canCollect ? () => setCollecting(true) : undefined}
                onEdit={partyForm.canWrite ? openEdit : undefined}
                onAddOpening={opening.canAdd ? opening.openDrawer : undefined}
                onArchive={archive.canArchive ? archive.open : undefined}
              />
            ) : undefined
          }
        />
      }
    >
      <UbStack gap={4}>
        {isArchived && (
          <UbStatusBanner
            tone="warning"
            title={t('parties.detail.archivedBanner')}
            description={t('parties.detail.archivedBanner.body')}
            action={
              /* Hidden rather than disabled for a role that cannot restore
                 (§19.7.5). FRD §7 asks for a disabled button with a tooltip so
                 the capability is discoverable; a staff member cannot act on
                 that knowledge, and a control they can reach but never use is
                 a support call waiting to happen. */
              archive.canArchive ? (
                <UbButton
                  variant="secondary"
                  onClick={archive.restore}
                  busy={archive.restoring}
                  busyLabel={t('parties.restore.saving')}
                >
                  {t('parties.restore.action')}
                </UbButton>
              ) : undefined
            }
          />
        )}

        <UbCard>
          <UbBox>
            <PartyDetailHeader
              t={t}
              name={shown.name}
              balance={summary?.balance ?? shown.balance}
              displayCode={shown.displayCode}
              mobile={shown.mobile}
              isCustomer={shown.isCustomer}
              isSupplier={shown.isSupplier}
              asOf={asOf}
              credit={credit}
              tags={shown.tags}
              pending={status === 'loading' || status === 'refreshing'}
              onCopyMobile={handleCopyMobile}
              copied={copied}
              roleLabels={roleLabels}
            />
            {/* LED-06 FR-6 — "did I already ask?", answered where the balance
                is. Its own chunk: it carries the reminders slice, and a khata
                that is only read should not wait on it to paint. */}
            {party && canReadLedger && (
              <UbBox className="mt-3 border-t border-border-hairline pt-3">
                <PartyReminderStripLazy partyId={id} />
              </UbBox>
            )}
          </UbBox>
        </UbCard>

        {/* Two columns from `lg`, one below it, with the rail on the right and
            sticky — FRD §7's desktop layout. On a phone the same content is a
            collapsible under the header, collapsed by default, because the
            merchant came here for the balance and the transactions and not for
            the GSTIN. */}
        <UbBox className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <UbStack gap={4} className="min-w-0 flex-1">
            {/* The ledger feature's own component, and deliberately not a
                generic one lifted into the design system: it knows what a debit
                reads like and when an author is worth naming, neither of which
                a `UbTimeline` could know. It renders nothing at all when the
                tenant has not enabled the ledger module. */}
            <PartyLedgerTimeline partyId={id} readOnly={isArchived} />
          </UbStack>

          <UbBox className="w-full lg:sticky lg:top-6 lg:w-[320px] lg:shrink-0">
            <UbBox className="hidden lg:block">{infoPanel}</UbBox>
            <UbBox className="lg:hidden">
              <UbDisclosure label={t('parties.detail.details')}>{infoPanel}</UbDisclosure>
            </UbBox>
            {/* A6 — below the info panel at every width: the section exists only
                while a module with roles is on (the detail's `roles` key). */}
            {party && party.roleBadges !== undefined && (
              <UbStack gap={4} className="mt-4">
                <PartyRelationsSectionLazy
                  partyId={id}
                  partyName={party.name}
                  readOnly={isArchived}
                />
                <PartyModulePanels party={party} readOnly={isArchived} />
              </UbStack>
            )}
          </UbBox>
        </UbBox>

        {/* The same pair, docked to the bottom of a phone — but only once the
            header's pair has scrolled up out of view. The header keeps its
            pair (owner, 23 Sep: the tab-like row under the title); a merchant
            twenty entries down a busy khata should not have to scroll back to
            the top to record the twenty-first. Rendered only while needed, so
            there are never two pairs on screen at once.

            `UbBottomBar` because it is furniture at the bottom of the
            viewport: it publishes its height so the snackbar lifts above it
            (CR-2026-09-19-G). Sticky in the page column, edge to edge (`-mx-4`
            undoes the column's inset) and clear of the iOS home indicator. */}
        {canRecord && pairScrolledPast && (
          <UbBottomBar
            data-testid="khata-dock"
            className="-mx-4 grid grid-cols-2 gap-2 border-t border-border-hairline bg-surface-card px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3 sm:hidden"
          >
            {entryPair}
          </UbBottomBar>
        )}
      </UbStack>

      {/* The drawer the Edit button opens.
 
          It was missing entirely: `openEdit` dispatched into `partyFormSlice`,
          the store said the form was open, and nothing on this page rendered
          it — so the only action PTY-03 offers did nothing at all. The list
          page has always mounted it, which is why the slice, the thunk and the
          save path were all fine; what was absent was six lines of JSX on the
          screen the FRD puts Edit on.
 
          `dynamic()` for the same measured reason the list has it: the form
          carries React Hook Form's resolver, the Yup schema and the controls,
          and putting it in the route's own chunk charges every merchant who
          opened this page to READ it. */}
      {partyForm.open && <PartyFormDrawerLazy form={partyForm} returnFocusRef={moreRef} />}

      {entryForm.open && <LedgerEntryDrawerLazy form={entryForm} partyName={shown.name} />}

      {paying && (
        <PaymentFormDrawerLazy
          context={{
            direction: paying.direction ?? 'in',
            partyId: id,
            partyName: shown.name,
            receivable: paying.direction === 'out' ? payable : receivable,
            entry: paying.presetMode ? 'collect' : 'party',
            presetMode: paying.presetMode,
            presetAmount: paying.presetAmount,
          }}
          onClose={() => setPaying(null)}
        />
      )}
      {collecting && (
        <CollectQrSheetLazy
          partyId={id}
          partyName={shown.name}
          receivable={receivable}
          onClose={() => setCollecting(false)}
          onMarkReceived={(amount) => {
            setCollecting(false);
            setPaying({ presetMode: 'upi', presetAmount: amount });
          }}
        />
      )}

      {/* LED-06. The merchant sends it from their own WhatsApp or SMS app
          (DEC-012) — the feedback says "WhatsApp opened", never "Reminder
          sent". The text is the server's, fetched when the sheet opens, and
          the tap on WhatsApp, SMS or Call is what records the reminder. */}
      {reminder.canRemind && reminder.open && (
        <PartyReminderSheetLazy
          partyId={reminder.partyId}
          open={reminder.open}
          onOpenChange={reminder.setOpen}
          title={reminder.title}
          description={reminder.description}
          phone={reminder.phone}
          labels={reminder.labels}
          returnFocusRef={moreRef}
        />
      )}

      {opening.open && (
        <OpeningBalanceDrawerLazy
          opening={opening}
          partyName={shown.name}
          returnFocusRef={moreRef}
          /* LED-02 §8 / PTY-01 FR-9 — a supplier-only party is somebody this
             business buys from, so the balance carried over is what the
             business owes THEM. A party that is both starts on "they owe me"
             (EC-5), because that is what a shopkeeper is carrying over in the
             overwhelming majority of rows. Computed here from the row the page
             already holds rather than fetched, and the server's own
             `default_direction` is the same rule for the import path. */
          defaultDirection={shown.isSupplier && !shown.isCustomer ? 'credit' : 'debit'}
        />
      )}

      {archive.stage !== 'closed' && (
        <PartyArchiveDialogLazy
          t={t}
          name={shown.name}
          stage={archive.stage}
          blocked={archive.blocked}
          openRecords={archive.openRecords}
          error={archive.error}
          onConfirm={archive.confirm}
          onClose={archive.close}
          returnFocusRef={moreRef}
          savingFrom={archive.savingFrom}
          canWriteOff={archive.canWriteOff}
          onStartWriteOff={archive.startWriteOff}
          onCancelWriteOff={archive.cancelWriteOff}
          onConfirmWriteOff={archive.confirmWriteOff}
          onRecordPayment={
            entryForm.canWrite
              ? () => {
                  /* The direction that SETTLES the balance: they owe you, so
                   money comes in (You got); you owe them, so it goes out. */
                  const direction = archive.blocked?.label === 'payable' ? 'debit' : 'credit';
                  /* The magnitude the dialog just showed, prefilled and still
                     editable — a part payment is the common case, but typing
                     back a figure the merchant was shown a second ago is the
                     uncommon kind of work (UAT). */
                  const amount = archive.blocked?.magnitude ?? null;
                  archive.close();
                  entryForm.openEntry(id, direction, { amount });
                }
              : undefined
          }
        />
      )}
    </UbPageShell>
  );
}
