'use client';

import { memo, type ReactNode } from 'react';

import { UbEmptyState, type UbEmptyStateVariant } from 'src/design-system/UbEmptyState';
import type { UbRequestIdFields } from 'src/design-system/UbRequestId';

import type { UbGridState } from './types';

/**
 * Part 17 §17.0.3 — three empty states everywhere, and the grid is what decides
 * WHICH of the three the reader is looking at. The copy stays with the feature,
 * because copy is translated and a `Ub*` never reaches for `react-intl`.
 *
 * The distinction is not cosmetic. "No customers yet" under a search box the
 * merchant has just typed into is a lie, and "Clear filters" on a first-run
 * screen offers to clear filters that do not exist.
 */
/**
 * `requestId` / `requestIdLabel` — error variant only: the "Reference <id>"
 * line that joins a screenshot to a log (R-E-4). The label is required with
 * the id (UbRequestIdFields), which is what keeps a bare UUID off the screen.
 */
export type UbDataGridEmptyCopy = UbDataGridEmptyCopyBase & UbRequestIdFields;

interface UbDataGridEmptyCopyBase {
  readonly title: string;
  readonly description?: string;
  /** Exactly one action: the move that closes the gap. */
  readonly action?: ReactNode;
}

export interface UbDataGridEmptyStates {
  readonly firstUse: UbDataGridEmptyCopy;
  readonly filtered: UbDataGridEmptyCopy;
  readonly error: UbDataGridEmptyCopy;
}

const VARIANT: Readonly<Record<string, UbEmptyStateVariant>> = {
  empty: 'firstUse',
  'filtered-empty': 'filtered',
  error: 'error',
};

export interface UbDataGridEmptyStateProps {
  readonly state: UbGridState;
  readonly copy: UbDataGridEmptyStates;
  readonly className?: string;
}

function UbDataGridEmptyStateBase({ state, copy, className }: Readonly<UbDataGridEmptyStateProps>) {
  if (state === 'rows' || state === 'loading') return null;

  const variant = VARIANT[state] ?? 'firstUse';
  const chosen =
    state === 'error' ? copy.error : state === 'filtered-empty' ? copy.filtered : copy.firstUse;

  const common = {
    variant,
    title: chosen.title,
    description: chosen.description,
    action: chosen.action,
    className,
  };
  // The request id is the error variant's alone, and never without its label.
  const idLabel = state === 'error' ? chosen.requestIdLabel : undefined;

  return idLabel ? (
    <UbEmptyState {...common} requestId={chosen.requestId} requestIdLabel={idLabel} />
  ) : (
    <UbEmptyState {...common} />
  );
}

UbDataGridEmptyStateBase.displayName = 'UbDataGridEmptyState';
export const UbDataGridEmptyState = memo(UbDataGridEmptyStateBase);
