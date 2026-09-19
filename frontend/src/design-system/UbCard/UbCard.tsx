'use client';

import { memo, type ReactNode } from 'react';

import { MLCard, MLCardContent, MLCardHeader } from 'src/design-system/primitives';
import { cn } from 'src/utils/cn';

/**
 * Part 23 §23.3 — `UbCard` only adds Koper's card padding and radius defaults
 * on top of `MLCard`: one idea per card, 14 px radius, 20 px padding.
 */
export interface UbCardProps {
  readonly title?: string;
  readonly description?: string;
  /** One primary action per view (Koper); the card offers at most one. */
  readonly action?: ReactNode;
  readonly children?: ReactNode;
  /** Hairlines over boxes — a flat card sits directly on the canvas. */
  readonly elevated?: boolean;
  readonly padded?: boolean;
  readonly className?: string;
}

function UbCardBase({
  title,
  description,
  action,
  children,
  elevated = false,
  padded = true,
  className,
}: Readonly<UbCardProps>) {
  return (
    <MLCard className={cn(elevated && 'shadow-2', className)}>
      {(title || action) && (
        <MLCardHeader
          className={cn('flex-row items-start justify-between gap-4', !padded && 'p-4')}
        >
          <div className="flex flex-col gap-1">
            {title && <h2 className="ds-h3 text-text-primary">{title}</h2>}
            {description && <p className="ds-caption text-text-tertiary">{description}</p>}
          </div>
          {action}
        </MLCardHeader>
      )}
      <MLCardContent className={cn(title && 'pt-0', !padded && 'p-0')}>{children}</MLCardContent>
    </MLCard>
  );
}

UbCardBase.displayName = 'UbCard';
export const UbCard = memo(UbCardBase);
