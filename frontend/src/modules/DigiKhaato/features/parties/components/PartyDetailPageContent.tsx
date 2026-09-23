'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';



import {
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
import { useTranslation } from 'src/hooks/useTranslation';
import { ROUTES } from 'src/routes';
import { copyText } from 'src/utils/clipboard';

import { PartyLedgerTimeline } from 'modules/DigiKhaato/features/ledger/components/PartyLedgerTimeline';
import { useLedgerEntryForm } from 'modules/DigiKhaato/features/ledger/hooks/useLedgerEntryForm';
import { useOpeningBalance } from 'modules/DigiKhaato/features/ledger/hooks/useOpeningBalance';

import { usePartyArchive } from '../hooks/usePartyArchive';
import { usePartyDetail } from '../hooks/usePartyDetail';
import { usePartyForm } from '../hooks/usePartyForm';


import { PartyArchiveDialog } from './PartyArchiveDialog';
import { PartyCollectionDate } from './PartyCollectionDate';
import { PartyDetailHeader } from './PartyDetailHeader';
import { PartyHeaderMenu } from './PartyHeaderMenu';
import { PartyInfoPanel } from './PartyInfoPanel';

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
 * the payment against a document — and the share sheet. All four are about
 * `sales_document` and `payments_payment`, which have no tables, and the
 * judgement is the one this page was built on: a control that opens nothing
 * teaches a merchant that the product is broken rather than unfinished.
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

const shortDate = (value: string | null | undefined): string | null =>
  value ? value.slice(0, 10) : null;

export interface PartyDetailPageContentProps {
  readonly id: string;
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

  const [copied, setCopied] = useState(false);
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
  const asOf = useMemo(() => (lastActivityAt ? d(lastActivityAt) : null), [lastActivityAt, d]);

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
      addedOn={shortDate(party.createdAt)}
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

  return (
    <UbPageShell
      header={
        <UbPageHeader
          title={shown.name}
          actions={
            /* Edit is the only action this wave can offer, and it is real:
               PTY-01's drawer exists. It is hidden for a role that cannot
               write (§19.7.5) and for an archived party, whose edits PTY-01
               restricts to notes — a drawer that refuses most of its own
               fields is a worse answer than PTY-04's Restore, which is where
               that flow belongs. */
            party && !isArchived ? (
              <>
                {/* LED-01 FR-1 — the two actions this page exists for, and the
                    most frequent thing anybody does in this product. They stay
                    as BUTTONS while everything else moved behind the menu,
                    because the target is eight seconds from tapping the party
                    to the entry being saved and a menu costs a tap and a
                    decision on the one action that cannot afford either.

                    Hidden rather than disabled when the role cannot write
                    (§19.7.5 / R-SEC-2): a greyed button with a tooltip is a
                    support call, and an accountant does not need to be told
                    every time they open a page that they are an accountant. */}
                {entryForm.canWrite && (
                  <>
                    <UbButton
                      variant="primary"
                      onClick={() => entryForm.openEntry(id, 'debit')}
                    >
                      {t('ledger.entry.gaveAction')}
                    </UbButton>
                    <UbButton
                      variant="secondary"
                      onClick={() => entryForm.openEntry(id, 'credit')}
                    >
                      {t('ledger.entry.gotAction')}
                    </UbButton>
                  </>
                )}
                {/* Edit, Add opening balance and Archive. All three are things
                    done once a month or once in a party's life, and at five
                    buttons the row ran 275 px off the right edge of a 360 px
                    phone — see `PartyHeaderMenu` for the whole story. Archive
                    is still on THIS screen, which was PTY-04's argument: a
                    merchant filing somebody away is looking at the balance, the
                    last entry and the contact details while they decide. It is
                    one tap further away, not somewhere else. */}
                <PartyHeaderMenu
                  t={t}
                  onEdit={partyForm.canWrite ? openEdit : undefined}
                  onAddOpening={opening.canAdd ? opening.openDrawer : undefined}
                  onArchive={archive.canArchive ? archive.open : undefined}
                />
              </>
            ) : undefined
          }
        />
      }
    >
      <UbStack gap={6}>
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
          <UbBox className="p-4">
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
            />
          </UbBox>
        </UbCard>

        {/* Two columns from `lg`, one below it, with the rail on the right and
            sticky — FRD §7's desktop layout. On a phone the same content is a
            collapsible under the header, collapsed by default, because the
            merchant came here for the balance and the transactions and not for
            the GSTIN. */}
        <UbBox className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <UbStack gap={4} className="min-w-0 flex-1">
            {/* The ledger feature's own component, and deliberately not a
                generic one lifted into the design system: it knows what a debit
                reads like and when an author is worth naming, neither of which
                a `UbTimeline` could know. It renders nothing at all when the
                tenant has not enabled the ledger module. */}
            <PartyLedgerTimeline partyId={id} />
          </UbStack>

          <UbBox className="w-full lg:sticky lg:top-6 lg:w-[320px] lg:shrink-0">
            <UbBox className="hidden lg:block">{infoPanel}</UbBox>
            <UbBox className="lg:hidden">
              <UbDisclosure label={t('parties.detail.details')}>{infoPanel}</UbDisclosure>
            </UbBox>
          </UbBox>
        </UbBox>
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
      {partyForm.open && <PartyFormDrawerLazy form={partyForm} />}

      {entryForm.open && <LedgerEntryDrawerLazy form={entryForm} partyName={shown.name} />}

      {opening.open && (
        <OpeningBalanceDrawerLazy
          opening={opening}
          partyName={shown.name}
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

      <PartyArchiveDialog
        t={t}
        name={shown.name}
        stage={archive.stage}
        blocked={archive.blocked}
        error={archive.error}
        onConfirm={archive.confirm}
        onClose={archive.close}
      />
    </UbPageShell>
  );
}
