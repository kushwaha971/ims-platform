'use client';

import { memo } from 'react';

/**
 * SAL-03 FR-4 `UbQrCode` — the UPI QR, drawn as SVG from the module matrix the
 * server's in-house encoder returns (`/upi-intent` → `qr.modules`). No QR
 * library on either side (ADR-021): the one encoder is `apps/common/qr.py`,
 * tested against the standard's vectors, and this only paints its output — one
 * `<path>` of unit squares with a four-module quiet zone, crisp at any size.
 * Lives in the print directory, the one place raw SVG elements are allowed.
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
      data-testid="upi-qr"
    >
      <rect width={count} height={count} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}

export const UbQrCode = memo(UbQrCodeBase);
UbQrCode.displayName = 'UbQrCode';
