'use client';

import { memo, useCallback } from 'react';

import { Check, Copy, Phone } from 'lucide-react';

import {
  UbAmount,
  UbAvatar,
  UbBox,
  UbButton,
  UbLink,
  UbStack,
  UbStatusBadge,
  UbTagList,
  UbText,
} from 'src/design-system';
import type { TranslateFn } from 'src/hooks/useTranslation';

import { showsCreditBar } from '../view-model/creditDisplay';
import { balanceView } from '../view-model/partyDisplay';
import { toTagListItems } from '../view-model/partyTagDisplay';

import { CreditUsageBar } from './CreditUsageBar';

import type { PartyCredit, PartyTag } from '../types/party.types';

/**
 * PTY-03 FR-2 — the khata page's header: who this is, and how much.
 *
 * ── Named `PartyDetailHeader`, not `UbPartyHeader` ─────────────────────────
 * The FRD's component list calls it `UbPartyHeader`, and that is the one thing
 * here that departs from the spec. A `Ub*` is a design-system component: it
 * knows about text, tone and spacing and nothing about this product's nouns.
 * This one reads `isCustomer`, `isSupplier` and a ledger balance, and decides
 * that a positive number means the merchant is owed money. A design system
 * that grows a component per domain entity stops being a design system, and
 * the next screen that needs "a header with an avatar and a metric" cannot use
 * this one anyway. The reusable half already exists — `UbAvatar`, `UbAmount`,
 * `UbStatusBadge` — and this composes them.
 *
 * ── The name is NOT repeated here ──────────────────────────────────────────
 * FRD §7 lists the name twice — once as `UbPageHeader`'s title, once inside
 * this block — and on a screen that is one name in `ds-h1` immediately above
 * the same name in `ds-h2`, six pixels apart. The spec is describing the state
 * AFTER the header collapses (§7: "collapses to a 56 px sticky bar with name +
 * balance when scrolled past 120 px"), where only one of the two is ever
 * visible. That collapse is not built, so showing both is duplication rather
 * than continuity.
 *
 * The page title is the name; this block is the avatar, what kind of party they
 * are, and how much. `name` is still taken, because `UbAvatar` derives the
 * initials from it.
 *
 * ── The balance never carries a sign ───────────────────────────────────────
 * §23.2.6 rule 3, and `balanceView` is the shared decision — the same function
 * the list rows use, so the khata page and the row a merchant tapped to get
 * here can never disagree about tone or wording. A negative balance is not a
 * concept a shopkeeper has; they have "you will get" and "you will give".
 *
 * The labels resolve to `parties.list.balance.*` rather than the
 * `parties.detail.balance.*` keys the FRD's copy table lists. The two tables
 * hold the same three sentences, and a second set of keys with identical values
 * is a second place for them to drift apart — the day one of them is retuned
 * and the other is not, the list and the detail page say different things about
 * the same number.
 */
export interface PartyDetailHeaderProps {
  readonly t: TranslateFn;
  readonly name: string;
  readonly balance: string;
  readonly displayCode: string | null;
  readonly mobile: string | null;
  readonly isCustomer: boolean;
  readonly isSupplier: boolean;
  /** Formatted by the caller — the baseline every figure carries. */
  readonly asOf: string | null;
  readonly credit: PartyCredit | null;
  /** PTY-05 — every tag on this party, uncapped: this is the screen with room. */
  readonly tags: readonly PartyTag[];
  /** True while the detail request is still in flight over a cached row. */
  readonly pending: boolean;
  readonly onCopyMobile: (mobile: string) => void;
  /** Set for a moment after a successful copy, so the button can say so. */
  readonly copied: boolean;
}

function PartyDetailHeaderBase({
  t,
  name,
  balance,
  displayCode,
  mobile,
  isCustomer,
  isSupplier,
  asOf,
  credit,
  tags,
  pending,
  onCopyMobile,
  copied,
}: Readonly<PartyDetailHeaderProps>) {
  const view = balanceView(balance);
  const handleCopy = useCallback(() => {
    if (mobile) onCopyMobile(mobile);
  }, [mobile, onCopyMobile]);

  return (
    /* Two columns: who they are on the left, how much on the right, on one row
       at every width.

       It was three stacked blocks, and the baseline caption came out orphaned
       — "as of 20/09/2026" hard against the left edge of the card while
       "₹282.90 · You will give" sat at the right, because `UbAmount` aligns
       itself to the end and the wrapper stretched its children. A baseline
       that is not beside its figure explains nothing, which is the whole
       reason the rule asks for one. */
    <UbBox className="flex flex-wrap items-start justify-between gap-4">
      <UbStack gap={2} className="min-w-0">
        <UbBox className="flex min-w-0 items-center gap-3">
          <UbAvatar name={name} size="md" />
          <UbBox className="flex min-w-0 flex-wrap items-center gap-2">
            {/* Both, when the party is both. One khata for the person, not
                two — so the badges describe the roles rather than choosing
                between them (PTY-01 US-4). */}
            {isCustomer && <UbStatusBadge label={t('parties.detail.badge.customer')} />}
            {isSupplier && <UbStatusBadge label={t('parties.detail.badge.supplier')} />}
            {displayCode && (
              <UbText variant="caption" tone="tertiary">
                {displayCode}
              </UbText>
            )}
          </UbBox>
        </UbBox>

        {mobile && (
          <UbBox className="flex items-center gap-1">
            {/* A `tel:` link and not a button: on a phone this is the action the
                merchant came for, and the platform's own handler is better than
                anything this screen could do with the number. */}
            <UbLink href={`tel:${mobile}`} className="inline-flex items-center gap-2">
              <Phone className="h-4 w-4" aria-hidden />
              {mobile}
            </UbLink>
            {/* Labelled, not icon-only. An icon-only copy button is a 16px
                glyph whose meaning a merchant has to already know, and the word
                is two characters wider than the tooltip that would otherwise be
                needed to explain it. The label also carries the confirmation:
                "Copied" replaces "Copy" for a moment, which is the feedback the
                action otherwise has none of. */}
            <UbButton
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              icon={
                copied ? (
                  <Check className="h-4 w-4" aria-hidden />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden />
                )
              }
            >
              {copied ? t('parties.detail.copied') : t('parties.detail.copy')}
            </UbButton>
          </UbBox>
        )}
        {/* PTY-05 — all of them, and no "+3". A list row caps at two chips
            because it is a place to decide; this is the screen a merchant came
            to in order to find out about this party, so withholding the fourth
            tag behind a counter would be hiding the answer on the page that
            exists to give it. The lane is not reserved either — an untagged
            party gets no empty row, because there is no second party beneath
            them for it to line up with. */}
        {tags.length > 0 && (
          <UbTagList
            tags={toTagListItems(tags)}
            label={t('parties.tags.listLabel', { name })}
            max={tags.length}
            className="flex-wrap"
          />
        )}
      </UbStack>

      {/* `aria-live` because PTY-03 FR-15's optimistic entries will change this
          number without a navigation, and a merchant using a screen reader has
          to hear it — the region is here now so that the announcement is not
          something LED-01 has to remember to add. */}
      <UbBox
        role="status"
        aria-live="polite"
        aria-busy={pending || undefined}
        className="flex flex-col items-end gap-1 text-right"
      >
        <UbAmount
          value={balance}
          size="lg"
          tone={view.tone}
          sign={view.sign}
          label={t(view.labelId)}
        />
        {asOf && (
          /* Koper's rule: every number carries its baseline. "₹2,300" is a
             figure; "₹2,300 as of 18 Sep" is a fact somebody can act on. */
          <UbText variant="caption" tone="tertiary">
            {t('parties.detail.balance.asOf', { date: asOf })}
          </UbText>
        )}
        {/* PTY-06 FR-10 — the bar replaces the one-line caption PTY-03 shipped.
            "₹2,000 of ₹5,000 credit used" was true and flat: a merchant reading
            a book of forty parties needs to see at a glance which ones are
            close, and a sentence does not do that. Hidden entirely when the
            tenant has switched checks off — a meter for a rule nobody is
            enforcing is a number inviting a decision the product will not act
            on. */}
        {showsCreditBar(credit) && (
          /* `w-64`, not `w-40`. At 160 px the over-limit caption wrapped as
             "₹1,700.00 over the / ₹50,000.00 limit", and at 224 px it still
             left the word "limit" alone on a second line — a sentence split
             between a number and its unit, which is the one place a wrap does
             real damage. Capped rather than fluid so it cannot grow into the
             party's name beside it. */
          <CreditUsageBar t={t} credit={credit} className="mt-1 w-64 space-y-1 text-right" />
        )}
      </UbBox>
    </UbBox>
  );
}

PartyDetailHeaderBase.displayName = 'PartyDetailHeader';
export const PartyDetailHeader = memo(PartyDetailHeaderBase);
