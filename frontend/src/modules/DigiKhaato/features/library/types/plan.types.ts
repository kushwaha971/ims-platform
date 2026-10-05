/** W03 — a fee plan (a membership type) as its form holds it. Money is a decimal string. */
export interface PlanFormValues {
  name: string;
  feeAmount: string;
  /** '1', '3', '6' or '12' — Monthly, Quarterly, Half-yearly, Yearly. */
  validityMonths: string;
  admissionFee: string;
  depositAmount: string;
}

export const PLAN_LENGTHS = ['1', '3', '6', '12'] as const;
