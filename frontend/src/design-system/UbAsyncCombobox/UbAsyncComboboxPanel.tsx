'use client';

import { Loader2, Plus } from 'lucide-react';

import {
  MLCommand,
  MLCommandGroup,
  MLCommandInput,
  MLCommandItem,
  MLCommandList,
} from 'src/design-system/primitives';

import type { UbAsyncComboboxOption } from './UbAsyncCombobox';

/**
 * The search list inside an open `UbAsyncCombobox` — cmdk and its rows. Its
 * own module so that the bill editors, whose every line starts with one of
 * these, fetch it after first paint rather than in it (see
 * `primitives/deferredModule.ts`). The trigger stays in `UbAsyncCombobox.tsx`.
 */
export interface UbAsyncComboboxPanelProps {
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  readonly options: readonly UbAsyncComboboxOption[];
  readonly onPick: (option: UbAsyncComboboxOption) => void;
  readonly loading: boolean;
  readonly searchPlaceholder?: string;
  readonly emptyLabel?: string;
  readonly loadingLabel?: string;
  readonly canCreate: boolean;
  readonly trimmed: string;
  readonly createLabel?: (query: string) => string;
  readonly onCreate: () => void;
}

export function UbAsyncComboboxPanel({
  query,
  onQueryChange,
  options,
  onPick,
  loading,
  searchPlaceholder,
  emptyLabel,
  loadingLabel,
  canCreate,
  trimmed,
  createLabel,
  onCreate,
}: UbAsyncComboboxPanelProps): React.JSX.Element {
  return (
    <MLCommand shouldFilter={false}>
      <MLCommandInput
        value={query}
        onValueChange={onQueryChange}
        placeholder={searchPlaceholder}
        // Radix's focus scope puts focus here when the panel is present at
        // open, which is almost always. This covers the open that beat the
        // chunk — a scanner's first keystroke — when the panel mounts into an
        // already-open popover and the rest of the code must land here.
        autoFocus
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
          <div className="ds-body-sm px-3 py-6 text-center text-text-tertiary">{emptyLabel}</div>
        )}
        <MLCommandGroup>
          {options.map((option) => (
            <MLCommandItem
              key={option.value}
              value={option.value}
              disabled={option.disabled}
              onSelect={() => onPick(option)}
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
              onSelect={onCreate}
              className="ds-body gap-2 text-accent"
            >
              <Plus aria-hidden className="h-4 w-4 shrink-0" />
              <span className="truncate">{createLabel?.(trimmed)}</span>
            </MLCommandItem>
          )}
        </MLCommandGroup>
      </MLCommandList>
    </MLCommand>
  );
}
