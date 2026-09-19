'use client';

import { memo, useCallback, type KeyboardEvent } from 'react';

import { UbGrid, UbPressable, UbText } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { cn } from 'src/utils/cn';

import {
  BUSINESS_TYPES,
  BUSINESS_TYPE_CONFIG,
  type BusinessType,
} from '../constants/businessTypes';

/**
 * PLT-03 §7 — the nine business-type tiles.
 *
 * It is a `radiogroup`, not nine buttons: exactly one may be chosen, the choice
 * is the field's value, and a screen reader should say "3 of 9 selected", which
 * nine buttons cannot say. T-PLT-03-8 asks for keyboard navigation, so the
 * roving tabindex is the real WAI-ARIA one — arrows move AND select, Home and
 * End jump, and only the chosen tile is in the tab order.
 *
 * §8 — each tile carries a one-line hint of what it turns on ("Stock, bills,
 * udhaar"), because "Wholesale" and "Trader / mandi" are not self-explanatory
 * to the person choosing between them.
 */
export interface BusinessTypeGridProps {
  readonly value: BusinessType | '';
  readonly onChange: (value: BusinessType) => void;
  readonly invalid?: boolean;
  readonly describedBy?: string;
  readonly ariaLabel: string;
  readonly className?: string;
}

function BusinessTypeGridBase({
  value,
  onChange,
  invalid,
  describedBy,
  ariaLabel,
  className,
}: Readonly<BusinessTypeGridProps>) {
  const { t } = useTranslation();

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const index = BUSINESS_TYPES.indexOf(value as BusinessType);
      const last = BUSINESS_TYPES.length - 1;
      let next = index < 0 ? 0 : index;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        next = index >= last ? 0 : index + 1;
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        next = index <= 0 ? last : index - 1;
      } else if (event.key === 'Home') {
        next = 0;
      } else if (event.key === 'End') {
        next = last;
      } else {
        return;
      }
      event.preventDefault();
      const target = BUSINESS_TYPES[next];
      if (target) onChange(target);
    },
    [value, onChange]
  );

  return (
    // Two columns at 320 px, three from `sm`. Never one: nine tiles in a single
    // column is a scroll, and a scroll is a decision the merchant cannot see
    // all of.
    <UbGrid
      role="radiogroup"
      aria-label={ariaLabel}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      onKeyDown={onKeyDown}
      columns={{ base: 2, sm: 3 }}
      gap={2}
      className={className}
    >
      {BUSINESS_TYPES.map((type) => {
        const config = BUSINESS_TYPE_CONFIG[type];
        const Icon = config.icon;
        const selected = value === type;
        return (
          <UbPressable
            key={type}
            role="radio"
            aria-checked={selected}
            tabIndex={selected || (!value && type === BUSINESS_TYPES[0]) ? 0 : -1}
            onClick={() => onChange(type)}
            className={cn(
              'flex min-h-[88px] flex-col items-start gap-1 rounded-card border p-3',
              selected
                ? 'border-accent bg-accent-quiet'
                : 'border-border-subtle bg-surface-card hover:bg-surface-hover'
            )}
          >
            <Icon
              aria-hidden
              className={cn('h-5 w-5', selected ? 'text-text-accent' : 'text-text-tertiary')}
            />
            <UbText as="span" variant="body-sm-medium">
              {t(config.labelId)}
            </UbText>
            <UbText as="span" variant="caption" tone="tertiary">
              {t(config.hintId)}
            </UbText>
          </UbPressable>
        );
      })}
    </UbGrid>
  );
}

BusinessTypeGridBase.displayName = 'BusinessTypeGrid';
export const BusinessTypeGrid = memo(BusinessTypeGridBase);
