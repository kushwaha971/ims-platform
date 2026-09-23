'use client';

import { forwardRef, memo, type InputHTMLAttributes } from 'react';

import { Search } from 'lucide-react';

import { ML_CONTROL_TONE } from 'src/design-system/primitives/mlFormPrimitives';
import { cn } from 'src/utils/cn';

/**
 * BrandHub `BrandHubSearchInput`: a leading magnifier and the field, one box.
 * 40 px like every other control (the owner's rule: one height for every
 * input, the sign-in field's). Controlled; the caller owns the value.
 */
export interface UbSearchInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange' | 'className'
> {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly className?: string;
}

const UbSearchInputInner = forwardRef<HTMLInputElement, UbSearchInputProps>(
  function UbSearchInputInner({ value, onChange, className, ...rest }, ref) {
    return (
      <div
        className={cn(
          'flex h-10 w-full items-center gap-2 rounded-control border bg-surface-card px-3',
          'transition-colors duration-fast ease-standard focus-within:border-text-primary',
          ML_CONTROL_TONE(false),
          className
        )}
      >
        <Search aria-hidden className="h-4 w-4 shrink-0 text-text-tertiary" />
        <input
          ref={ref}
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="ds-body-base-regular h-full min-w-0 flex-1 bg-transparent text-text-primary outline-none placeholder:text-text-muted [&::-webkit-search-cancel-button]:hidden"
          {...rest}
        />
      </div>
    );
  }
);

UbSearchInputInner.displayName = 'UbSearchInput';
export const UbSearchInput = memo(UbSearchInputInner);
