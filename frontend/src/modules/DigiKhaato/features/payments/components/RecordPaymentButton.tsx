'use client';

import { useState } from 'react';

import dynamic from 'next/dynamic';

import { Wallet } from 'lucide-react';

import { UbButton } from 'src/design-system';
import { usePermissions } from 'src/hooks/usePermissions';
import { useTranslation } from 'src/hooks/useTranslation';

import type { PaymentContext, PaymentSaveResult } from '../types/payment.types';

/* The drawer (form, schema, payments slices) loads with the tap, never with the
   screen the button sits on (CLAUDE.md: a form belongs in the chunk that OPENS it). */
const PaymentFormDrawerLazy = dynamic(
  () => import('./PaymentFormDrawer').then((m) => m.PaymentFormDrawer),
  { ssr: false }
);

/**
 * PAY-01 FR-1 — "Record payment" on another feature's screen (the invoice
 * page), with the drawer preset to that bill. Imports nothing heavier than a
 * button, so the host screen's chunk carries none of the payments feature.
 * Hidden rather than disabled for a role that cannot record (§19.7.5).
 */
export function RecordPaymentButton({
  context,
  onSaved,
}: Readonly<{
  context: PaymentContext;
  onSaved?: (result: PaymentSaveResult) => void;
}>): React.JSX.Element | null {
  const { t } = useTranslation();
  const { can, hasModule } = usePermissions();
  const [open, setOpen] = useState(false);
  if (!(hasModule('payments') && can('payments.payment.write'))) return null;
  return (
    <>
      <UbButton
        iconOnly="mobile"
        icon={<Wallet className="h-4 w-4" aria-hidden />}
        onClick={() => setOpen(true)}
        data-testid="record-payment-action"
      >
        {t('payments.record.title')}
      </UbButton>
      {open && (
        <PaymentFormDrawerLazy context={context} onClose={() => setOpen(false)} onSaved={onSaved} />
      )}
    </>
  );
}
