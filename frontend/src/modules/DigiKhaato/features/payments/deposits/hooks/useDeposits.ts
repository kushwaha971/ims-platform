'use client';

import { useCallback, useEffect, useState } from 'react';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useIdempotencyKey } from 'src/hooks/useIdempotencyKey';
import { usePermissions } from 'src/hooks/usePermissions';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import type { ApiErrorShape } from 'src/types/api.types';
import { formatAmount } from 'src/utils/money';

import { selectDeposits, type DepositState } from '../redux/depositSlice';
import {
  applyDeposit,
  fetchPartyDeposits,
  receiveDeposit,
  refundDeposit,
} from '../redux/depositThunk';

import type {
  ApplyDepositFormValues,
  Deposit,
  DepositMoneyFormValues,
} from '../types/deposit.types';

/**
 * A4b — a party's deposits and the three money acts on them (FRD 00 PLT-X02).
 *
 * Read on every mount for the party on screen (a deposit moves from a void on
 * the receipt page too, which does not mark this slice), and again when a write
 * elsewhere marks it stale. Refusals the merchant can act on — the figure moved
 * on another counter, a stale version, more than is held — come back as the
 * server's words above Save and re-read the deposits behind the form.
 */
export interface UseDepositsResult extends DepositState {
  readonly canRead: boolean;
  readonly canWrite: boolean;
  readonly errors: readonly string[];
  readonly clearErrors: () => void;
  readonly submitReceive: (deposit: Deposit, values: DepositMoneyFormValues) => Promise<boolean>;
  readonly submitRefund: (deposit: Deposit, values: DepositMoneyFormValues) => Promise<boolean>;
  readonly submitApply: (deposit: Deposit, values: ApplyDepositFormValues) => Promise<boolean>;
}

const RECOVERABLE = new Set([
  'validation_error',
  'over_allocated',
  'deposit_insufficient',
  'deposit_released',
  'stale_version',
  'document_not_open',
]);

export const useDeposits = (partyId: string): UseDepositsResult => {
  const dispatch = useAppDispatch();
  const state = useAppSelector(selectDeposits);
  const { can, hasModule } = usePermissions();
  const canRead = hasModule('payments') && can('payments.payment.read');
  const canWrite = hasModule('payments') && can('payments.payment.write');
  // One key per act, as the receipt page does: a retry of the SAME act after a
  // dropped connection replays, and a different act never reuses its key.
  const receiveKey = useIdempotencyKey();
  const refundKey = useIdempotencyKey();
  const applyKey = useIdempotencyKey();
  const [errors, setErrors] = useState<readonly string[]>([]);

  useEffect(() => {
    if (!canRead) return undefined;
    const request = dispatch(fetchPartyDeposits(partyId));
    return () => request.abort();
  }, [dispatch, partyId, canRead]);

  useEffect(() => {
    if (canRead && state.stale && state.partyId === partyId) {
      void dispatch(fetchPartyDeposits(partyId));
    }
  }, [dispatch, canRead, state.stale, state.partyId, partyId]);

  const settle = useCallback(
    async (
      write: () => Promise<{ deposit: Deposit; paymentNumber: string }>,
      rotate: () => void,
      doneId: string
    ): Promise<boolean> => {
      setErrors([]);
      try {
        const result = await write();
        rotate();
        dispatch(
          showSnackbar({
            severity: 'success',
            id: doneId,
            params: {
              number: result.paymentNumber,
              held: formatAmount(result.deposit.heldAmount),
            },
          })
        );
        return true;
      } catch (thrown) {
        const apiError = thrown as ApiErrorShape;
        if (RECOVERABLE.has(apiError.code)) {
          rotate();
          void dispatch(fetchPartyDeposits(partyId));
          setErrors([apiError.message]);
        }
        return false;
      }
    },
    [dispatch, partyId]
  );

  const { key: receiveIdem, rotate: rotateReceive } = receiveKey;
  const submitReceive = useCallback(
    (deposit: Deposit, values: DepositMoneyFormValues) =>
      settle(
        () => dispatch(receiveDeposit({ deposit, values, idempotencyKey: receiveIdem })).unwrap(),
        rotateReceive,
        'payments.deposit.receive.done'
      ),
    [dispatch, receiveIdem, rotateReceive, settle]
  );
  const { key: refundIdem, rotate: rotateRefund } = refundKey;
  const submitRefund = useCallback(
    (deposit: Deposit, values: DepositMoneyFormValues) =>
      settle(
        () => dispatch(refundDeposit({ deposit, values, idempotencyKey: refundIdem })).unwrap(),
        rotateRefund,
        'payments.deposit.refund.done'
      ),
    [dispatch, refundIdem, rotateRefund, settle]
  );
  const { key: applyIdem, rotate: rotateApply } = applyKey;
  const submitApply = useCallback(
    (deposit: Deposit, values: ApplyDepositFormValues) =>
      settle(
        () => dispatch(applyDeposit({ deposit, values, idempotencyKey: applyIdem })).unwrap(),
        rotateApply,
        'payments.deposit.apply.done'
      ),
    [dispatch, applyIdem, rotateApply, settle]
  );

  const clearErrors = useCallback(() => setErrors([]), []);

  return {
    ...state,
    canRead,
    canWrite,
    errors,
    clearErrors,
    submitReceive,
    submitRefund,
    submitApply,
  };
};
