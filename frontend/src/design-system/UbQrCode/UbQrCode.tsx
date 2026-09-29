'use client';

import { memo } from 'react';

/**
 * SAL-03 FR-4 `UbQrCode` — the UPI QR, drawn as SVG from the module matrix the
 * server's in-house encoder returns (`/upi-intent` → `qr.modules`). No QR
 * library on either side (ADR-021): the one encoder is `apps/common/qr.py`,
 * tested against the standard's vectors, and this only paints its output — one
 * `<path>` of unit squares with a four-module quiet zone, crisp at any size.
 *
 * R33 / A16 — in the design system since Wave A: the invoice, the receipt, the
 * Collect sheet and the share page draw it today, and library cards and gym
 * check-in cards are next. A component two modules need belongs here, never in
 * one of them (10-architecture §6 item 6).
 */
export interface UbQrCodeProps {
  readonly modules: readonly string[];
  /** Printed size, e.g. "28mm" on A4 or "32mm" on the thermal slip. */
  readonly size: string;
  readonly label: string;
}

const QUIET = 4;

function UbQrCodeBase({ modules, size, label }: UbQrCodeProps): React.JSX.Element {
  const count = modules.length + QUIET * 2;
  let d = '';
  modules.forEach((row, r) => {
    for (let c = 0; c < row.length; c += 1) {
      if (row[c] === '1') d += `M${c + QUIET},${r + QUIET}h1v1h-1z`;
    }
  });
  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${count} ${count}`}
      shapeRendering="crispEdges"
      // A flex item by default may shrink below its size: in the A4 sheet's
      // narrow payment column the 28 mm QR was squeezed to an unscannable
      // few millimetres (seen on the share page's phone print).
      className="shrink-0"
      data-testid="upi-qr"
    >
      <rect width={count} height={count} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}

export const UbQrCode = memo(UbQrCodeBase);
UbQrCode.displayName = 'UbQrCode';
