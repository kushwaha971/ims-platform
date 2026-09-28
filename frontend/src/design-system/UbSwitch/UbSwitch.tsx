'use client';

import { memo, useId, type ReactNode } from 'react';

import * as SwitchPrimitive from '@radix-ui/react-switch';

import { cn } from 'src/utils/cn';

/**
 * Part 23 — the on/off control, ported from BrandHub's `BrandHubSwitch`.
 *
 * It had no counterpart here at all: the design system shipped a checkbox, a
 * radio group and no switch, so the first settings screen that wants "WhatsApp
 * reminders: on" has nothing to render. The geometry below is BrandHub's
 * exactly — a 33×18 track with a 16px thumb travelling 16px — because a switch
 * is a shape people recognise before they read it, and one a few pixels off
 * reads as a different control.
 *
 * ── The 44px hit area is a wrapper, not a bigger switch ─────────────────────
 * The track stays 18px tall; the LABEL around it is `min-h-11` and is part of
 * the target. So the control looks like BrandHub's and is still thumb-sized on
 * a phone, which is the trade this product makes everywhere — see
 * `ML_CONTROL_BASE`. Making the switch itself 44px would be a different
 * component wearing the same name.
 *
 * ── The label is inside the target ──────────────────────────────────────────
 * `<label>` wraps both, so tapping the words toggles the switch. That is not
 * decoration: on a 360px screen the words are four times the target the switch
 * is, and a switch whose label does nothing is a switch people miss.
 */
export interface UbSwitchProps {
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
  /** Always present: an unlabelled switch states neither what it does nor which
   *  way is on. Pass a node when it needs emphasis, a string when it does not. */
  readonly label: ReactNode;
  readonly description?: ReactNode;
  readonly disabled?: boolean;
  readonly id?: string;
  readonly className?: string;
}

function UbSwitchBase({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
  id,
  className,
}: Readonly<UbSwitchProps>) {
  const generated = useId();
  const switchId = id ?? generated;
  const descriptionId = description ? `${switchId}-description` : undefined;

  return (
    <label
      htmlFor={switchId}
      className={cn(
        'flex min-h-11 w-full cursor-pointer items-center justify-between gap-3',
        disabled && 'cursor-not-allowed opacity-60',
        className
      )}
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="ds-body-sm text-text-primary">{label}</span>
        {description && (
          <span id={descriptionId} className="ds-caption text-text-tertiary">
            {description}
          </span>
        )}
      </span>

      <SwitchPrimitive.Root
        id={switchId}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-describedby={descriptionId}
        className={cn(
          // The row is the target where the switch has one (`min-h-11` label);
          // `.ub-hit` covers a caller that tightens the row (a toolbar toggle).
          'ub-hit peer inline-flex h-[18px] w-[33px] shrink-0 items-center rounded-pill border-0',
          'transition-colors duration-fast ease-standard',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed',
          'data-[state=checked]:bg-accent data-[state=unchecked]:bg-border-strong'
        )}
      >
        <SwitchPrimitive.Thumb
          className={cn(
            'pointer-events-none block size-4 rounded-pill bg-surface-card shadow-sm',
            'transition-transform duration-fast ease-standard',
            'data-[state=checked]:translate-x-[16px] data-[state=unchecked]:translate-x-px'
          )}
        />
      </SwitchPrimitive.Root>
    </label>
  );
}

UbSwitchBase.displayName = 'UbSwitch';
export const UbSwitch = memo(UbSwitchBase);
