'use client';

import { memo } from 'react';

/**
 * R-E-4 — the request id of a failure, printed as "Reference 3f2b…": the one
 * thing that joins a merchant's screenshot to a backend log line.
 *
 * It is ONE component because it was drawn four ways — a bare `ds-mono` line
 * in `UbEmptyState`, `UbSnackbar` and `PlanLimitDialog`, and "Reference …" only
 * in the archive dialog's banner — and the bare ones are what QA's B5 caught:
 * the party list's error state showed a 36-character hex string under "Try
 * again" with nothing saying what it was for. The label is passed translated
 * (`common.error.reference`), because a `Ub*` never reaches for i18n.
 *
 * The id keeps its own `ds-mono` run so it stays exactly findable and
 * selectable on its own, and may break anywhere: a UUID has no spaces, and on
 * a 328 px card it must wrap rather than push the panel wider.
 */
export interface UbRequestIdProps {
  readonly id: string;
  /** "Reference", translated by the caller. */
  readonly label: string;
  readonly className?: string;
}

/** The same line as a plain string, for surfaces that take text (a banner's description). */
export const formatRequestReference = (label: string, id: string): string => `${label} ${id}`;

/**
 * Owner, 7 Oct 2026: "in any error, I do not want the reference". A merchant
 * reads an error to know what to do next, and a 36-character id under it is
 * noise to them. So this draws NOTHING, in every snackbar, empty state and
 * dialog at once — the one switch, rather than fifty callers edited. The id is
 * still sent as `X-Request-Id`, logged by the server and kept on the audit
 * row, so support can still join a complaint to its log line; the props stay
 * so turning it back on is this function and nothing else.
 */
function UbRequestIdBase(_props: Readonly<UbRequestIdProps>): null {
  return null;
}

UbRequestIdBase.displayName = 'UbRequestId';
export const UbRequestId = memo(UbRequestIdBase);

/**
 * The prop pair every surface that can print a request id takes. The union is
 * the enforcement: an id without its label does not type-check, so a new
 * caller cannot bring the bare UUID back.
 */
export type UbRequestIdFields =
  | { readonly requestId?: null; readonly requestIdLabel?: string }
  | { readonly requestId: string | null | undefined; readonly requestIdLabel: string };
