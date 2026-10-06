'use client';

import { memo, useState } from 'react';

import { SlidersHorizontal } from 'lucide-react';

import { cn } from 'src/utils/cn';

import { UbButton } from '../UbButton';
import { UbCheckbox } from '../UbCheckbox';
import { UbDateInput } from '../UbDateInput';
import { UbDrawer } from '../UbDrawer';
import { UbRadioGroup } from '../UbRadioGroup';

import { appliedCount } from './filterDisplay';
import { FILTER_BUTTON_CLASS, filterButtonTone } from './UbFilterSelect';

import type { UbFilterSpec, UbFilterValues } from './filterTypes';

/**
 * Every filter that is not worth a place in the toolbar, behind ONE button.
 *
 * "Filters (2)" opens a drawer at a desk and a bottom sheet on a phone
 * (`UbDrawer` is both). The merchant changes as many filters as they like and
 * then taps Apply — Baymard's mobile finding: a list that reloads on every tap
 * makes choosing two filters a wait between each. Reset clears the DRAFT, not
 * the list, so it can be taken back by closing the sheet.
 *
 * The draft is seeded from the applied values every time the sheet opens, so
 * a half-edited sheet that was dismissed never leaks into the next one.
 */
export interface UbFilterSheetLabels {
  /** The button and the sheet's title: "Filters". */
  readonly title: string;
  readonly apply: string;
  readonly reset: string;
  readonly close: string;
}

export interface UbFilterSheetProps {
  readonly specs: readonly UbFilterSpec[];
  readonly values: UbFilterValues;
  readonly onApply: (values: UbFilterValues) => void;
  readonly labels: UbFilterSheetLabels;
  /** Show the word beside the icon. Default true; a phone toolbar may pass false. */
  readonly showText?: boolean;
  readonly className?: string;
}

function SpecField({
  spec,
  draft,
  setDraft,
}: Readonly<{
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

function UbFilterSheetBase({
  specs,
  values,
  onApply,
  labels,
  showText = true,
  className,
}: Readonly<UbFilterSheetProps>) {
  const [open, setOpen] = useState(false);
  const [draft, setDraftState] = useState<UbFilterValues>(values);
  const count = appliedCount(specs, values);
  const setDraft = (patch: UbFilterValues) =>
    setDraftState((current) => ({ ...current, ...patch }));

  const openSheet = () => {
    setDraftState(values);
    setOpen(true);
  };
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
    <>
      <button
        type="button"
        onClick={openSheet}
        aria-haspopup="dialog"
        aria-label={count > 0 ? `${labels.title} (${count})` : labels.title}
        className={cn(FILTER_BUTTON_CLASS, filterButtonTone(count > 0), className)}
        data-testid="filters-button"
      >
        <SlidersHorizontal aria-hidden className="h-4 w-4 shrink-0" />
        {showText && <span>{labels.title}</span>}
        {count > 0 && (
          <span
            aria-hidden
            className="ds-micro inline-flex h-5 min-w-5 items-center justify-center rounded-pill bg-accent px-1.5 font-semibold text-text-inverse"
          >
            {count}
          </span>
        )}
      </button>
      <UbDrawer
        open={open}
        onOpenChange={setOpen}
        title={labels.title}
        closeLabel={labels.close}
        footer={
          <>
            <UbButton variant="secondary" onClick={reset}>
              {labels.reset}
            </UbButton>
            <UbButton
              onClick={() => {
                setOpen(false);
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
            <fieldset key={spec.key} className="flex min-w-0 flex-col gap-2 py-4 first:pt-0">
              <legend className="ds-label mb-2 text-text-primary">{spec.label}</legend>
              <SpecField spec={spec} draft={draft} setDraft={setDraft} />
            </fieldset>
          ))}
        </div>
      </UbDrawer>
    </>
  );
}

UbFilterSheetBase.displayName = 'UbFilterSheet';
export const UbFilterSheet = memo(UbFilterSheetBase);
