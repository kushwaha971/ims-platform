'use client';

import { type ReactNode } from 'react';

import { MLTabs, type MLTabDescriptor } from 'src/design-system/primitives';

/**
 * Part 23 §23.3 — a scope control, not navigation: several views of ONE thing,
 * where switching changes what is shown and nothing else.
 *
 * CR-2026-09-19-A retired its first consumer — the login screen's
 * "Password | OTP" pair — by making authentication email + password only. The
 * component stays: a scope control is what the ledger's date ranges and the
 * report filters of Sprint 2 are built from, and it is in the gallery so it
 * cannot rot while it waits.
 *
 * The wrapper adds nothing but the type surface, which is the point: the day
 * `ml-uikit` arrives, this file's body becomes a Radix `Tabs.Root` and no
 * feature changes. It is NOT memoised — it takes `children`, which is a new
 * reference on every parent render.
 */
export interface UbTabsProps<T extends string> {
  readonly value: T;
  readonly onValueChange: (value: T) => void;
  readonly tabs: readonly MLTabDescriptor<T>[];
  /** The group's accessible name, translated by the caller. */
  readonly ariaLabel: string;
  readonly children: ReactNode;
  readonly className?: string;
  /** `fit` — tabs as wide as their labels; `fill` (default) shares the row. */
  readonly layout?: 'fill' | 'fit';
  /** A control at the right end of the tab row, scoping every tab. */
  readonly trailing?: ReactNode;
}

export function UbTabs<T extends string>({
  value,
  onValueChange,
  tabs,
  ariaLabel,
  children,
  className,
  layout,
  trailing,
}: Readonly<UbTabsProps<T>>): React.JSX.Element {
  return (
    <MLTabs
      value={value}
      onValueChange={onValueChange}
      tabs={tabs}
      ariaLabel={ariaLabel}
      className={className}
      layout={layout}
      trailing={trailing}
    >
      {children}
    </MLTabs>
  );
}

UbTabs.displayName = 'UbTabs';
