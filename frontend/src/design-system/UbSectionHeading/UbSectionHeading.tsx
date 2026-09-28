'use client';

import { memo, type ReactNode } from 'react';

import { MoveRight } from 'lucide-react';

import { UbLink } from 'src/design-system/UbLink';
import { cn } from 'src/utils/cn';

/**
 * A section's title row, OUTSIDE its card — BrandHub `SectionHeading`
 * (dashboard "Needs attention · 3 items … View all →", Figma 13105:10332).
 *
 * The title is 14/20 medium in ink; `meta` sits right after it (a count, a
 * status word); `aside` or the "View all" link is pushed to the far end. The
 * card it names follows 12–16 px below, chosen by the caller's stack gap.
 */
export interface UbSectionHeadingProps {
  readonly title: ReactNode;
  /** Beside the title: "3 items", a count, a toned word. */
  readonly meta?: ReactNode;
  /** Right-aligned control — a switch, a small button. */
  readonly aside?: ReactNode;
  /** Right-aligned "View all →" link; ignored when `aside` is given. */
  readonly viewAll?: { readonly href: string; readonly label: string };
  /** The heading level; defaults to h2. */
  readonly as?: 'h2' | 'h3';
  readonly className?: string;
}

function UbSectionHeadingBase({
  title,
  meta,
  aside,
  viewAll,
  as: Heading = 'h2',
  className,
}: Readonly<UbSectionHeadingProps>) {
  return (
    <div className={cn('flex w-full min-w-0 items-center gap-3', className)}>
      <Heading className="ds-body-base-medium min-w-0 truncate text-text-primary">{title}</Heading>
      {meta !== undefined && meta !== null && (
        <span className="ds-body-s-regular shrink-0 text-text-tertiary">{meta}</span>
      )}
      {aside ? (
        <div className="ml-auto flex shrink-0 items-center gap-2">{aside}</div>
      ) : viewAll ? (
        <UbLink
          href={viewAll.href}
          variant="inherit"
          tone="inherit"
          underline={false}
          className="ds-body-s-medium ml-auto inline-flex shrink-0 items-center gap-2 text-text-tertiary transition-colors hover:text-text-primary"
        >
          {viewAll.label}
          <MoveRight className="h-3 w-3" aria-hidden />
        </UbLink>
      ) : null}
    </div>
  );
}

UbSectionHeadingBase.displayName = 'UbSectionHeading';
export const UbSectionHeading = memo(UbSectionHeadingBase);
