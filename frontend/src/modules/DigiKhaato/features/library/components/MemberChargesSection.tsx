'use client';

import { useState } from 'react';

import dynamic from 'next/dynamic';

import { UbButton, UbCard, UbStack, UbStatusBadge, UbText } from 'src/design-system';
import type { UbStatusBadgeTone } from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import type { TranslateFn } from 'src/hooks/useTranslation';
import { formatBusinessDate } from 'src/utils/dates';
import { formatInr } from 'src/utils/money';

import { useMemberCharges } from '../hooks/useMemberCharges';
import { selectLibraryMemberDetail } from '../redux/libraryMemberDetailSlice';

import type { ChargeRow } from '../types/charge.types';
import type { MemberDetail } from '../types/member.types';

const loadDialogs = () => import('./ChargeDialogs');
const WaiveChargeDialogLazy = dynamic(() => loadDialogs().then((m) => m.WaiveChargeDialog), {
  ssr: false,
});
const ReverseChargeDialogLazy = dynamic(() => loadDialogs().then((m) => m.ReverseChargeDialog), {
  ssr: false,
});
const ManualChargeDialogLazy = dynamic(() => loadDialogs().then((m) => m.ManualChargeDialog), {
  ssr: false,
});
const PaymentFormDrawerLazy = dynamic(
  () =>
    import('modules/DigiKhaato/features/payments/components/PaymentFormDrawer').then(
      (m) => m.PaymentFormDrawer
    ),
  { ssr: false }
);

const TONE: Readonly<Record<string, UbStatusBadgeTone>> = {
  open: 'warning',
  part_paid: 'warning',
  paid: 'success',
  waived: 'neutral',
  refunded: 'neutral',
  reversed: 'neutral',
};

const owing = (charge: ChargeRow): boolean => Number(charge.amountDue) > 0 && !charge.reversedAt;

/**
 * F06 (LIB-07 §8 "Charges tab") — every charge of the member, newest first:
 * the description owns its line; number, date and status sit on the caption;
 * what is still owed is on the right. An owing charge offers Collect (the core
 * payment drawer, allocated to this charge), Waive and — when nothing has been
 * paid — Reverse; at most two actions show on its row, the rest wait in the
 * reverse dialog's own refusal (the "Delet" rule in CLAUDE.md).
 */
export function MemberChargesSection({
  member,
  t,
}: Readonly<{ member: MemberDetail; t: TranslateFn }>): React.JSX.Element | null {
  const charges = useMemberCharges(member.membershipId);
  const { actionStatus } = useAppSelector(selectLibraryMemberDetail);
  const [waiving, setWaiving] = useState<ChargeRow | null>(null);
  const [reversing, setReversing] = useState<ChargeRow | null>(null);
  const [collecting, setCollecting] = useState<ChargeRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const rows = charges.charges ?? [];
  const busyFor = async <T,>(work: () => Promise<T>): Promise<T> => {
    setBusy(true);
    try {
      return await work();
    } finally {
      setBusy(false);
    }
  };

  if (rows.length === 0 && !charges.canWrite) return null;

  return (
    <UbCard padded>
      <UbStack gap={3} data-testid="library-charges">
        <UbStack direction="row" justify="between" align="center" gap={2}>
          <UbText variant="label">{t('library.charge.title')}</UbText>
          {charges.canWrite && (
            <UbButton variant="ghost" size="sm" onClick={() => setAdding(true)}>
              {t('library.charge.add')}
            </UbButton>
          )}
        </UbStack>
        {charges.totals && rows.length > 0 && (
          <UbText variant="caption" tone="tertiary" data-testid="library-charge-totals">
            {t('library.charge.totals', {
              due: formatInr(charges.totals.due),
              paid: formatInr(charges.totals.paid),
              waived: formatInr(charges.totals.waived),
            })}
          </UbText>
        )}
        {rows.length === 0 && (
          <UbText variant="body-sm" tone="tertiary">
            {t('library.charge.none')}
          </UbText>
        )}
        {rows.map((charge) => (
          <UbStack key={charge.id} gap={1} data-testid="library-charge-row">
            <UbStack direction="row" justify="between" align="start" gap={3}>
              <UbText variant="body-sm" className="line-clamp-2 min-w-0">
                {charge.description}
              </UbText>
              <UbText variant="body-sm-medium" className="shrink-0">
                {formatInr(owing(charge) ? charge.amountDue : charge.amount)}
              </UbText>
            </UbStack>
            <UbStack direction="row" gap={2} align="center" wrap>
              <UbText variant="caption" tone="tertiary">
                {[charge.number, formatBusinessDate(charge.chargeDate)].join(' · ')}
              </UbText>
              <UbStatusBadge
                tone={TONE[charge.status] ?? 'neutral'}
                label={t(`library.charge.status.${charge.status}`)}
              />
            </UbStack>
            {owing(charge) && (
              <UbStack direction="row" gap={2} wrap>
                {charges.canCollect && (
                  <UbButton size="sm" variant="secondary" onClick={() => setCollecting(charge)}>
                    {t('library.charge.collect', { amount: formatInr(charge.amountDue) })}
                  </UbButton>
                )}
                {charges.canWaive && (
                  <UbButton size="sm" variant="ghost" onClick={() => setWaiving(charge)}>
                    {t('library.charge.waiveAction')}
                  </UbButton>
                )}
                {charges.canWrite && Number(charge.amountPaid) === 0 && (
                  <UbButton size="sm" variant="ghost" onClick={() => setReversing(charge)}>
                    {t('library.charge.reverse')}
                  </UbButton>
                )}
              </UbStack>
            )}
          </UbStack>
        ))}
      </UbStack>

      {waiving && (
        <WaiveChargeDialogLazy
          charge={waiving}
          dues={member.duesAmount}
          busy={busy || actionStatus === 'loading'}
          onClose={() => setWaiving(null)}
          onSubmit={(values) =>
            busyFor(() => charges.waive(waiving.id, values.amount, values.reason))
          }
        />
      )}
      {reversing && (
        <ReverseChargeDialogLazy
          charge={reversing}
          busy={busy}
          onClose={() => setReversing(null)}
          onSubmit={(reason) => busyFor(() => charges.reverse(reversing.id, reason))}
        />
      )}
      {adding && (
        <ManualChargeDialogLazy
          dues={member.duesAmount}
          busy={busy}
          onClose={() => setAdding(false)}
          onSubmit={(values, key) => busyFor(() => charges.create(values, key))}
        />
      )}
      {collecting && (
        <PaymentFormDrawerLazy
          context={{
            direction: 'in',
            partyId: member.party.id,
            partyName: member.party.name,
            receivable: member.duesAmount,
            documentId: collecting.id,
            documentNumber: collecting.number,
            documentDue: collecting.amountDue,
            entry: 'party',
            // DEC-019 — the library's fees, and an advance that stays the library's.
            bucket: 'library',
          }}
          onClose={() => setCollecting(null)}
        />
      )}
    </UbCard>
  );
}
