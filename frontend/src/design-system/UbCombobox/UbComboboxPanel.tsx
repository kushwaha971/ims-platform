'use client';

import { Check, Plus } from 'lucide-react';

import {
  MLCommand,
  MLCommandEmpty,
  MLCommandGroup,
  MLCommandInput,
  MLCommandItem,
  MLCommandList,
} from 'src/design-system/primitives';
import type { UbSelectOption } from 'src/design-system/UbSelect/UbSelect';
import { cn } from 'src/utils/cn';

/**
 * The search list inside an open `UbCombobox` — cmdk and its rows. Its own
 * module so that it is fetched after the screen's first paint rather than in
 * it (see `primitives/deferredModule.ts`); the trigger, which is what a screen
 * paints, stays in `UbCombobox.tsx`.
 */
export interface UbComboboxPanelProps {
  readonly value: string | null | undefined;
  readonly options: readonly UbSelectOption[];
  readonly search: string;
  readonly onSearchChange: (search: string) => void;
  readonly searchPlaceholder?: string;
  readonly emptyLabel?: string;
  readonly onSelect: (value: string) => void;
  readonly showCreate: boolean;
  readonly typed: string;
  readonly createLabel?: (text: string) => string;
  readonly onCreate: () => void;
}

export function UbComboboxPanel({
  value,
  options,
  search,
  onSearchChange,
  searchPlaceholder,
  emptyLabel,
  onSelect,
  showCreate,
  typed,
  createLabel,
  onCreate,
}: UbComboboxPanelProps): React.JSX.Element {
  return (
    <MLCommand>
      <MLCommandInput
        value={search}
        onValueChange={onSearchChange}
        placeholder={searchPlaceholder}
        // Radix's focus scope puts focus here when the panel is present at
        // open, which is almost always. This covers the open that beat the
        // chunk: the panel then mounts into an already-open popover.
        autoFocus
        className="ds-body-base-regular h-10"
      />
      <MLCommandList className="max-h-[min(18rem,55dvh)]">
        <MLCommandEmpty className="ds-body-sm px-3 py-6 text-center text-text-tertiary">
          {emptyLabel}
        </MLCommandEmpty>
        <MLCommandGroup>
          {options.map((option) => (
            <MLCommandItem
              key={option.value}
              value={option.label}
              disabled={option.disabled}
              onSelect={() => onSelect(option.value)}
              className="ds-body gap-2"
            >
              <Check
                aria-hidden
                className={cn(
                  'h-4 w-4 shrink-0 text-accent',
                  option.value === value ? 'opacity-100' : 'opacity-0'
                )}
              />
              <span className="truncate">{option.label}</span>
            </MLCommandItem>
          ))}
          {showCreate && (
            <MLCommandItem
              value={`__create__ ${typed}`}
              onSelect={onCreate}
              className="ds-body gap-2 text-accent"
            >
              <Plus aria-hidden className="h-4 w-4 shrink-0" />
              <span className="truncate">{createLabel?.(typed)}</span>
            </MLCommandItem>
          )}
        </MLCommandGroup>
      </MLCommandList>
    </MLCommand>
  );
}
