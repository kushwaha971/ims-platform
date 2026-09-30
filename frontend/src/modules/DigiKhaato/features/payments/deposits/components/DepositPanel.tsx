'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import dynamic from 'next/dynamic';

import { createPortal } from 'react-dom';

import {
  UbAmount,
  UbBox,
  UbButton,
  UbCard,
  UbSkeleton,
  UbStack,
  UbStatusBadge,
  UbText,
} from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectPrintBranding } from 'src/print/printBrandingSlice';
import { fetchPrintBranding } from 'src/print/printBrandingThunk';
import { selectActiveTenant } from 'src/redux/slice/sessionSlice';
import { formatAmount } from 'src/utils/money';

import { useDeposits } from '../hooks/useDeposits';
import { fetchDeposit } from '../redux/depositThunk';
import { canReceive, canSpend } from '../view-model/depositDisplay';

import { DepositSlipPrint } from './print/DepositSlipPrint';

import type { DepositMoneyKind } from './DepositMoneyDrawer';
import type { Deposit, DepositCharge, DepositDetail } from '../types/deposit.types';

import 'src/i18n/catalogues/deposits';
import 'src/i18n/catalogues/payments';

const DepositMoneyDrawer = dynamic(
  () => import('./DepositMoneyDrawer').then((module) => module.DepositMoneyDrawer),
  { ssr: false }
);
const ApplyDepositDialog = dynamic(
  () => import('./ApplyDepositDialog').then((module) => module.ApplyDepositDialog),
  { ssr: false }
);

const STATUS_TONE = { expected: 'warning', held: 'info', released: 'neutral' } as const;

/**
 * A4b (FRD 00 PLT-X02 §7) — a party's deposits: what each is for, what is
 * held, and the three acts — "Take deposit", "Adjust from deposit", "Return
 * deposit" — plus the slip. Registered on the khata as `payments.deposits`
 * (`partyPanel.ts`), and rendered by a vertical's own screen with the charges
 * it allows a deposit to pay (`chargesFor`): the core never decides those, so
 * the khata's copy offers no Adjust.
 *
 * Nothing at all for a party whose server payload carries no `depositHeld` —
 * the server sends it only when a deposit-writing module is on or money is
 * held — so a shop that takes no deposits never pays for the request.
 */
export interface DepositPanelProps {
  readonly party: { readonly id: string; readonly depositHeld?: string };
  readonly readOnly: boolean;
  /** A vertical's own charges a deposit may be adjusted against. */
  readonly chargesFor?: (deposit: Deposit) => readonly DepositCharge[];
}

type Open =
  | { readonly kind: DepositMoneyKind; readonly deposit: Deposit }
  | { readonly kind: 'apply'; readonly deposit: Deposit }
  | null;

export function DepositPanel({
  party,
  readOnly,
  chargesFor,
}: Readonly<DepositPanelProps>): React.JSX.Element | null {
  if (party.depositHeld == null) return null;
  return <DepositPanelBody partyId={party.id} readOnly={readOnly} chargesFor={chargesFor} />;
}

function DepositPanelBody({
  partyId,
  readOnly,
  chargesFor,
}: Readonly<{
  partyId: string;
  readOnly: boolean;
  chargesFor?: DepositPanelProps['chargesFor'];
}>): React.JSX.Element | null {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const deposits = useDeposits(partyId);
  const tenant = useAppSelector(selectActiveTenant);
  // The letterhead is asked for when a slip is printed, not with every khata.
  const branding = useAppSelector(selectPrintBranding);
  const [open, setOpen] = useState<Open>(null);
  const [slip, setSlip] = useState<DepositDetail | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const { clearErrors } = deposits;

  const close = useCallback(() => {
    clearErrors();
    setOpen(null);
  }, [clearErrors]);

  const printSlip = useCallback(
    async (deposit: Deposit) => {
      const [result] = await Promise.all([
        dispatch(fetchDeposit(deposit.id)),
        dispatch(fetchPrintBranding()),
      ]);
      if (fetchDeposit.fulfilled.match(result)) setSlip(result.payload);
    },
    [dispatch]
  );

  // The slip is the only thing on paper while it prints (the A4b print rule in globals.css).
  useEffect(() => {
    if (!slip) return undefined;
    document.body.setAttribute('data-printing-slip', '');
    const timer = window.setTimeout(() => {
      window.print();
      document.body.removeAttribute('data-printing-slip');
      setSlip(null);
    }, 50);
    return () => {
      window.clearTimeout(timer);
      document.body.removeAttribute('data-printing-slip');
    };
  }, [slip]);

  if (!deposits.canRead) return null;
  const loading = deposits.status === 'idle' || deposits.status === 'loading';
  if (!loading && deposits.status !== 'failed' && deposits.rows.length === 0) return null;

  const busy = deposits.writeStatus === 'loading';
  const writable = deposits.canWrite && !readOnly;
  const submit = async (action: () => Promise<boolean>): Promise<void> => {
    if (await action()) setOpen(null);
  };

  return (
    <UbCard
      title={t('payments.deposit.panel.title')}
      description={t('payments.deposit.panel.held', {
        amount: formatAmount(deposits.heldTotal),
      })}
    >
      {loading && <UbSkeleton variant="list" count={1} label={t('payments.deposit.loading')} />}
      {deposits.status === 'failed' && (
        <UbText variant="body-sm" tone="formError" role="alert">
          {t('payments.deposit.error.load')}
        </UbText>
      )}
      <UbStack as="ul" gap={3} data-testid="deposit-rows">
        {deposits.rows.map((deposit) => {
          const charges = chargesFor?.(deposit) ?? null;
          return (
            <UbStack as="li" key={deposit.id} gap={2} data-testid="deposit-row">
              <UbStack direction="row" justify="between" align="start" className="gap-3">
                <UbStack gap={1} className="min-w-0">
                  <UbText variant="body-sm" className="line-clamp-2">
                    {deposit.purpose}
                  </UbText>
                  <UbStatusBadge
                    label={t(`payments.deposit.status.${deposit.status}`)}
                    tone={STATUS_TONE[deposit.status]}
                  />
                </UbStack>
                <UbStack gap={0} align="end" className="shrink-0">
                  <UbAmount value={deposit.heldAmount} label={t('payments.deposit.heldLabel')} />
                  <UbText variant="caption" tone="tertiary">
                    {t('payments.deposit.expectedCaption', {
                      amount: formatAmount(deposit.expectedAmount),
                    })}
                  </UbText>
                </UbStack>
              </UbStack>
              <UbStack direction="row" className="flex-wrap gap-2">
                {writable && canReceive(deposit) && (
                  <UbButton
                    variant="secondary"
                    onClick={(event) => {
                      opener.current = event.currentTarget;
                      setOpen({ kind: 'receive', deposit });
                    }}
                    data-testid="deposit-receive"
                  >
                    {t('payments.deposit.receive.action')}
                  </UbButton>
                )}
                {writable && canSpend(deposit) && charges && (
                  <UbButton
                    variant="secondary"
                    onClick={(event) => {
                      opener.current = event.currentTarget;
                      setOpen({ kind: 'apply', deposit });
                    }}
                    data-testid="deposit-apply"
                  >
                    {t('payments.deposit.apply.action')}
                  </UbButton>
                )}
                {writable && canSpend(deposit) && (
                  <UbButton
                    variant="secondary"
                    onClick={(event) => {
                      opener.current = event.currentTarget;
                      setOpen({ kind: 'refund', deposit });
                    }}
                    data-testid="deposit-refund"
                  >
                    {t('payments.deposit.refund.action')}
                  </UbButton>
                )}
                <UbButton
                  variant="ghost"
                  onClick={() => void printSlip(deposit)}
                  data-testid="deposit-print"
                >
                  {t('payments.deposit.slip.action')}
                </UbButton>
              </UbStack>
            </UbStack>
          );
        })}
      </UbStack>

      {open && open.kind !== 'apply' && (
        <DepositMoneyDrawer
          kind={open.kind}
          deposit={open.deposit}
          busy={busy}
          errors={deposits.errors}
          onClose={close}
          returnFocusRef={opener}
          onConfirm={(values) =>
            void submit(() =>
              open.kind === 'receive'
                ? deposits.submitReceive(open.deposit, values)
                : deposits.submitRefund(open.deposit, values)
            )
          }
        />
      )}
      {open?.kind === 'apply' && (
        <ApplyDepositDialog
          deposit={open.deposit}
          charges={chargesFor?.(open.deposit) ?? []}
          busy={busy}
          errors={deposits.errors}
          onClose={close}
          returnFocusRef={opener}
          onConfirm={(values) => void submit(() => deposits.submitApply(open.deposit, values))}
        />
      )}
      {slip &&
        createPortal(
          <UbBox className="ub-print-only ub-print-slip hidden">
            <DepositSlipPrint
              deposit={slip}
              businessName={tenant?.name ?? ''}
              branding={branding}
              t={t}
            />
          </UbBox>,
          document.body
        )}
    </UbCard>
  );
}
