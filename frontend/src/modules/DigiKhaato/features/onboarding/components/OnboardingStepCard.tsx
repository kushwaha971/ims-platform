'use client';

import { memo, type ReactNode } from 'react';

import { UbBox, UbStack, UbText } from 'src/design-system';
import { cn } from 'src/utils/cn';

/**
 * CR-2026-09-19-F — the surface a wizard step sits on, and its heading.
 *
 * It was `UbCard`. The review's first complaint about the desktop wizard was
 * that the step list read as a second object beside a card; layout A answers
 * that by giving the page a rail — and a rail with a card floating in the other
 * half is the same two-objects problem with a wider gap. So the box goes away
 * exactly where the rail appears:
 *
 *   · **below `sm`** — no box. 360 px cannot spare 2×20 px of card padding
 *     inside 2×16 px of page gutter to draw an edge around a form that already
 *     fills the width. This is the `(auth)` group's existing rule and the
 *     phone layout is unchanged by this change.
 *   · **`sm` to `lg`** — the card, because at those widths the column no longer
 *     fills the viewport and needs its own edge.
 *   · **`lg` and up** — no box again. The form is the page's right-hand part,
 *     not an object placed on it.
 *
 * The heading stays an `h2` at every width: the page's `h1` is the wizard's
 * title, and the step's title is the section beneath it. Removing the card must
 * not remove a level from the outline.
 */
export interface OnboardingStepCardProps {
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
  readonly className?: string;
}

function OnboardingStepCardBase({
  title,
  description,
  children,
  className,
}: Readonly<OnboardingStepCardProps>) {
  return (
    <UbBox
      as="section"
      className={cn(
        'sm:rounded-card sm:border sm:border-border-hairline sm:bg-surface-card sm:p-5',
        'lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0',
        className
      )}
    >
      <UbStack gap={1} className="pb-4">
        <UbText as="h2" variant="h3">
          {title}
        </UbText>
        {description !== undefined && description.length > 0 && (
          <UbText variant="caption" tone="tertiary">
            {description}
          </UbText>
        )}
      </UbStack>
      {children}
    </UbBox>
  );
}

OnboardingStepCardBase.displayName = 'OnboardingStepCard';
export const OnboardingStepCard = memo(OnboardingStepCardBase);
