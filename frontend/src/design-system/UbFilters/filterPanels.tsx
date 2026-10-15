'use client';

import { useState, type ReactNode } from 'react';

import { Check } from 'lucide-react';

import { cn } from 'src/utils/cn';

import { UbButton } from '../UbButton';
import { UbCheckbox } from '../UbCheckbox';
import { UbDateInput } from '../UbDateInput';
import { UbDialog } from '../UbDialog';
import { UbDrawer } from '../UbDrawer';
import { UbRadioGroup } from '../UbRadioGroup';

import type { UbFilterSpec, UbFilterValues } from './filterTypes';

/**
 * Everything the filter controls need only once OPEN: the phone sheet, the
 * Filters drawer and its fields, and the period's custom range with its
 * calendars. Loaded on first open through `deferredModule`, so a screen pays
 * for the buttons on first paint and for the panels when somebody taps one —
 * the rule this codebase already applies to its forms and comboboxes.
 */

export function SheetDialog({
  open,
  onOpenChange,
  title,
  closeLabel,
  children,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  closeLabel: string;
  children: ReactNode;
}>): React.JSX.Element {
  return (
    <UbDialog open={open} onOpenChange={onOpenChange} title={title} closeLabel={closeLabel}>
      {children}
    </UbDialog>
  );
}

export interface PeriodPanelProps {
  readonly presets: readonly { readonly value: string; readonly label: string }[];
  readonly value: string;
  readonly customValue: string;
  readonly from: string | null;
  readonly to: string | null;
  readonly max?: string;
  readonly large: boolean;
  readonly labels: {
    readonly period: string;
    readonly from: string;
    readonly to: string;
    readonly apply: string;
  };
  readonly onPreset: (value: string) => void;
  readonly onCustom: (from: string, to: string) => void;
}

export function PeriodPanel({
  presets,
  value,
  customValue,
  from,
  to,
  max,
  large,
  labels,
  onPreset,
  onCustom,
}: Readonly<PeriodPanelProps>): React.JSX.Element {
  const [draftFrom, setDraftFrom] = useState(from ?? '');
  const [draftTo, setDraftTo] = useState(to ?? '');
  return (
    <div className="flex flex-col p-1">
      <ul role="listbox" aria-label={labels.period} className="flex flex-col">
        {presets
          .filter((preset) => preset.value !== customValue)
          .map((preset) => {
            const selected = preset.value === value;
            return (
              <li key={preset.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => onPreset(preset.value)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-control px-3 text-left outline-none focus-visible:shadow-focus',
                    large ? 'ds-body min-h-12' : 'ds-body-s-regular min-h-9',
                    selected
                      ? 'bg-accent-quiet text-text-accent'
                      : 'text-text-primary hover:bg-surface-hover'
                  )}
                >
                  <span className="flex-1">{preset.label}</span>
                  {selected && <Check aria-hidden className="h-4 w-4" />}
                </button>
              </li>
            );
          })}
      </ul>
      <div className="mt-1 flex flex-col gap-2 border-t border-border-hairline px-2 pb-2 pt-3">
        <span className="ds-label text-text-secondary">
          {presets.find((preset) => preset.value === customValue)?.label}
        </span>
        <div className="grid grid-cols-2 gap-2">
          <UbDateInput
            aria-label={labels.from}
            placeholder={labels.from}
            value={draftFrom}
            max={draftTo || max}
            onChange={(next) => setDraftFrom(next ?? '')}
          />
          <UbDateInput
            aria-label={labels.to}
            placeholder={labels.to}
            value={draftTo}
            min={draftFrom || undefined}
            max={max}
            onChange={(next) => setDraftTo(next ?? '')}
          />
        </div>
        <UbButton
          size="sm"
          disabled={!draftFrom || !draftTo}
          onClick={() => onCustom(draftFrom, draftTo)}
        >
          {labels.apply}
        </UbButton>
      </div>
    </div>
  );
}

function SpecField({
  spec,
  draft,
  setDraft,
  compact,
}: Readonly<{
  compact: boolean;
  spec: UbFilterSpec;
  draft: UbFilterValues;
  setDraft: (patch: UbFilterValues) => void;
}>) {
  if (spec.kind === 'single') {
    const options = [
      ...(spec.anyLabel ? [{ value: '', label: spec.anyLabel }] : []),
      ...spec.options.map((option) => ({
        value: option.value,
        label: option.label,
        hint: option.hint,
        disabled: option.disabled,
      })),
    ];
    return (
      <UbRadioGroup
        className={compact ? 'gap-0 [&>label>button]:mt-0 [&>label]:items-center' : undefined}
        name={`filter-${spec.key}`}
        ariaLabel={spec.label}
        value={draft[spec.key] ?? ''}
        options={options}
        onChange={(value) => setDraft({ [spec.key]: value })}
      />
    );
  }
  if (spec.kind === 'multi') {
    const chosen = (draft[spec.key] ?? '').split(',').filter(Boolean);
    return (
      <div className="flex flex-col gap-2">
        {spec.options.map((option) => (
          <UbCheckbox
            key={option.value}
            checked={chosen.includes(option.value)}
            label={option.hint ? `${option.label} (${option.hint})` : option.label}
            onChange={(on) => {
              const rest = chosen.filter((value) => value !== option.value);
              setDraft({ [spec.key]: (on ? [...rest, option.value] : rest).join(',') });
            }}
          />
        ))}
      </div>
    );
  }
  const from = draft[spec.fromKey] ?? '';
  const to = draft[spec.toKey] ?? '';
  return (
    <div className="grid grid-cols-2 gap-2">
      <UbDateInput
        aria-label={spec.fromLabel}
        placeholder={spec.fromLabel}
        value={from}
        max={to || spec.max}
        onChange={(value) => setDraft({ [spec.fromKey]: value ?? '' })}
      />
      <UbDateInput
        aria-label={spec.toLabel}
        placeholder={spec.toLabel}
        value={to}
        min={from || undefined}
        max={spec.max}
        onChange={(value) => setDraft({ [spec.toKey]: value ?? '' })}
      />
    </div>
  );
}

export interface FilterSheetDrawerProps {
  readonly compact?: boolean;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly specs: readonly UbFilterSpec[];
  readonly values: UbFilterValues;
  readonly onApply: (values: UbFilterValues) => void;
  readonly labels: {
    readonly title: string;
    readonly apply: string;
    readonly reset: string;
    readonly close: string;
  };
}

/** The Filters drawer: a draft seeded from what is applied, applied once. */
export function FilterSheetDrawer({
  open,
  onOpenChange,
  specs,
  values,
  onApply,
  labels,
  compact = false,
}: Readonly<FilterSheetDrawerProps>): React.JSX.Element {
  const [draft, setDraftState] = useState<UbFilterValues>(values);
  const setDraft = (patch: UbFilterValues) =>
    setDraftState((current) => ({ ...current, ...patch }));
  const reset = () => {
    const cleared: Record<string, string> = { ...draft };
    specs.forEach((spec) => {
      if (spec.kind === 'dateRange') {
        cleared[spec.fromKey] = '';
        cleared[spec.toKey] = '';
      } else {
        cleared[spec.key] = '';
      }
    });
    setDraftState(cleared);
  };
  return (
    <UbDrawer
      open={open}
      onOpenChange={onOpenChange}
      className={
        compact
          ? '[&>div:last-child>button]:flex-1 [&>div:last-child]:flex-row [&>div:last-child]:gap-2 [&>div:last-child]:pb-[max(1rem,env(safe-area-inset-bottom,0px))] [&>div]:p-4'
          : undefined
      }
      title={labels.title}
      closeLabel={labels.close}
      footer={
        <>
          <UbButton variant="secondary" onClick={reset}>
            {labels.reset}
          </UbButton>
          <UbButton
            onClick={() => {
              onOpenChange(false);
              onApply(draft);
            }}
            data-testid="filters-apply"
          >
            {labels.apply}
          </UbButton>
        </>
      }
    >
      <div className="flex flex-col divide-y divide-border-hairline">
        {specs.map((spec) => (
          <fieldset
            key={spec.key}
            className={cn('flex min-w-0 flex-col gap-2 first:pt-0', compact ? 'py-3' : 'py-4')}
          >
            <legend className={cn('ds-label text-text-primary', compact ? 'mb-1' : 'mb-2')}>
              {spec.label}
            </legend>
            <SpecField compact={compact} spec={spec} draft={draft} setDraft={setDraft} />
          </fieldset>
        ))}
      </div>
    </UbDrawer>
  );
}
