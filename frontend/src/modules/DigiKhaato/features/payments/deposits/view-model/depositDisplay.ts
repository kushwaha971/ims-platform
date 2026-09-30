import {
  compareMoney,
  isNegativeAmount,
  isZeroAmount,
  subtractMoney,
  sumMoney,
} from 'src/utils/money';

import type { ApplyDepositRowForm, Deposit, DepositCharge } from '../types/deposit.types';

/**
 * A4b — pure figures for the deposit screens. The server is the authority on
 * every cap; these are what the screen shows while the merchant types, so the
 * "To return" figure moves with them and Save is offered only when it can work.
 */

/** What may still be received: expected − received. */
export const receivable = (deposit: Pick<Deposit, 'expectedAmount' | 'receivedAmount'>): string => {
  const left = subtractMoney(deposit.expectedAmount, deposit.receivedAmount);
  return isNegativeAmount(left) ? '0.00' : left;
};

export const canReceive = (deposit: Deposit): boolean =>
  deposit.status !== 'released' && !isZeroAmount(receivable(deposit));

export const canSpend = (deposit: Deposit): boolean =>
  deposit.status !== 'released' &&
  !isZeroAmount(deposit.heldAmount) &&
  !isNegativeAmount(deposit.heldAmount);

/**
 * The apply dialog's opening rows: each charge, filled oldest first from what
 * is held until it runs out — the merchant reads "₹120 from the deposit" and
 * changes it only when they mean something else.
 */
export const initialApplyRows = (
  held: string,
  charges: readonly DepositCharge[]
): ApplyDepositRowForm[] => {
  let left = held;
  return charges.map((charge) => {
    const take = compareMoney(charge.due, left) <= 0 ? charge.due : left;
    left = subtractMoney(left, take);
    return { ...charge, amount: isZeroAmount(take) ? '' : take };
  });
};

export const applyTotal = (rows: readonly Pick<ApplyDepositRowForm, 'amount'>[]): string =>
  sumMoney(rows.map((row) => row.amount || '0.00'));

/** FRD 00 PLT-X02 §8: "₹380 still held" — held − Σ applied, never below zero on screen. */
export const toReturn = (
  held: string,
  rows: readonly Pick<ApplyDepositRowForm, 'amount'>[]
): string => subtractMoney(held, applyTotal(rows));

export const overHeld = (
  held: string,
  rows: readonly Pick<ApplyDepositRowForm, 'amount'>[]
): boolean => compareMoney(applyTotal(rows), held) > 0;

/** A row asks for more than its charge still owes. */
export const overDue = (row: Pick<ApplyDepositRowForm, 'amount' | 'due'>): boolean =>
  !!row.amount && compareMoney(row.amount, row.due) > 0;
