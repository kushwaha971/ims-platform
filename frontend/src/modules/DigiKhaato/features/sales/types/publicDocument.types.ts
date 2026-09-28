import type { Locale } from 'src/types/domain.types';

import type { SalesDocument, UpiIntent } from './sales.types';
import type { PrintBranding } from '../redux/salesThunk';

/**
 * SAL-03 FR-5 — the customer's copy of a shared document, from the
 * unauthenticated `GET /public/d/{token}`. The document is mapped into the
 * same `SalesDocument` the merchant's print sheet renders, so the customer
 * sees exactly the paper; the fields the allow-listed payload does not carry
 * (ids, version, created-by, links other than "against") are empty.
 */
export interface PublicDocument {
  readonly document: SalesDocument;
  readonly branding: PrintBranding;
  /** The shop's language — the page's default when the customer has not chosen. */
  readonly locale: Locale;
  /** "Pay ₹X" — present only while money is owed and the shop has a UPI ID. */
  readonly upi: UpiIntent | null;
}

/**
 * Why the page could not show the document. `unavailable` is ONE state for an
 * unknown, expired and revoked token alike (§19: the page must not reveal
 * which), `rate_limited` is the 429, and `failed` is anything the customer can
 * retry (no connection, a timeout, a 5xx).
 */
export type PublicDocumentFailure = 'unavailable' | 'rate_limited' | 'failed';
