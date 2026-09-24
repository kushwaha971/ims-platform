'use client';

import { useCallback, useEffect, useId, useMemo, useRef, type ReactNode } from 'react';

import { Plus, Trash2 } from 'lucide-react';
import {
  Controller,
  useWatch,
  type ArrayPath,
  type Control,
  type ControllerRenderProps,
  type FieldArray,
  type FieldValues,
  type Path,
  type UseFieldArrayReturn,
} from 'react-hook-form';

import { useGridTier } from 'src/design-system/UbDataGrid/useGridTier';
import { cn } from 'src/utils/cn';

/**
 * The line-items editor — built to the INVOICE requirement (Part 32 §32.9.7):
 * keyboard-first, one react-hook-form `Controller` per editable cell, and a
 * card form on a phone. INV-06's adjustment drawer is its first consumer and
 * uses a subset of columns; SAL-02 and PUR-01 use it next with more.
 *
 * ── Shape ────────────────────────────────────────────────────────────────
 * The CALLER owns `useFieldArray` and passes it in, because a line is added
 * from outside the grid as often as from inside it — a barcode scan, "Adjust
 * stock" opened from an item page with that item preselected, "Add to bill".
 * The editor owns layout, focus and the per-cell `Controller`s; a column says
 * which field of the line it edits (`field`) and how to draw the control
 * (`render`). A column without `field` is computed (on-hand after, value,
 * line total) and re-renders from `useWatch` of its own line only.
 *
 * ── Keyboard (invoice-grade) ─────────────────────────────────────────────
 *   Enter in a text field   → the next editable cell; from the last cell of the
 *                             last line, a new line (below `maxLines`)
 *   ↑ / ↓ in a text field   → the same column on the previous / next line
 *   Alt+N                   → add a line and focus its first cell
 *   Alt+Backspace           → remove the current line
 *   Ctrl/⌘+Enter            → `onSubmitShortcut` (post / save)
 * Buttons (a combobox trigger, a toggle) keep their own Enter, so a picker
 * still opens on Enter; a cell's `focusNext()` lets its picker advance the
 * caret after a choice, the way a till does.
 *
 * ── Phone ────────────────────────────────────────────────────────────────
 * Below `md` every line is a card: the `title` column across the top, editable
 * columns as labelled 40 px fields, computed columns as label/value rows, and
 * a remove button in the card's corner. Same `Controller`s, one layout at a
 * time — never both in the DOM, which would give every field two inputs.
 */

export type UbLineCellLayout = 'table' | 'card';

export interface UbLineCellContext {
  readonly index: number;
  /** A DOM id unique to this cell, for the control's `id`. */
  readonly id: string;
  /** "Qty, line 2" — the control's accessible name; headers are not labels. */
  readonly label: string;
  /** The `Controller` field, when the column edits one. */
  readonly field: ControllerRenderProps<FieldValues, string> | null;
  readonly invalid: boolean;
  readonly error?: string;
  readonly layout: UbLineCellLayout;
  /** Move the caret to the next editable cell (used after a picker chooses). */
  readonly focusNext: () => void;
}

export interface UbLineItemsColumn {
  readonly id: string;
  readonly header: string;
  /** The field of the line this column edits; omitted for a computed column. */
  readonly field?: string;
  /** CSS grid track on the table layout. Default `minmax(0,1fr)`. */
  readonly track?: string;
  readonly align?: 'start' | 'end';
  /** Where the column goes on a phone card. Default `field` when editable, else `inline`. */
  readonly card?: 'title' | 'field' | 'inline' | 'hidden';
  readonly render: (context: UbLineCellContext) => ReactNode;
}

export interface UbLineItemsEditorLabels {
  readonly addLine: string;
  readonly removeLine: (lineNumber: number) => string;
  readonly lineLabel: (lineNumber: number) => string;
  readonly empty: string;
  readonly maxReached?: string;
}

export interface UbLineItemsEditorProps<TForm extends FieldValues, TName extends ArrayPath<TForm>> {
  readonly control: Control<TForm>;
  readonly name: TName;
  readonly fieldArray: UseFieldArrayReturn<TForm, TName, 'key'>;
  readonly columns: readonly UbLineItemsColumn[];
  readonly newLine: () => FieldArray<TForm, TName>;
  readonly labels: UbLineItemsEditorLabels;
  readonly maxLines?: number;
  /** A line-level note under the row: "Only 5 NOS available", a warning. */
  readonly renderLineNote?: (index: number) => ReactNode;
  readonly lineInvalid?: (index: number) => boolean;
  readonly onSubmitShortcut?: () => void;
  readonly disabled?: boolean;
  readonly footer?: ReactNode;
  /** Force a layout (tests, a print preview); otherwise from the viewport. */
  readonly layout?: UbLineCellLayout;
  readonly className?: string;
}

const FOCUSABLE =
  'input:not([disabled]), button:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function readError(errors: unknown, path: string): string | undefined {
  const node = path.split('.').reduce<unknown>((current, part) => {
    if (current && typeof current === 'object') return (current as Record<string, unknown>)[part];
    return undefined;
  }, errors);
  if (node && typeof node === 'object' && 'message' in node) {
    const message = (node as { message?: unknown }).message;
    return typeof message === 'string' && message ? message : undefined;
  }
  return undefined;
}

export function UbLineItemsEditor<TForm extends FieldValues, TName extends ArrayPath<TForm>>({
  control,
  name,
  fieldArray,
  columns,
  newLine,
  labels,
  maxLines = 100,
  renderLineNote,
  lineInvalid,
  onSubmitShortcut,
  disabled = false,
  footer,
  layout: forcedLayout,
  className,
}: UbLineItemsEditorProps<TForm, TName>): React.JSX.Element {
  const tier = useGridTier();
  const layout: UbLineCellLayout = forcedLayout ?? (tier === 'cards' ? 'card' : 'table');
  const containerRef = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const { fields, append, remove } = fieldArray;
  /* Where the caret goes once the lines the last action changed are in the
     DOM. A ref, not state: it is consumed by the next commit and never drawn. */
  const pendingFocus = useRef<{ row: number; col: number } | null>(null);
  const editable = useMemo(() => columns.filter((column) => column.field), [columns]);
  const atMax = fields.length >= maxLines;

  const focusCell = useCallback(
    (row: number, col: number): boolean => {
      const root = containerRef.current;
      if (!root) return false;
      for (let c = col; c < editable.length; c += 1) {
        const cell = root.querySelector<HTMLElement>(
          `[data-line-cell][data-row="${row}"][data-col="${c}"]`
        );
        const target = cell?.querySelector<HTMLElement>(FOCUSABLE);
        if (target) {
          target.focus();
          return true;
        }
      }
      return false;
    },
    [editable.length]
  );

  useEffect(() => {
    const pending = pendingFocus.current;
    if (pending && focusCell(pending.row, pending.col)) pendingFocus.current = null;
  });

  const addLine = useCallback(() => {
    if (atMax || disabled) return;
    append(newLine());
    pendingFocus.current = { row: fields.length, col: 0 };
  }, [append, newLine, atMax, disabled, fields.length]);

  const focusNextFrom = useCallback(
    (row: number, col: number) => {
      if (focusCell(row, col + 1)) return;
      if (row + 1 < fields.length) {
        focusCell(row + 1, 0);
      } else {
        addLine();
      }
    },
    [focusCell, fields.length, addLine]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const cell = target.closest<HTMLElement>('[data-line-cell]');
      const isText = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        if (onSubmitShortcut) {
          event.preventDefault();
          onSubmitShortcut();
        }
        return;
      }
      if (event.altKey && event.code === 'KeyN') {
        event.preventDefault();
        addLine();
        return;
      }
      if (!cell) return;
      const row = Number(cell.dataset.row);
      const col = Number(cell.dataset.col);
      if (event.altKey && event.key === 'Backspace') {
        event.preventDefault();
        remove(row);
        pendingFocus.current = { row: Math.max(0, row - 1), col };
        return;
      }
      if (!isText || event.altKey || event.shiftKey) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        focusNextFrom(row, col);
      } else if (event.key === 'ArrowDown' && row + 1 < fields.length) {
        event.preventDefault();
        focusCell(row + 1, col);
      } else if (event.key === 'ArrowUp' && row > 0) {
        event.preventDefault();
        focusCell(row - 1, col);
      }
    },
    [onSubmitShortcut, addLine, remove, focusNextFrom, focusCell, fields.length]
  );

  /* One delegated listener for the whole grid, attached natively: the
     container is not itself a control, so it carries no key handler prop. */
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return undefined;
    root.addEventListener('keydown', handleKeyDown);
    return () => root.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const template = [...columns.map((column) => column.track ?? 'minmax(0,1fr)'), '2.5rem'].join(
    ' '
  );

  const renderCell = (column: UbLineItemsColumn, index: number, cellLayout: UbLineCellLayout) => {
    const col = editable.indexOf(column);
    const id = `${baseId}-${index}-${column.id}`;
    const label = `${column.header}, ${labels.lineLabel(index + 1)}`;
    const focusNext = () => focusNextFrom(index, col);
    if (!column.field) {
      return (
        <ComputedCell
          control={control}
          name={`${name}.${index}` as Path<TForm>}
          render={() =>
            column.render({
              index,
              id,
              label,
              field: null,
              invalid: false,
              layout: cellLayout,
              focusNext,
            })
          }
        />
      );
    }
    return (
      <Controller
        control={control}
        name={`${name}.${index}.${column.field}` as Path<TForm>}
        render={({ field, formState }) => {
          const error = readError(formState.errors, `${name}.${index}.${column.field}`);
          return (
            <div
              data-line-cell=""
              data-row={index}
              data-col={col}
              className="flex min-w-0 flex-col gap-1"
            >
              {column.render({
                index,
                id,
                label,
                field: field as unknown as ControllerRenderProps<FieldValues, string>,
                invalid: Boolean(error),
                error,
                layout: cellLayout,
                focusNext,
              })}
              {error && (
                <span role="alert" className="ds-body-s-regular text-formError">
                  {error}
                </span>
              )}
            </div>
          );
        }}
      />
    );
  };

  return (
    <div
      ref={containerRef}
      className={cn('flex flex-col gap-3', className)}
      data-testid="line-items-editor"
      data-layout={layout}
    >
      {layout === 'table' ? (
        <div role="table" aria-rowcount={fields.length + 1} className="flex flex-col">
          <div
            role="row"
            className="ds-body-s-medium grid items-center gap-3 border-b border-border-hairline bg-surface-sunken px-3 py-2 text-text-tertiary"
            style={{ gridTemplateColumns: template }}
          >
            {columns.map((column) => (
              <span
                key={column.id}
                role="columnheader"
                className={cn('truncate', column.align === 'end' && 'text-right')}
              >
                {column.header}
              </span>
            ))}
            <span role="columnheader" className="sr-only">
              {labels.removeLine(0)}
            </span>
          </div>
          {fields.length === 0 && (
            <div className="ds-body-sm px-3 py-6 text-center text-text-tertiary">
              {labels.empty}
            </div>
          )}
          {fields.map((line, index) => (
            <div
              key={line.key}
              role="row"
              aria-label={labels.lineLabel(index + 1)}
              className={cn(
                'flex flex-col gap-1 border-b border-border-hairline px-3 py-2',
                lineInvalid?.(index) && 'bg-formError-dim'
              )}
            >
              <div className="grid items-start gap-3" style={{ gridTemplateColumns: template }}>
                {columns.map((column) => (
                  <div
                    key={column.id}
                    role="cell"
                    className={cn('min-w-0', column.align === 'end' && 'text-right')}
                  >
                    {renderCell(column, index, 'table')}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => remove(index)}
                  disabled={disabled}
                  aria-label={labels.removeLine(index + 1)}
                  className="flex h-10 w-10 items-center justify-center rounded-control text-text-tertiary hover:bg-surface-sunken hover:text-formError disabled:opacity-50"
                >
                  <Trash2 aria-hidden className="h-4 w-4" />
                </button>
              </div>
              {renderLineNote?.(index)}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {fields.length === 0 && (
            <div className="ds-body-sm rounded-card border border-dashed border-border-hairline px-3 py-6 text-center text-text-tertiary">
              {labels.empty}
            </div>
          )}
          {fields.map((line, index) => {
            const title = columns.find((column) => column.card === 'title');
            return (
              <section
                key={line.key}
                aria-label={labels.lineLabel(index + 1)}
                className={cn(
                  'flex flex-col gap-3 rounded-card border border-border-hairline p-3',
                  lineInvalid?.(index) && 'border-formError'
                )}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">{title && renderCell(title, index, 'card')}</div>
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    disabled={disabled}
                    aria-label={labels.removeLine(index + 1)}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control text-text-tertiary hover:bg-surface-sunken hover:text-formError disabled:opacity-50"
                  >
                    <Trash2 aria-hidden className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {columns
                    .filter(
                      (column) =>
                        column !== title &&
                        (column.card ?? (column.field ? 'field' : 'inline')) === 'field'
                    )
                    .map((column) => (
                      <label key={column.id} className="flex min-w-0 flex-col gap-1">
                        <span className="ds-body-s-medium text-text-secondary">
                          {column.header}
                        </span>
                        {renderCell(column, index, 'card')}
                      </label>
                    ))}
                </div>
                {columns
                  .filter(
                    (column) =>
                      column !== title &&
                      (column.card ?? (column.field ? 'field' : 'inline')) === 'inline'
                  )
                  .map((column) => (
                    <div
                      key={column.id}
                      className="ds-body-s-regular flex items-center justify-between gap-3"
                    >
                      <span className="text-text-tertiary">{column.header}</span>
                      <span className="min-w-0 text-right">
                        {renderCell(column, index, 'card')}
                      </span>
                    </div>
                  ))}
                {renderLineNote?.(index)}
              </section>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={addLine}
          disabled={atMax || disabled}
          className="ds-body-sm-medium inline-flex h-10 items-center gap-2 rounded-control border border-border-hairline px-3 text-accent hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus aria-hidden className="h-4 w-4" />
          {labels.addLine}
        </button>
        {atMax && labels.maxReached && (
          <span className="ds-body-s-regular text-text-tertiary">{labels.maxReached}</span>
        )}
      </div>
      {footer}
    </div>
  );
}

/** A computed cell re-renders when ITS line changes, not when any line does. */
function ComputedCell<TForm extends FieldValues>({
  control,
  name,
  render,
}: {
  readonly control: Control<TForm>;
  readonly name: Path<TForm>;
  readonly render: () => ReactNode;
}): React.JSX.Element {
  useWatch({ control, name });
  return <>{render()}</>;
}
