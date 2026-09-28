'use client';

import { useCallback, useState } from 'react';

import { CheckCircle2, QrCode, Smartphone } from 'lucide-react';

import {
  UbActionLink,
  UbButton,
  UbDrawer,
  UbMoneyInput,
  UbStack,
  UbStatusBanner,
  UbText,
} from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { useTranslation } from 'src/hooks/useTranslation';
import { compareMoney, formatAmount, formatInr } from 'src/utils/money';

import { UbQrCode } from '../../sales/components/print/UbQrCode';
import {
  selectCollectQr,
  selectCollectQrError,
  selectCollectQrStatus,
} from '../redux/paymentFormSlice';
import { fetchCollectQr } from '../redux/paymentThunk';

/** PAY-03 §10 — the NPCI P2P cap is a caption, not a refusal (EC-2). */
const UPI_P2P_CAP = '100000.00';

/**
 * PAY-03 FR-7 / FR-9 — "Collect ₹2,800": the shop's UPI QR with the amount and
 * a `PTY-…` reference, drawn from the server's local encoder, full size on the
 * phone the merchant turns towards the customer. "Open UPI app" hands the same
 * `upi://` link to an app on this phone (FR-10), and "Mark received" is the
 * bridge to PAY-01 — nothing is recorded by showing a QR (BR-7), so the
 * merchant confirms the money arrived and the payment drawer opens with UPI
 * and this amount preset.
 *
 * The QR is black on white whatever the theme — scanners are not themed.
 */
export function CollectQrSheet({
  partyId,
  partyName,
  receivable,
  onClose,
  onMarkReceived,
}: Readonly<{
  partyId: string;
  partyName: string;
  receivable: string;
  onClose: () => void;
  onMarkReceived: (amount: string) => void;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { can } = usePermissions();
  const qr = useAppSelector(selectCollectQr);
  const status = useAppSelector(selectCollectQrStatus);
  const error = useAppSelector(selectCollectQrError);
  const [amount, setAmount] = useState(
    compareMoney(receivable || '0', '0.00') > 0 ? receivable : ''
  );
  const [shownFor, setShownFor] = useState<string | null>(null);

  const valid = !!amount && compareMoney(amount, '0.00') > 0;
  const show = useCallback(() => {
    if (!valid) return;
    setShownFor(amount);
    void dispatch(fetchCollectQr({ amount, partyId }));
  }, [dispatch, amount, partyId, valid]);

  const showing = shownFor !== null && shownFor === amount && status === 'succeeded' && qr;
  const missingVpa = error?.code === 'upi_vpa_missing';

  return (
    <UbDrawer
      open
      onOpenChange={(next) => !next && onClose()}
      title={t('payments.upi.collectFrom', { name: partyName })}
      closeLabel={t('common.action.close')}
      footer={
        showing && can('payments.payment.write') ? (
          <UbButton
            icon={<CheckCircle2 className="h-4 w-4" aria-hidden />}
            onClick={() => onMarkReceived(amount)}
            data-testid="collect-mark-received"
          >
            {t('payments.upi.markReceived')}
          </UbButton>
        ) : (
          <UbButton
            icon={<QrCode className="h-4 w-4" aria-hidden />}
            disabled={!valid}
            busy={status === 'loading'}
            onClick={show}
            data-testid="collect-show-qr"
          >
            {t('payments.upi.showQr')}
          </UbButton>
        )
      }
    >
      <UbStack gap={4}>
        <UbMoneyInput
          id="collect-amount"
          aria-label={t('payments.upi.amount')}
          placeholder={t('payments.amount.placeholder')}
          value={amount}
          onChange={setAmount}
          inputMode="decimal"
        />
        {valid && compareMoney(amount, UPI_P2P_CAP) > 0 && (
          <UbText variant="caption" tone="warning">
            {t('payments.upi.limit', { amount: formatInr(UPI_P2P_CAP) })}
          </UbText>
        )}
        {missingVpa && <UbStatusBanner tone="info" title={t('payments.upi.missing')} />}
        {status === 'failed' && !missingVpa && (
          <UbStatusBanner tone="error" title={t('payments.upi.error')} />
        )}
        {showing && qr && (
          <UbStack gap={2} align="center" data-testid="collect-qr">
            <UbStack className="rounded-card bg-white p-3">
              <UbQrCode
                modules={qr.qr.modules}
                size="256px"
                label={t('payments.upi.qrLabel', {
                  amount: formatAmount(qr.amount ?? amount),
                  shop: qr.payee,
                })}
              />
            </UbStack>
            <UbText variant="body-sm-medium">{formatInr(qr.amount ?? amount)}</UbText>
            <UbText variant="caption" tone="tertiary">
              {`${qr.payee} · ${qr.vpa}`}
            </UbText>
            <UbText variant="caption" tone="tertiary">
              {t('payments.upi.scanAny')}
            </UbText>
            <UbStack className="sm:hidden">
              <UbActionLink
                href={qr.upiUrl}
                variant="secondary"
                icon={<Smartphone className="h-4 w-4" aria-hidden />}
              >
                {t('payments.upi.openApp')}
              </UbActionLink>
            </UbStack>
          </UbStack>
        )}
      </UbStack>
    </UbDrawer>
  );
}
