/**
 * Shop P0 — the UPI pay link: one https page and one QR for any amount owed, in
 * every module (the server's `apps.payments.services.pay_link`). Money is a string.
 */
export interface PayLink {
  /** The https page a message carries — QR, amount and "Pay by UPI". */
  readonly url: string;
  readonly upiUrl: string;
  readonly vpa: string;
  readonly amount: string;
  readonly note: string;
  readonly qrModules: readonly string[];
}

/** What the payer's page shows: the same QR, under the business's own name. */
export interface PublicPayLink {
  readonly businessName: string;
  readonly upiUrl: string;
  readonly vpa: string;
  readonly amount: string;
  readonly note: string;
  readonly reference: string;
  readonly qrModules: readonly string[];
}

export type PublicPayFailure = 'unavailable' | 'rate_limited' | 'failed';
