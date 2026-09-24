'use client';

import { forwardRef, memo, useCallback, useState } from 'react';

import { ChevronDown, Loader2, Plus } from 'lucide-react';

import {
  MLCommand,
  MLCommandGroup,
  MLCommandInput,
  MLCommandItem,
  MLCommandList,
  MLPopover,
  MLPopoverContent,
  MLPopoverTrigger,
} from 'src/design-system/primitives';
import { cn } from 'src/utils/cn';

/**
 * A combobox whose options come from the SERVER, as the query changes.
 *
 * `UbCombobox` filters a list it already holds; this one owns no list. The
 * caller supplies `options` for the current `query` (from `useItemSearch`, the
 * HSN search, …) and cmdk's own filtering is switched off, so a result the
 * server matched on its SKU or barcode is not hidden for not containing the
 * typed text in its label.
 *
 * Keyboard-first, because it is the first cell of the line-items editor:
 *   · typing a character on the closed trigger opens it with that character;
 *   · ↑/↓ and Enter pick; Escape closes and keeps focus on the trigger;
 *   · Enter with NO option to pick calls `onSubmitQuery` — a HID barcode
 *     scanner types the code and presses Enter faster than any search answers,
 *     and that Enter is the caller's cue to do an exact lookup instead;
 *   · `onCreate` adds a "+ Create '<query>'" row (inline create, INV-01 FR-9).
 */
export interface UbAsyncComboboxOption {
  readonly value: string;
  readonly label: string;
  readonly description?: string;
  readonly disabled?: boolean;
}

export interface UbAsyncComboboxProps {
  readonly value: string | null | undefined;
  /** What the closed trigger shows for `value` — the caller knows the label. */
  readonly selectedLabel?: string;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  readonly options: readonly UbAsyncComboboxOption[];
  readonly onSelect: (option: UbAsyncComboboxOption) => void;
  readonly loading?: boolean;
  readonly placeholder?: string;
  readonly searchPlaceholder?: string;
  readonly emptyLabel?: string;
  readonly loadingLabel?: string;
  readonly createLabel?: (query: string) => string;
  readonly onCreate?: (query: string) => void;
  readonly onSubmitQuery?: (query: string) => void;
  readonly invalid?: boolean;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly name?: string;
  readonly id?: string;
  readonly 'aria-label'?: string;
  readonly 'aria-invalid'?: boolean;
  readonly 'aria-required'?: boolean;
  readonly 'aria-describedby'?: string;
  readonly onBlur?: () => void;
  readonly onKeyDown?: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
}

const isPrintable = (event: React.KeyboardEvent): boolean =>
  event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;

const UbAsyncComboboxInner = forwardRef<HTMLButtonElement, UbAsyncComboboxProps>(
  function UbAsyncComboboxInner(
    {
      value,
      selectedLabel,
      query,
      onQueryChange,
      options,
      onSelect,
      loading = false,
      placeholder,
      searchPlaceholder,
      emptyLabel,
      loadingLabel,
      createLabel,
      onCreate,
      onSubmitQuery,
      invalid,
      disabled,
      className,
      id,
      onBlur,
      onKeyDown,
      name: _name,
      ...aria
    },
    ref
  ) {
    const [open, setOpen] = useState(false);
    const trimmed = query.trim();
    const canCreate = Boolean(onCreate && createLabel && trimmed);

    const pick = useCallback(
      (option: UbAsyncComboboxOption) => {
        onSelect(option);
        setOpen(false);
      },
      [onSelect]
    );

    const handleTriggerKey = useCallback(
      (event: React.KeyboardEvent<HTMLButtonElement>) => {
        onKeyDown?.(event);
        if (event.defaultPrevented || disabled) return;
        if (isPrintable(event) && event.key !== ' ') {
          event.preventDefault();
          onQueryChange(event.key);
          setOpen(true);
        } else if (event.key === 'ArrowDown') {
          event.preventDefault();
          setOpen(true);
        }
      },
      [disabled, onKeyDown, onQueryChange]
    );

    const handleContentKey = useCallback(
      (event: React.KeyboardEvent<HTMLElement>) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          event.nativeEvent.stopImmediatePropagation();
          setOpen(false);
          return;
        }
        if (event.key === 'Enter' && options.length === 0 && trimmed && onSubmitQuery) {
          event.preventDefault();
          onSubmitQuery(trimmed);
          setOpen(false);
        }
      },
      [options.length, trimmed, onSubmitQuery]
    );

    return (
      <MLPopover open={open} onOpenChange={setOpen}>
        <MLPopoverTrigger
          ref={ref}
          id={id}
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          onBlur={onBlur}
          onKeyDown={handleTriggerKey}
          className={cn(
            'flex h-10 w-full items-center justify-between gap-2 rounded-control border px-3',
            'ds-body bg-surface-card text-left text-text-primary',
            'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-text-muted',
            'focus-visible:outline-none focus-visible:ring-0',
            invalid
              ? 'border-formError focus-visible:border-formError'
              : 'border-border-hairline hover:border-border-subtle focus-visible:border-text-primary',
            className
          )}
          {...aria}
        >
          <span className={cn('truncate', !value && 'text-text-muted')}>
            {value ? (selectedLabel ?? value) : placeholder}
          </span>
          <ChevronDown aria-hidden className="h-4 w-4 shrink-0 text-text-tertiary" />
        </MLPopoverTrigger>

        <MLPopoverContent
          align="start"
          onKeyDownCapture={handleContentKey}
          className="w-[max(var(--radix-popover-trigger-width),18rem)] border-border-subtle bg-surface-card p-0"
        >
          <MLCommand shouldFilter={false}>
            <MLCommandInput
              value={query}
              onValueChange={onQueryChange}
              placeholder={searchPlaceholder}
              className="ds-body-base-regular h-10"
            />
            <MLCommandList className="max-h-[min(18rem,55dvh)]">
              {loading && (
                <div className="ds-body-sm flex items-center gap-2 px-3 py-3 text-text-tertiary">
                  <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
                  {loadingLabel}
                </div>
              )}
              {!loading && options.length === 0 && !canCreate && (
                <div className="ds-body-sm px-3 py-6 text-center text-text-tertiary">
                  {emptyLabel}
                </div>
              )}
              <MLCommandGroup>
                {options.map((option) => (
                  <MLCommandItem
                    key={option.value}
                    value={option.value}
                    disabled={option.disabled}
                    onSelect={() => pick(option)}
                    className="ds-body flex-col items-start gap-0"
                  >
                    <span className="w-full truncate">{option.label}</span>
                    {option.description && (
                      <span className="ds-body-s-regular w-full truncate text-text-tertiary">
                        {option.description}
                      </span>
                    )}
                  </MLCommandItem>
                ))}
                {canCreate && (
                  <MLCommandItem
                    value={`__create__${trimmed}`}
                    onSelect={() => {
                      onCreate?.(trimmed);
                      setOpen(false);
                    }}
                    className="ds-body gap-2 text-accent"
                  >
                    <Plus aria-hidden className="h-4 w-4 shrink-0" />
                    <span className="truncate">{createLabel?.(trimmed)}</span>
                  </MLCommandItem>
                )}
              </MLCommandGroup>
            </MLCommandList>
          </MLCommand>
        </MLPopoverContent>
      </MLPopover>
    );
  }
);

UbAsyncComboboxInner.displayName = 'UbAsyncCombobox';
export const UbAsyncCombobox = memo(UbAsyncComboboxInner);
