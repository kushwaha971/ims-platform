'use client';

import type { ReactNode } from 'react';

import { UbStack, UbText } from 'src/design-system';

/**
 * One bill in a "which bills does this money go to" list — applying an
 * advance, allocating a payment, applying a deposit: the bill's number, a
 * caption (its date and due), and on the right what this money does to it (an
 * amount box, or the auto split). Each of the three dialogs drew this row and
 * its bordered list by hand (WP-03 D-04d); the list is `UbPanel as="ul"`.
 */
export function BillPickRow({
  number,
  caption,
  children,
}: Readonly<{
  number: string;
  caption: string;
  children: ReactNode;
}>): React.JSX.Element {
  return (
    <UbStack direction="row" justify="between" align="center" className="gap-3 px-3 py-2">
      <UbStack gap={0} className="min-w-0">
        <UbText variant="body-sm" className="ds-mono break-all">
          {number}
        </UbText>
        <UbText variant="caption" tone="tertiary">
          {caption}
        </UbText>
      </UbStack>
      {children}
    </UbStack>
  );
}
