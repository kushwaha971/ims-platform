'use client';

import { memo, type ReactNode } from 'react';

import { cn } from 'src/utils/cn';

/**
 * Part 23 §23.3 — the quiet line under a control that says what the field wants
 * BEFORE the user gets it wrong. It is replaced by `UbFieldError` when there is
 * an error, never stacked with one: two lines of guidance under one input is
 * how a 360 px form runs out of screen.
 */
export interface UbInputHintProps {
  readonly id?: string;
  readonly children: ReactNode;
  readonly className?: string;
}

function UbInputHintBase({ id, children, className }: Readonly<UbInputHintProps>) {
  return (
    <p id={id} className={cn('ds-chip text-text-tertiary', className)}>
      {children}
    </p>
  );
}

UbInputHintBase.displayName = 'UbInputHint';
export const UbInputHint = memo(UbInputHintBase);
