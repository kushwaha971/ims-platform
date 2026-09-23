'use client';

import { memo, type ReactNode } from 'react';

import { UbCard, UbStack, UbText } from 'src/design-system';
import type { TranslateFn } from 'src/hooks/useTranslation';
import { formatInr } from 'src/utils/money';

import type { PartyDetail } from '../types/party.types';

/**
 * PTY-03 FR-11 — everything about the party that is not a number.
 *
 * A right rail on desktop, a collapsible on a phone; the caller owns which,
 * because the two placements are a page-layout decision and this component is
 * the content either way.
 *
 * ── Empty fields are omitted, not shown blank ──────────────────────────────
 * A merchant who has not entered a GSTIN does not need a row that says
 * "GSTIN —". Fifteen labelled dashes is a panel that reads as broken data
 * rather than as an unfilled form, and it buries the three fields that ARE
 * filled. A section with nothing in it disappears entirely, for the same
 * reason.
 *
 * The one exception is Notes, which shows its empty state, because an absent
 * Notes section and an empty one mean different things to somebody deciding
 * whether to write something down.
 */
export interface PartyInfoPanelProps {
  readonly t: TranslateFn;
  readonly party: PartyDetail;
  /** Formatted by the caller — this layer does not reach for `react-intl`. */
  readonly addedOn: string | null;
  readonly lastActivity: string | null;
  /** The collection-date control, which is the one editable thing here. */
  readonly collectionControl?: ReactNode;
}

interface Field {
  readonly label: string;
  readonly value: string | null | undefined;
}

const Section = memo(function Section({
  title,
  fields,
  children,
}: Readonly<{ title: string; fields?: readonly Field[]; children?: ReactNode }>) {
  const filled = (fields ?? []).filter((field) => Boolean(field.value?.toString().trim()));
  if (filled.length === 0 && !children) return null;

  return (
    <UbCard>
      <UbStack gap={3} className="p-4">
        <UbText variant="label" tone="tertiary">
          {title}
        </UbText>
        {filled.map((field) => (
          <UbStack key={field.label} gap={0}>
            <UbText variant="caption" tone="tertiary">
              {field.label}
            </UbText>
            {/* `break-words`: a GSTIN is 15 characters with no spaces and an
                email can be longer than a 320px rail, and either one overflows
                a card that does not say otherwise. */}
            <UbText variant="body-sm" className="break-words">
              {field.value}
            </UbText>
          </UbStack>
        ))}
        {children}
      </UbStack>
    </UbCard>
  );
});

const addressLine = (address: Record<string, string> | null | undefined): string | null => {
  if (!address) return null;
  const parts = [address.line1, address.line2, address.city, address.pincode].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
};

function PartyInfoPanelBase({
  t,
  party,
  addedOn,
  lastActivity,
  collectionControl,
}: Readonly<PartyInfoPanelProps>) {
  return (
    <UbStack gap={4}>
      <Section
        title={t('parties.detail.section.contact')}
        fields={[
          { label: t('parties.form.mobile.label'), value: party.mobile },
          { label: t('parties.form.altPhone.label'), value: party.altPhone },
          { label: t('parties.form.email.label'), value: party.email },
        ]}
      />

      <Section
        title={t('parties.detail.section.business')}
        fields={[
          { label: t('parties.form.gstin.label'), value: party.gstin },
          { label: t('parties.form.state.label'), value: party.stateCode },
        ]}
      />

      <Section
        title={t('parties.detail.section.address')}
        fields={[
          { label: t('parties.detail.address.billing'), value: addressLine(party.billingAddress) },
        ]}
      />

      {/* Terms always renders, because it holds the collection-date control —
          the one thing on this panel a merchant can change, and a control that
          appears only once a value exists is a control nobody can find to set
          the first value with. */}
      <Section
        title={t('parties.detail.section.terms')}
        fields={[
          {
            label: t('parties.form.creditLimit.label'),
            /* FORMATTED. It rendered as the raw wire string — "50000.00", in a
               panel whose every other line is a sentence — because a decimal
               string is already a string and nothing complained. Money is
               never shown to a merchant the way it travels (§23.2.6); it is
               grouped the Indian way, and `formatInr` is the one function that
               does it. Found in a screenshot, not in a test: `toBeInTheDocument`
               is as happy with "50000.00" as with "₹50,000.00". */
            value: party.creditLimit ? formatInr(party.creditLimit) : null,
          },
          {
            label: t('parties.form.creditDays.label'),
            value: party.creditDays != null ? String(party.creditDays) : null,
          },
        ]}
      >
        {collectionControl}
      </Section>

      <Section title={t('parties.detail.section.notes')}>
        <UbText variant="body-sm" tone={party.notes ? 'primary' : 'tertiary'}>
          {party.notes || t('parties.detail.notes.empty')}
        </UbText>
      </Section>

      <Section
        title={t('parties.detail.section.meta')}
        fields={[
          { label: t('parties.detail.meta.addedOn'), value: addedOn },
          { label: t('parties.detail.meta.lastActivity'), value: lastActivity },
        ]}
      />
    </UbStack>
  );
}

PartyInfoPanelBase.displayName = 'PartyInfoPanel';
export const PartyInfoPanel = memo(PartyInfoPanelBase);
