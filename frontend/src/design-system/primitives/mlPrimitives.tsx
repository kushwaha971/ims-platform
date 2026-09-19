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
  return <div ref={ref} className={cn('flex flex-col gap-1 p-5', className)} {...rest} />;
});

export const MLCardContent = forwardRef<HTMLDivElement, MLCardProps>(function MLCardContent(
  { className, ...rest },
  ref
) {
  return <div ref={ref} className={cn('p-5', className)} {...rest} />;
});

export type MLBadgeVariant = 'neutral' | 'success' | 'warning' | 'error' | 'info';

export interface MLBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  readonly variant?: MLBadgeVariant;
  readonly className?: string;
}

const BADGE_VARIANT: Record<MLBadgeVariant, string> = {
  neutral: 'bg-surface-sunken text-text-secondary border-border-subtle',
  success: 'bg-success-dim text-success border-success/30',
  warning: 'bg-warning-dim text-warning border-warning/30',
  error: 'bg-error-dim text-error border-error/30',
  info: 'bg-info-dim text-info border-info/30',
};

export const MLBadge = forwardRef<HTMLSpanElement, MLBadgeProps>(function MLBadge(
  { variant = 'neutral', className, ...rest },
  ref
) {
  return (
    <span
      ref={ref}
      className={cn(
        'ds-label inline-flex items-center gap-1 rounded-pill border px-2 py-0.5',
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

export type MLButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type MLButtonSize = 'sm' | 'md' | 'lg';

export interface MLButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: MLButtonVariant;
  readonly size?: MLButtonSize;
  readonly className?: string;
}

const BUTTON_VARIANT: Record<MLButtonVariant, string> = {
  primary: 'bg-accent text-text-inverse hover:bg-accent-hover active:bg-accent-press',
  secondary: 'border border-border-strong bg-surface-card text-text-primary hover:bg-surface-hover',
  ghost: 'text-text-accent hover:bg-surface-hover',
  // §23.3: destructive is an OUTLINED danger in --form-error, never a red fill.
  destructive: 'border border-formError bg-transparent text-formError hover:bg-formError-dim',
};

const BUTTON_SIZE: Record<MLButtonSize, string> = {
  sm: 'h-[30px] px-3 ds-body-sm',
  md: 'h-9 px-4 ds-body-sm-medium',
  // 44px is the mobile touch-target floor (R-A-3).
  lg: 'h-11 px-5 ds-body-medium',
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
        'inline-flex items-center justify-center gap-2 rounded-control',
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

export interface MLToasterProps extends HTMLAttributes<HTMLDivElement> {
  readonly className?: string;
}

/**
 * The real `MLToaster` is sonner. The stand-in is a live region positioned
 * where sonner puts it; `UbSnackbar` renders its children into it and keeps the
 * single-channel contract of §19.12.2 either way.
 */
export const MLToaster = forwardRef<HTMLDivElement, MLToasterProps>(function MLToaster(
  { className, ...rest },
  ref
) {
  return (
    <div
      ref={ref}
      role="region"
      aria-live="polite"
      className={cn(
        'pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6',
        className
      )}
      {...rest}
    />
  );
});
