'use client';

/* =============================================================================
 * ⚠️  STAND-IN FOR `ml-uikit` — see ./index.ts for the swap instructions.
 * =============================================================================
 *
 * A minimal local implementation of the `ML*` primitives that Sprint 0's design
 * -system wave (Part 32 S0-56) needs: Card, Badge, Alert, Skeleton, Empty,
 * Button, Spinner, Separator and the Toaster host. Behaviour matches what the
 * real shadcn/Radix primitives provide for these non-interactive-overlay cases
 * (semantic element + role + token classes); anything that needs a focus trap
 * or a portal — dialog, drawer, popover, command — is deliberately ABSENT so
 * that nobody builds `UbDialog` on a fake primitive. Those arrive with the real
 * package in the design-system waves of Sprints 1–3.
 */

import { forwardRef, type HTMLAttributes, type ButtonHTMLAttributes, type ReactNode } from 'react';

import { cn } from 'src/utils/cn';

export interface MLCardProps extends HTMLAttributes<HTMLDivElement> {
  readonly className?: string;
}

export const MLCard = forwardRef<HTMLDivElement, MLCardProps>(function MLCard(
  { className, ...rest },
  ref
) {
  return (
    <div
      ref={ref}
      className={cn('rounded-card border border-border-hairline bg-surface-card', className)}
      {...rest}
    />
  );
});

export const MLCardHeader = forwardRef<HTMLDivElement, MLCardProps>(function MLCardHeader(
  { className, ...rest },
  ref
) {
  return <div ref={ref} className={cn('flex flex-col gap-1 p-4', className)} {...rest} />;
});

export const MLCardContent = forwardRef<HTMLDivElement, MLCardProps>(function MLCardContent(
  { className, ...rest },
  ref
) {
  return <div ref={ref} className={cn('p-4', className)} {...rest} />;
});

export type MLBadgeVariant = 'neutral' | 'success' | 'warning' | 'error' | 'info';

export interface MLBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  readonly variant?: MLBadgeVariant;
  readonly className?: string;
}

/**
 * BrandHub's canonical status tones (`Customer/utils/statusColor.ts`), which are
 * a MUTED FILL plus the solid tone as text, and no border:
 *
 *   yellow  bg-warning-muted     text-warning       #FFF0D8 on #B6760E
 *   blue    bg-info-muted        text-info          #E9F0FF on #245FE0
 *   green   bg-success-muted     text-success       #E8F6ED on #307F4A
 *   red     bg-destructive-muted text-destructive   #FEEBEB on #E12121
 *   neutral bg-muted             text-muted-fg      #F1F1F1 on #7F7D83
 *
 * The border is what changed. These carried `border-success/30` and friends, and
 * a 30%-alpha ring around an already-tinted pill reads as a second, fuzzier edge
 * — at 12px it is just noise. BrandHub's chips are borderless filled pills and
 * are cleaner for it. The fill/text pairings here were already the same idea in
 * this product's own tokens, so only the ring comes off.
 *
 * BrandHub has a sixth tone, `purple`/`stored`, for a warehouse state this
 * product does not have. Adding it now would be a colour nobody can trigger.
 */
const BADGE_VARIANT: Record<MLBadgeVariant, string> = {
  neutral: 'bg-surface-sunken text-text-secondary',
  success: 'bg-success-dim text-success',
  warning: 'bg-warning-dim text-warning',
  error: 'bg-error-dim text-error',
  info: 'bg-info-dim text-info',
};

export const MLBadge = forwardRef<HTMLSpanElement, MLBadgeProps>(function MLBadge(
  { variant = 'neutral', className, ...rest },
  ref
) {
  return (
    <span
      ref={ref}
      className={cn(
        'ds-chip inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-pill px-2 py-0.5',
        BADGE_VARIANT[variant],
        className
      )}
      {...rest}
    />
  );
});

export type MLAlertVariant = 'info' | 'success' | 'warning' | 'error';

export interface MLAlertProps extends HTMLAttributes<HTMLDivElement> {
  readonly variant?: MLAlertVariant;
  readonly className?: string;
}

const ALERT_VARIANT: Record<MLAlertVariant, string> = {
  info: 'border-info/40 bg-info-dim text-text-primary',
  success: 'border-success/40 bg-success-dim text-text-primary',
  warning: 'border-warning/40 bg-warning-dim text-text-primary',
  // §23.5: outlined block, never a filled red one.
  error: 'border-formError bg-formError-dim text-text-primary',
};

export const MLAlert = forwardRef<HTMLDivElement, MLAlertProps>(function MLAlert(
  { variant = 'info', className, ...rest },
  ref
) {
  return (
    <div
      ref={ref}
      role="status"
      className={cn(
        'flex w-full items-start gap-3 rounded-md border p-4',
        ALERT_VARIANT[variant],
        className
      )}
      {...rest}
    />
  );
});

export const MLAlertTitle = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  function MLAlertTitle({ className, ...rest }, ref) {
    return <p ref={ref} className={cn('ds-body-sm-medium', className)} {...rest} />;
  }
);

export const MLAlertDescription = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(function MLAlertDescription({ className, ...rest }, ref) {
  return <p ref={ref} className={cn('ds-caption text-text-tertiary', className)} {...rest} />;
});

export interface MLSkeletonProps extends HTMLAttributes<HTMLDivElement> {
  readonly className?: string;
}

export const MLSkeleton = forwardRef<HTMLDivElement, MLSkeletonProps>(function MLSkeleton(
  { className, ...rest },
  ref
) {
  return (
    <div
      ref={ref}
      aria-hidden
      className={cn('animate-pulse rounded-sm bg-surface-sunken', className)}
      {...rest}
    />
  );
});

export interface MLEmptyProps extends HTMLAttributes<HTMLDivElement> {
  readonly className?: string;
  readonly children?: ReactNode;
}

export const MLEmpty = forwardRef<HTMLDivElement, MLEmptyProps>(function MLEmpty(
  { className, ...rest },
  ref
) {
  return (
    <div
      ref={ref}
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-12 text-center',
        className
      )}
      {...rest}
    />
  );
});

export const MLEmptyTitle = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  function MLEmptyTitle({ className, ...rest }, ref) {
    return <p ref={ref} className={cn('ds-h3 text-text-primary', className)} {...rest} />;
  }
);

export const MLEmptyDescription = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(function MLEmptyDescription({ className, ...rest }, ref) {
  return (
    <p ref={ref} className={cn('ds-body-sm max-w-prose text-text-tertiary', className)} {...rest} />
  );
});

export type MLButtonVariant =
  | 'primary'
  | 'secondary'
  /** BrandHub's `outline-neutral`: a hairline box on the card surface. */
  | 'outlineNeutral'
  | 'ghost'
  | 'link'
  | 'destructive';
export type MLButtonSize = 'sm' | 'md' | 'lg';

export interface MLButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: MLButtonVariant;
  readonly size?: MLButtonSize;
  readonly className?: string;
}

const BUTTON_VARIANT: Record<MLButtonVariant, string> = {
  primary: 'bg-accent text-text-inverse hover:bg-accent-hover active:bg-accent-press',
  /* BrandHub's `secondary` is a FILL (`bg-[#f1f1f1] hover:bg-[#e6e6e6]`), not
     an outline. What this called `secondary` was actually its
     `outline-neutral`, and with the dark `--border-strong` rather than a
     hairline — so a secondary button read heavier than a primary one. Both now
     exist under the names BrandHub gives them. */
  secondary: 'bg-surface-sunken text-text-primary hover:bg-surface-hover',
  outlineNeutral:
    'border border-border-subtle bg-surface-card text-text-primary hover:bg-surface-hover',
  /* `ghost` was `--text-accent` indigo, so every ghost button in the product
     read as a link. BrandHub's is plain ink. */
  ghost: 'text-text-primary hover:bg-surface-hover',
  link: 'text-text-accent underline-offset-4 hover:underline',
  // §23.3: destructive is an OUTLINED danger in --form-error, never a red fill.
  destructive: 'border border-formError bg-transparent text-formError hover:bg-formError-dim',
};

const BUTTON_SIZE: Record<MLButtonSize, string> = {
  /* Figma "button": 12 px side padding, 14/20 text in a 36 px box; the
     compact in-row variant is 28 px with 12/16 text. */
  sm: 'h-7 px-3 ds-body-base-medium',
  md: 'h-10 px-4 ds-body-base-medium',
  // 44px is the mobile touch-target floor (R-A-3).
  lg: 'h-11 px-5 ds-body-base-medium',
};

export const MLButton = forwardRef<HTMLButtonElement, MLButtonProps>(function MLButton(
  { variant = 'primary', size = 'md', type = 'button', className, ...rest },
  ref
) {
  return (
    <button
      ref={ref}

      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control [&_svg]:shrink-0',
        'transition-colors duration-fast ease-standard',
        'disabled:cursor-not-allowed disabled:opacity-45',
        BUTTON_VARIANT[variant],
        BUTTON_SIZE[size],
        className
      )}
      {...rest}
    />
  );
});

export const MLSpinner = forwardRef<HTMLSpanElement, HTMLAttributes<HTMLSpanElement>>(
  function MLSpinner({ className, ...rest }, ref) {
    return (
      <span
        ref={ref}
        aria-hidden
        className={cn(
          'inline-block h-4 w-4 animate-spin rounded-pill border-2 border-current border-t-transparent',
          className
        )}
        {...rest}
      />
    );
  }
);

export const MLSeparator = forwardRef<HTMLHRElement, HTMLAttributes<HTMLHRElement>>(
  function MLSeparator({ className, ...rest }, ref) {
    return <hr ref={ref} className={cn('border-t border-border-hairline', className)} {...rest} />;
  }
);
