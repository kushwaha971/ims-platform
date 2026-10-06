'use client';

import { memo, useState } from 'react';

import { SlidersHorizontal } from 'lucide-react';

import { deferredModule, useDeferredModule } from 'src/design-system/primitives/deferredModule';
import { cn } from 'src/utils/cn';

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
 * the list, so it can be taken back by closing the sheet. The draft is seeded
 * from the applied values every time the sheet opens.
 *
 * The drawer and its fields load on the first tap (`filterPanels`); a screen
 * pays for the button on first paint.
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

const panels = deferredModule(() => import('./filterPanels'));

function UbFilterSheetBase({
  specs,
  values,
  onApply,
  labels,
  showText = true,
  className,
}: Readonly<UbFilterSheetProps>) {
  const [open, setOpen] = useState(false);
  // A new key per opening re-seeds the drawer's draft from what is applied.
  const [opening, setOpening] = useState(0);
  const loaded = useDeferredModule(panels, open);
  const count = appliedCount(specs, values);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpening((n) => n + 1);
          setOpen(true);
        }}
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
      {loaded && (
        <loaded.FilterSheetDrawer
          key={opening}
          open={open}
          onOpenChange={setOpen}
          specs={specs}
          values={values}
          onApply={onApply}
          labels={labels}
        />
      )}
    </>
  );
}

UbFilterSheetBase.displayName = 'UbFilterSheet';
export const UbFilterSheet = memo(UbFilterSheetBase);
