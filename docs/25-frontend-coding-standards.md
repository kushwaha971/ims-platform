# Part 25 — Frontend Coding Standards

## 25.0 Purpose and how to use this chapter

Part 19 says **where** code goes. This chapter says **how it is written**. Every rule here is stated as a rule, numbered, and then shown twice: once wrong, once right. If a rule and an example disagree, the rule wins and the example is a defect.

This chapter is written to be executable by a coding agent as well as readable by a person. An agent must be able to open any file it has produced, walk §25.19, and answer yes to every line before calling the file finished.

**Enforcement tiers.** Each rule carries one:

| Tier | Meaning |
|---|---|
| **[lint]** | Mechanically enforced. ESLint, TypeScript, Prettier or a `scripts/check-*.mjs` fails the build. |
| **[review]** | Enforced by a human or agent reviewer against the checklist in §25.18. |
| **[ADR]** | Cannot be changed by a PR at all. Requires a written ADR amending the canon. |

**The three standing constraints**, repeated because every other rule assumes them:

1. The BrandHub Customer module is the reference implementation. When this chapter is silent, do what BrandHub Customer does. **[ADR]**
2. TanStack Query is not used. One data pattern: slice + thunk + service. **[ADR]**
3. The ADR-021 dependency list is closed. **[ADR]**

---

## 25.1 TypeScript
The type system is the cheapest reviewer this project has. It reads every line, never gets tired and never approves a PR at 7 p.m. on a Friday. Every rule below exists to keep it able to do that job: a codebase that reaches for `any`, casts its way past a complaint or models state as loose booleans has bought silence, not correctness, and it pays for that silence in production — in a product that records other people's money, where a wrong number is not a cosmetic bug.

Two properties of this domain make the discipline pay more than usual. First, almost every value that matters is a decimal string that *looks* like a number, so the compiler is the only thing standing between a correct total and a float rounding error a shopkeeper will eventually notice. Second, the API surface is large (Part 22 lists well over a hundred endpoints) and every response shape is snake_case on the wire and camelCase in the app; without types at the boundary, a renamed field fails silently as `undefined` rendered as an empty cell rather than loudly as a compile error.


### R-TS-1 `strict` is on, and every strictness flag stays on. **[lint]**

`tsconfig.json` sets `strict: true` plus the four flags that `strict` does not include. Turning one off to unblock a PR is not permitted; fix the type instead.

```jsonc
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "preserve",
    "moduleResolution": "bundler",
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "paths": {
      "src/*": ["./src/*"],
      "modules/*": ["./src/modules/*"],
      "app/*": ["./app/*"],
      "locales/*": ["./locales/*"]
    }
  }
}
```

`noUncheckedIndexedAccess` is the one that matters most in this codebase, because array and record access is everywhere in list rendering:

```ts
// ✗ Wrong — `rows[0]` is typed Party, but the array may be empty at runtime.
const first = rows[0];
console.log(first.name);          // crashes on an empty list

// ✓ Right — the flag forces the check, and the check is correct.
const first = rows[0];
if (!first) return null;
console.log(first.name);
```

### R-TS-2 `any` is banned. **[lint]**

`@typescript-eslint/no-explicit-any` is an error. Use `unknown` and narrow, or write the type.

```ts
// ✗ Wrong — this is how untyped error handling spreads through a codebase.
export const postEntry = async (payload: any): Promise<any> => {
  try {
    return await api.post('/ledger-entries', payload);
  } catch (error: any) {
    throw new Error(error?.response?.data?.message ?? 'failed');
  }
};

// ✓ Right — typed in, typed out, errors normalised once by a shared helper.
export const postEntry = async (
  payload: LedgerEntryPayload,
  idempotencyKey: string
): Promise<LedgerEntryResult> => {
  const response = await api.post<{ data: LedgerEntryApiRow; meta: LedgerEntryMeta }>(
    API_PATHS.LEDGER_ENTRIES,
    toWire(payload),
    { headers: { 'Idempotency-Key': idempotencyKey } }
  );
  return { entry: toLedgerEntry(response.data.data), partyBalance: response.data.meta.party_balance };
};
```

The only `any` permitted anywhere is inside a `.d.ts` shim for an untyped third-party module, and that file must carry a `// TODO(ADR-021)` comment naming the package.

### R-TS-3 `as` assertions need a reason. **[review]**

A type assertion silences the compiler; a type guard convinces it. Prefer guards. When an assertion is genuinely necessary — a discriminated parse of external JSON, a `const` object widened for a lookup — put a one-line comment above it saying why.

```ts
// ✗ Wrong — a lie the compiler cannot check.
const party = response.data as Party;

// ✗ Wrong — double assertion, always a smell.
const mode = value as unknown as PaymentMode;

// ✓ Right — a guard that actually verifies.
const isPaymentMode = (value: string): value is PaymentMode =>
  (PAYMENT_MODES as readonly string[]).includes(value);

const mode = isPaymentMode(raw) ? raw : 'cash';

// ✓ Acceptable — asserting the shape of our own frozen constant, with the reason.
// PAYMENT_MODES is `as const`; widening it is the only way to use `.includes`.
const modes = PAYMENT_MODES as readonly string[];
```

### R-TS-4 State is a discriminated union, never a bag of booleans. **[review]**

Booleans permit unrepresentable states. Unions do not.

```ts
// ✗ Wrong — isLoading && isError is reachable, and nothing says what it means.
interface PartyListState {
  rows: Party[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string;
}

// ✓ Right — the union makes the impossible unrepresentable.
type RequestStatus = 'idle' | 'loading' | 'refreshing' | 'succeeded' | 'failed';

interface PartyListState {
  rows: Party[];
  status: RequestStatus;
  error: ApiErrorShape | null;
}
```

The same applies to component props: `variant: 'first-use' | 'filtered' | 'error'` beats `isFirstUse` + `isFiltered` + `isError`.

### R-TS-5 Props and public data shapes are `readonly`. **[review]**

Every component props interface is `readonly` field by field, and the component parameter is wrapped in `Readonly<>`. Arrays in props are `readonly T[]`. This is the BrandHub Customer convention and it catches a whole class of "I mutated the prop" bugs.

```ts
// ✗ Wrong
interface UbStatCardProps {
  label: string;
  tags: string[];
  onClick?: () => void;
}
function UbStatCardBase({ label, tags, onClick }: UbStatCardProps) { … }

// ✓ Right
export interface UbStatCardProps {
  readonly label: string;
  readonly tags: readonly string[];
  readonly onClick?: () => void;
  readonly className?: string;          // always last
}
function UbStatCardBase({ label, tags, onClick, className }: Readonly<UbStatCardProps>) { … }
```

Redux state is **not** marked `readonly`, because Immer needs to mutate the draft inside reducers. That is the one deliberate exception.

### R-TS-6 `interface` for object shapes; `type` for unions, functions and mapped types. **[review]**

```ts
// ✓ interface — an object shape that something may extend
export interface Party {
  readonly id: string;
  readonly name: string;
  readonly balance: string;
}

// ✓ type — a union
export type PartyBalanceFilter = 'owes_me' | 'i_owe' | 'settled';

// ✓ type — a function signature
export type RowMenuBuilder = (party: Party, permissions: readonly PermissionCode[]) => MenuItem[];

// ✓ type — a mapped/derived type
export type PartyListParams = Omit<PartyListFilters, 'tags'> & { readonly tags?: readonly string[] };
```

### R-TS-7 Money and quantity are `string`, end to end. **[ADR]**

ADR-010 and canon §0.11 rule 3. A rupee amount becomes a `number` in exactly one place: the argument to `Intl.NumberFormat`, at the moment of display. All arithmetic goes through `decimal.js-light` in `src/utils/money.ts`.

```ts
// ✗ Wrong — float arithmetic on money. 0.1 + 0.2 !== 0.3, and a shopkeeper will find it.
const total = lines.reduce((sum, l) => sum + Number(l.qty) * Number(l.unitPrice), 0);
const display = `₹${total.toFixed(2)}`;

// ✓ Right — decimal strings in, decimal string out, formatted only at the edge.
import { multiply, sum, formatInr } from 'src/utils/money';

const total = sum(lines.map((l) => multiply(l.qty, l.unitPrice)));   // "1692.14"
const display = formatInr(total);                                     // "₹1,692.14"
```

### R-TS-8 Enum-like values are `as const` objects or string unions, never `enum`. **[lint]**

TypeScript `enum` emits runtime code, does not narrow from strings cleanly and does not survive `isolatedModules` well.

```ts
// ✗ Wrong
export enum InvoiceStatus { Draft = 'draft', Issued = 'issued' }

// ✓ Right
export const INVOICE_STATUSES = ['draft', 'issued', 'partially_paid', 'paid', 'overdue', 'void'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
```

The string values must match canon §0.7 exactly, character for character.

### R-TS-9 Generics are constrained and meaningfully named. **[review]**

Single-letter generics are acceptable only for a truly universal container (`T` in `Result<T>`). Anything domain-shaped gets a name and a constraint.

```ts
// ✗ Wrong
function buildColumns<T>(rows: T[]) { … }

// ✓ Right
function buildColumns<TRow extends { readonly id: string }>(
  rows: readonly TRow[]
): readonly UbColumnDef<TRow>[] { … }
```

### R-TS-10 Exported functions declare their return type. **[review]**

Inference is fine for locals. An exported function's return type is part of its contract and must be written, so that a change to the body cannot silently change the contract.

---

## 25.2 File and folder naming

### R-FN-1 One artefact kind, one naming form. **[lint]**

| Artefact | Form | Example |
|---|---|---|
| React component file | `PascalCase.tsx`, named after the exported component | `PartyListPageContent.tsx` |
| Design-system component | `Ub<Name>/Ub<Name>.tsx` + `index.ts` | `UbStatCard/UbStatCard.tsx` |
| Hook | `useCamelCase.ts` | `usePartyList.ts` |
| Service | `<resource>Service.ts` | `partyService.ts` |
| Slice | `<name>Slice.ts` | `partyListSlice.ts` |
| Thunk | `<name>Thunk.ts` | `partyListThunk.ts` |
| Types | `<name>.types.ts` | `party.types.ts` |
| Validation schemas | `<name>Schemas.ts` | `invoiceSchemas.ts` |
| View-model helper | `<name>Display.ts` / `<name>Actions.ts` / a domain noun | `partyDisplay.ts`, `taxEngine.ts` |
| Constants | `camelCase.ts`, plural noun | `paymentModes.ts`, `invoiceStatuses.ts` |
| Utility | `camelCase.ts` | `money.ts`, `caseMapper.ts` |
| Test | `<subject>.test.ts(x)`, beside the subject | `partyDisplay.test.ts` |
| Route | `page.tsx`, `layout.tsx`, `error.tsx` (Next.js fixed) | — |
| Folder | `kebab-case`, except `features/<feature>` which is a single lowercase word and `Ub*` component folders | `view-model/`, `design-system/`, `parties/` |

### R-FN-2 The file name and the primary export match. **[lint]**

`PartyListRow.tsx` exports `PartyListRow`. `usePartyList.ts` exports `usePartyList`. A file whose primary export has a different name is a rename waiting to confuse a search.

### R-FN-3 No `index.ts` barrels except in `design-system/`. **[review]**

Barrels inside features create import cycles and defeat tree-shaking. The design system has one because it is a published-style boundary and features must import from exactly one path.

```ts
// ✗ Wrong — features/parties/components/index.ts re-exporting twelve components
import { PartyListRow, PartyTotalsHeader } from '../components';

// ✓ Right — direct paths inside a feature
import { PartyListRow } from './PartyListRow';
import { PartyTotalsHeader } from './PartyTotalsHeader';

// ✓ Right — the design system's single barrel
import { UbDataGrid, UbStatCard, UbEmptyState } from 'modules/UdhaarBook/design-system';
```

### R-FN-4 A file does one thing, and stays under 300 lines. **[review]**

300 lines is a smell threshold, not a hard limit; a column factory or a schema file may legitimately exceed it. A *component* over 300 lines almost never should — split it by the screen regions it renders.

---

## 25.3 Component authoring
Components are where a codebase's entropy accumulates, because they are the layer everybody touches and the layer where "just one more prop" always looks cheaper than a refactor. The rules here are chosen to make the cheap thing and the right thing the same thing: a component that takes its data from a hook, its formatting from a view-model, its text from `t()` and its colour from a token has nowhere left to put business logic, so it stays small without anybody policing its length.

The design-system template in particular is not a style preference. `memo` plus `displayName` plus a `readonly` props interface plus a merged `className` is the exact shape BrandHub Customer uses, and matching it means a developer moving between the two products reads one convention, a test can query components by their display name, and a wrapper can be split into several files later without a single caller changing.


### R-C-1 Function components, named exports, no default exports. **[lint]**

The only default exports in the codebase are Next.js route files (`page.tsx`, `layout.tsx`, `error.tsx`), which the framework requires, and slice reducers (`export default partyListSlice.reducer`), which is the RTK convention.

```tsx
// ✗ Wrong
export default function PartyListRow(props) { … }

// ✓ Right
export function PartyListRow(props: Readonly<PartyListRowProps>) { … }
```

### R-C-2 The design-system component template is mandatory and exact. **[review]**

Props interface above, `Base` function, `displayName` on the base, `memo` on the export, `className` last and merged with `cn()`.

```tsx
// ✗ Wrong — arrow component, inline props, default export, no memo, no displayName,
//           className ignored, hard-coded colour.
export default ({ label, value }: { label: string; value: string }) => (
  <div style={{ color: '#2B6BE0' }} className="rounded-xl border p-4">
    <span className="text-xs uppercase">{label}</span>
    <span className="text-2xl">{value}</span>
  </div>
);

// ✓ Right
'use client';

import { memo, type ReactNode } from 'react';
import { cn } from 'src/utils/cn';

export type UbAmountTone = 'neutral' | 'receivable' | 'payable';
export type UbAmountSign = 'minus' | 'plus' | 'none';

interface UbAmountBaseProps {
  /** Decimal string from the API — never a number, never preformatted. */
  readonly value: string;
  readonly size?: 'sm' | 'md' | 'lg';
  /** Hides the label visually; it stays in the accessible name. */
  readonly labelHidden?: boolean;
  readonly className?: string;
}

/**
 * Part 23 §23.2.6 is the contract. The union is what makes rule 2 of the
 * colour-plus-text rule unrepresentable-if-broken: a signed or toned amount
 * cannot compile without a label.
 */
export type UbAmountProps =
  | (UbAmountBaseProps & { readonly tone?: 'neutral'; readonly sign?: 'none'; readonly label?: string })
  | (UbAmountBaseProps & { readonly tone: UbAmountTone; readonly sign?: UbAmountSign; readonly label: string });

const TONE: Record<UbAmountTone, string> = {
  neutral: 'text-text-primary',
  receivable: 'text-error',      // ledger debit only — never --form-error (§23.2.4)
  payable: 'text-success',
};

const SIZE: Record<NonNullable<UbAmountBaseProps['size']>, string> = {
  sm: 'ds-body-sm',
  md: 'ds-body-medium',
  lg: 'ds-metric-sm',
};

const GLYPH: Record<UbAmountSign, string> = { minus: '\u2212', plus: '+', none: '' };

function UbAmountBase({
  value, tone = 'neutral', sign = 'none', label, labelHidden, size = 'md', className,
}: Readonly<UbAmountProps>) {
  // A zero is never red, never green and never signed (§23.2.6 rule 4).
  const isZero = isZeroAmount(value);
  const effectiveTone = isZero ? 'neutral' : tone;
  const effectiveSign = isZero ? 'none' : sign;
  const formatted = formatInr(value);                 // en-IN, 2,2,3 grouping, always 2 dp
  const a11y = label ? `${label}, ${formatted}` : formatted;

  return (
    <span className={cn('inline-flex flex-col items-end', className)}>
      <span
        lang="en-IN"
        dir="ltr"
        aria-hidden
        className={cn('ds-num whitespace-nowrap', SIZE[size], TONE[effectiveTone])}
      >
        {/* fixed slot so signed and unsigned rows keep one decimal column */}
        <span className="inline-block min-w-[0.6em] text-right">{GLYPH[effectiveSign]}</span>
        {formatted}
      </span>
      <span className="sr-only">{a11y}</span>
      {label && !labelHidden && <span className="ds-caption text-text-tertiary">{label}</span>}
    </span>
  );
}

UbAmountBase.displayName = 'UbAmount';
export const UbAmount = memo(UbAmountBase);
```

Four things in that component are the contract rather than taste, and a test asserts each (Part 23 §23.2.6): the sign is U+2212 and sits **before** the ₹ inside one non-wrapping element; a zero forces neutral tone and no sign; the visible figure is `aria-hidden` and the accessible name is `"{label}, {formatted}"` with the sign *not* spoken; and `lang="en-IN" dir="ltr"` keeps the sign, the symbol and the Latin digits in order inside a Devanagari sentence.

### R-C-3 `memo` where it pays, not everywhere. **[review]**

`memo` is mandatory on: every `Ub*` component, every list-row component, every line-editor cell. It is pointless on a page-content component (it re-renders because its own subscriptions changed) and actively misleading on a component whose props always include a fresh object.

A `memo`ised component with an unstable prop is worse than no `memo` — it pays the comparison cost and still re-renders. If you memoise, stabilise the callbacks with `useCallback` in the parent.

```tsx
// ✗ Wrong — memo defeated by a new object and a new function on every parent render.
<PartyListRow party={party} style={{ height: 64 }} onOpen={() => open(party.id)} />

// ✓ Right — stable callback, no inline object; height moves to a class.
const handleOpen = useCallback((id: string) => router.push(`/parties/${id}`), [router]);
…
<PartyListRow party={party} onOpen={handleOpen} />
```

### R-C-4 Props interface is declared above the component, exported, and named `<Component>Props`. **[review]**

Inline prop types are permitted only for a component defined and used inside the same file and never exported.

### R-C-5 Compose; do not configure. **[review]**

A component that grows a `variant` prop per caller is being configured. Split it, or let the caller pass children.

```tsx
// ✗ Wrong — a boolean per caller, each one a new branch.
<UbDialog
  title="Void invoice"
  showReasonField
  showConsequences
  consequenceLines={['Stock +2', 'Ledger −₹898']}
  reasonRequired
  reasonMinLength={3}
  destructive
  showCancel
/>

// ✓ Right — a purpose-built wrapper composed from the general one.
<UbReasonDialog
  open={open}
  titleId="sales.void.title"
  confirmLabelId="sales.void.confirm"
  tone="danger"
  minReasonLength={3}
  onConfirm={handleVoid}
  onCancel={close}
>
  <UbConsequenceList items={consequences} />
</UbReasonDialog>
```

### R-C-6 Maximum props heuristic: seven. **[review]**

Counting `className`. Past seven, one of three things is true and each has a fix:

- The component is doing two jobs → **split it**.
- Several props travel together → **group them into one object prop** (`delta: { value, direction, baseline }`).
- The component is being configured → **take children instead** (R-C-5).

A data-grid or a form field may legitimately exceed seven; they are genuine configuration surfaces. Nothing else is.

### R-C-7 No business logic in a component. **[review]**

If a component contains an `if` about GST, credit limits, permissions arithmetic, status transitions or money maths, that logic belongs in `view-model/` (pure) or in a hook (stateful).

```tsx
// ✗ Wrong — tax law inside JSX.
<span>
  {party.stateCode === tenant.stateCode
    ? `CGST ₹${(taxable * rate / 200).toFixed(2)} + SGST ₹${(taxable * rate / 200).toFixed(2)}`
    : `IGST ₹${(taxable * rate / 100).toFixed(2)}`}
</span>

// ✓ Right — the engine decides; the component renders what it is given.
const split = taxEngine.splitFor(taxable, rate, { isInterState });
…
{split.kind === 'intra' ? (
  <>
    <UbTotalsRow labelId="sales.totals.cgst" value={split.cgst} />
    <UbTotalsRow labelId="sales.totals.sgst" value={split.sgst} />
  </>
) : (
  <UbTotalsRow labelId="sales.totals.igst" value={split.igst} />
)}
```

### R-C-8 No axios, no service, no `fetch` in a component. **[lint]**

Enforced by `import/no-restricted-paths`. Data comes from a hook; hooks dispatch thunks; thunks call services.

```tsx
// ✗ Wrong
useEffect(() => {
  axios.get('/api/v1/parties').then((r) => setRows(r.data.data));
}, []);

// ✓ Right
const { rows, status, error } = usePartyList();
```

### R-C-9 Every screen renders all of its documented states. **[review]**

Each FRD §9 has a States table. A component that renders Success and nothing else is incomplete, not "to be polished later". The minimum set for any data-backed screen: **Loading (skeleton, not a spinner), Empty (first-use vs filtered), Error (retry + request id), Success, and permission-Disabled**.

```tsx
// ✗ Wrong
if (!rows.length) return <p>No data</p>;
return <UbDataGrid rows={rows} columns={columns} />;

// ✓ Right
if (status === 'loading') return <UbDataGrid loading skeletonRows={8} columns={columns} />;
if (status === 'failed') {
  return (
    <UbEmptyState
      variant="error"
      titleId="parties.list.error.title"
      requestId={error?.requestId}
      action={{ labelId: 'action.retry', onClick: retry }}
    />
  );
}
if (!rows.length) {
  return hasActiveFilters ? (
    <UbEmptyState
      variant="filtered"
      titleId="parties.list.empty.filtered.title"
      action={{ labelId: 'parties.list.empty.filtered.action', onClick: clearFilters }}
    />
  ) : (
    <UbEmptyState
      variant="first-use"
      titleId="parties.list.empty.firstUse.title"
      bodyId="parties.list.empty.firstUse.body"
      action={{ labelId: 'parties.action.add', onClick: openCreate }}
    />
  );
}
return <UbDataGrid rows={rows} columns={columns} />;
```

### R-C-10 Keys are stable ids, never array indices. **[lint]**

```tsx
// ✗ Wrong
{lines.map((line, i) => <InvoiceLineRow key={i} line={line} />)}

// ✓ Right — RHF's field id for a field array, the entity id otherwise.
{fields.map((field, index) => (
  <InvoiceLineRow key={field.rowKey} index={index} />
))}
```

### R-C-11 No component is defined inside another component. **[lint]**

A nested definition is a new component type on every render: it remounts, loses state and destroys `memo`.

```tsx
// ✗ Wrong
function InvoiceEditor() {
  const Row = ({ line }) => <tr>…</tr>;      // new type every render
  return <tbody>{lines.map((l) => <Row key={l.id} line={l} />)}</tbody>;
}

// ✓ Right — module scope, memoised, its own file once it grows.
const InvoiceLineRow = memo(function InvoiceLineRowBase({ line }: Readonly<Props>) { … });
```

---

## 25.4 Hooks

### R-H-1 A hook returns data and handlers, never JSX. **[review]**

A hook that returns an element is a component with the wrong name.

### R-H-2 Every hook has a declared return type and a stable shape. **[review]**

```ts
// ✗ Wrong — the shape is whatever the body happens to produce today.
export function usePartyList() {
  …
  return { rows, loading, err, setQ, page, setPage, doExport, x: something };
}

// ✓ Right — an exported, documented result interface.
export interface UsePartyListResult {
  readonly rows: readonly Party[];
  readonly meta: PageMeta;
  readonly totals: PartyTotals | null;
  readonly status: RequestStatus;
  readonly error: ApiErrorShape | null;
  readonly searchInput: string;
  readonly setSearchInput: (value: string) => void;
  readonly setFilters: (patch: Partial<PartyListFilters>) => void;
  readonly setPage: (page: number, pageSize?: number) => void;
  readonly clearFilters: () => void;
  readonly activeFilterCount: number;
}

export function usePartyList(): UsePartyListResult { … }
```

### R-H-3 Handlers returned from a hook are wrapped in `useCallback`; derived objects in `useMemo`. **[review]**

A hook that returns a fresh function on every render makes every `memo` downstream useless.

### R-H-4 Effects declare complete dependency arrays and clean up. **[lint]**

`react-hooks/exhaustive-deps` is an **error**, not a warning. Silencing it with an eslint-disable requires a comment explaining the invariant that makes the omission safe.

```ts
// ✗ Wrong — a stale closure and a race: a slow page 1 can overwrite a fast page 2.
useEffect(() => {
  dispatch(fetchPartyList({ params: filters, mode }));
}, []);

// ✓ Right — complete deps, and the request is aborted when they change.
useEffect(() => {
  const promise = dispatch(fetchPartyList({ params: filters, mode }));
  return () => promise.abort();
}, [dispatch, filters, mode]);
```

### R-H-5 One hook, one concern. **[review]**

`useInvoiceEditor` orchestrates; it delegates lines to `useInvoiceLines`, totals to `useInvoiceTotals`, keyboard to `useInvoiceKeyboard`, autosave to `useInvoiceDraftAutosave`. A 400-line hook is the same defect as a 400-line component.

### R-H-6 Hooks that touch the browser are guarded and client-only. **[lint]**

`'use client'` at the top, and any `window`/`document`/`localStorage` access either inside an effect or behind a `typeof window !== 'undefined'` check. `localStorage` reads are wrapped in try/catch — it throws in private mode on some browsers.

```ts
// ✗ Wrong — runs during render, breaks SSR, throws in private mode.
const pageSize = Number(localStorage.getItem('ub.parties.pageSize') ?? 25);

// ✓ Right — one shared, guarded accessor.
import { readNumber } from 'src/utils/storage';
const [pageSize, setPageSize] = useState(() => readNumber('ub.parties.pageSize', 25));
```

---

## 25.5 Redux
Because UdhaarBook has no query library, the store is the whole server-state story: what is cached, what is stale, what is in flight and what failed. That raises the bar on slice discipline. A slice that omits its `rejected` case leaves a spinner running forever; a slice that forgets its entry in the invalidation map leaves a shopkeeper looking at a balance that is one entry out of date, which in this product is indistinguishable from a bug in the ledger itself.

The rules below are therefore stricter than a typical RTK codebase would need. Read them as the price of the ADR-004 decision: we chose one explicit data pattern over a library that would have made caching implicit, and explicitness only pays when it is complete.


### R-RX-1 Slice name = file name = store key. **[review]**

`partyListSlice.ts` → `createSlice({ name: 'partyList' })` → `store.partyList`.

### R-RX-2 Reducer names are past-tense events, not commands. **[review]**

The action type reads as a sentence in the devtools timeline.

```ts
// ✗ Wrong — commands; they read like function calls, not like history.
reducers: { setFilters, setPage, clearAll, updateBalance }

// ✓ Right — events.
reducers: { filtersChanged, pageChanged, filtersCleared, balanceUpdated, resetPartyList }
```

Thunk action types are `'<sliceName>/<thunkName>'`: `'partyList/fetchPartyList'`.

### R-RX-3 Selectors are exported from the slice; components never inline a path. **[lint]**

```ts
// ✗ Wrong — the shape leaks into every component that reads it.
const rows = useSelector((s: RootState) => s.partyList.rows);

// ✓ Right
const rows = useSelector(selectPartyRows);
```

### R-RX-4 One `useSelector` per value. **[review]**

```ts
// ✗ Wrong — a new object every call, so the component re-renders on every action.
const { rows, totals, status } = useSelector((s: RootState) => ({
  rows: s.partyList.rows, totals: s.partyList.totals, status: s.partyList.status,
}));

// ✓ Right
const rows = useSelector(selectPartyRows);
const totals = useSelector(selectPartyTotals);
const status = useSelector(selectPartyListStatus);
```

### R-RX-5 Every thunk handles all three lifecycle cases. **[review]**

`pending`, `fulfilled` and `rejected` each get an `extraReducers` case. A thunk whose `rejected` is unhandled leaves the UI spinning forever.

### R-RX-6 Thunks use `rejectWithValue` with a normalised `ApiError`, and never throw raw. **[review]**

```ts
// ✗ Wrong — an untyped string, a lost error code, an unusable request id.
export const fetchParty = createAsyncThunk('party/fetch', async (id: string, thunkApi) => {
  try {
    return await getParty(id);
  } catch (error: any) {
    return thunkApi.rejectWithValue(error?.response?.data?.message ?? 'Failed');
  }
});

// ✓ Right
export const fetchParty = createAsyncThunk<
  Party,
  string,
  { rejectValue: ApiErrorShape }
>('partyDetail/fetchParty', async (id, { rejectWithValue }) => {
  try {
    return await getParty(id);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'parties.detail.error.title'));
  }
});
```

### R-RX-7 Thunks contain no UI. **[lint]**

No `dispatch(showSnackbar(...))`, no `router.push`, no `window`, no JSX. A thunk resolves or rejects; the caller decides what the user sees.

### R-RX-8 Cross-feature reaction is via `extraReducers`, never a cross-import of reducers. **[review]**

```ts
// ✗ Wrong — the ledger feature reaching into the parties slice.
import partyListSlice from 'modules/UdhaarBook/features/parties/redux/partyListSlice';
dispatch(partyListSlice.actions.balanceUpdated(...));   // from inside a ledger thunk

// ✓ Right — parties listens to the ledger's own thunk.
// in partyListSlice.ts
.addCase(postLedgerEntry.fulfilled, (state, action) => {
  const row = state.rows.find((r) => r.id === action.payload.partyId);
  if (row) row.balance = action.payload.partyBalance;
  state.stale = true;     // server totals cannot be patched; refetch later
})
```

### R-RX-9 Every mutation is registered and has an invalidation entry. **[lint]**

Part 19 §19.3.6 holds the map, **as code**: `src/redux/invalidation/`. A new thunk is registered in `QUERIES` or `MUTATIONS` (`registry.ts`); a mutation additionally gets its entry in `INVALIDATION` (`map.ts`) and its own `extraReducers` cases for anything it patches in place. Three checks, and you will meet them whether you remember this rule or not: a missing entry is a **TypeScript error** (the map is a total `Record<TMutationName, …>`), a slice key that does not exist is a **TypeScript error** (`TSliceKey = keyof RootState`), and a thunk in neither registry **fails CI** (`invalidation.registry.test.ts`). Without a query library nothing else will notice the staleness, and the symptom reaches the merchant as a balance that "did not update".

### R-RX-10 Nothing non-serialisable enters the store. **[lint]**

RTK's `serializableCheck` stays on. No `Date` objects (ISO strings), no `Decimal` instances (decimal strings), no `Error` instances (`ApiErrorShape`), no functions (action **descriptors**, per §19.12.2), no DOM nodes, no `File` objects (blobs go to IndexedDB, ids go to the store).

### R-RX-11 A feature's slice never reads another feature's state. **[review]**

If two features need the same value, it belongs in a cross-cutting slice (`session`, `whiteLabel`, `locale`) or it is passed as a thunk argument.

---

## 25.6 Forms

### R-F-1 React Hook Form + Yup, always. **[ADR]**

No controlled-input-plus-`useState` forms, no hand-rolled validation, no Formik, no Zod.

### R-F-2 Every validator comes from `useValidationSchemas()`. **[review]**

```ts
// ✗ Wrong — untranslated message, rule duplicated in six files, drifts from the server.
const schema = Yup.object({
  amount: Yup.number().required('Amount is required').positive('Must be positive'),
  mobile: Yup.string().matches(/^[0-9]{10}$/, 'Invalid mobile'),
});

// ✓ Right — composed from the shared, translated, canonical validators.
const v = useValidationSchemas();
const schema = Yup.object({
  amount: v.amountValidation(),
  mobile: v.mobileValidation(true),
});
```

### R-F-3 Schemas live in the feature's `validation/` folder, inside a `use<Feature>Schemas()` hook. **[review]**

The hook wrapper exists because messages are translated and must therefore be built under the current locale, memoised on `[v, t]`.

### R-F-4 `mode: 'onTouched'`, and errors render under the field. **[review]**

Validating on every keystroke punishes a user mid-typing; validating only on submit hides problems until the end. `onTouched` (validate on blur, then live) is the compromise, with `reValidateMode: 'onChange'`.

### R-F-5 Server validation errors are mapped back onto fields. **[review]**

Use `applyServerErrors` (Part 19 §19.5.6). A 400 that only produces a toast is a defect: the user cannot see which field is wrong.

### R-F-6 Field arrays key on RHF's field id and memoise rows. **[review]**

See R-C-10 and Part 19 §19.5.5.

### R-F-7 Forms that can lose work guard navigation. **[review]**

`useUnsavedChangesGuard(formState.isDirty)` on every drawer form and every document editor.

### R-F-8 Client totals are previews; the server's numbers win. **[ADR]**

Canon §0.11 rule 3. When a save returns different totals, the server's replace the preview and the divergence is shown, never silently swallowed.

### R-F-9 Numeric inputs use the right keyboard and the right input. **[review]**

```tsx
// ✗ Wrong — a desktop spinner on a phone, float rounding, no ₹, US grouping.
<input type="number" step="0.01" value={amount} onChange={(e) => setAmount(+e.target.value)} />

// ✓ Right — decimal keypad, string value, ₹ addon, en-IN grouping on blur.
<UbField name="amount" label={t('ledger.entry.amount')} required>
  {(field) => <UbMoneyInput {...field} autoFocus inputMode="decimal" />}
</UbField>
```

### R-F-10 Every POST that creates a document, payment or ledger entry carries a caller-minted `Idempotency-Key`. **[ADR]**

Canon §0.11 rule 5. The key is minted once in the hook, stored in the slice, and **reused on retry**. Minting a new key on retry defeats the entire mechanism.

---

## 25.7 Styling
Every styling rule here reduces to one idea: a value that appears in a class string is a value that cannot be themed, cannot be white-labelled and cannot be audited for contrast. Part 23 spends a whole chapter defining a token set precisely so that four hundred components can share one visual language and one tenant can re-hue the product without a rebuild. A single `bg-blue-500` breaks that for the component it is in, and — because components get copied — for the six components written after it.

The second idea is that the phone comes first. This product is used standing at a counter on a 360 px screen in daylight, not on a 27-inch monitor. Writing desktop classes first and patching them with `max-md:` inverts the priority and produces layouts that are merely tolerable on the device where most of the work happens.


### R-S-1 Tailwind utilities only. No inline `style`, no CSS modules, no styled-components. **[lint]**

Three exceptions, each narrow and each requiring a comment: a genuinely dynamic numeric value that cannot be a class (a progress bar width, a computed drawer height), a CSS custom property set at runtime by the white-label theme hook, and `@media print` rules in the print stylesheet.

```tsx
// ✗ Wrong
<div style={{ backgroundColor: '#2B6BE0', padding: 16, borderRadius: 14 }}>

// ✓ Right
<div className="rounded-card bg-primary-500 p-4">

// ✓ Acceptable — a genuinely dynamic value, with the reason stated.
// Width is a percentage of credit-limit usage; no class can express it.
<div className="h-1.5 rounded-pill bg-accent" style={{ width: `${usagePercent}%` }} />
```

### R-S-2 Colour comes from design tokens. No hex, no `rgb()`, no Tailwind default palette. **[lint]**

`bg-blue-500`, `text-red-600`, `border-gray-200` are all forbidden: they are Tailwind's palette, not ours, and they do not respond to the theme or to white-labelling. A `scripts/check-tokens.mjs` grep fails the build on raw hex in `src/` and `app/` outside `tokens/*.css`.

```tsx
// ✗ Wrong
<span className="text-red-600">₹2,300</span>
<div className="border-gray-200 bg-white">

// ✓ Right
<span className="text-error">₹2,300</span>
<div className="border-border-hairline bg-surface-card">
```

### R-S-3 Class order is fixed. **[lint]**

`prettier-plugin-tailwindcss` sorts automatically; the canonical order is layout → box model → typography → visual → interactive → responsive → state variants. Because the plugin sorts, this rule costs nothing to obey — but a hand-written class string that fights the sorter is a sign the component is doing too much.

```tsx
// ✗ Wrong — unsorted, unreadable, duplicated concerns.
<div className="text-error p-4 flex hover:bg-surface-hover rounded-card gap-2 border md:flex-row flex-col border-border-hairline items-center">

// ✓ Right — sorted by the plugin.
<div className="flex flex-col items-center gap-2 rounded-card border border-border-hairline p-4 text-error hover:bg-surface-hover md:flex-row">
```

### R-S-4 No arbitrary values without a token. **[review]**

`p-[13px]`, `text-[15px]`, `rounded-[14px]` are forbidden — the spacing, type and radius scales exist precisely so these do not appear. Arbitrary values are acceptable only for values that are genuinely outside any scale and are commented: viewport maths, safe-area insets, a grid template.

```tsx
// ✗ Wrong
<div className="mb-[18px] rounded-[14px] p-[13px] text-[15px]">

// ✓ Right
<div className="mb-5 rounded-card p-3 ds-body">

// ✓ Acceptable — viewport maths and a safe-area inset, both commented.
// Bottom sheet: 92vh per LED-01 §7, minus the device's home indicator.
<div className="max-h-[92vh] pb-[env(safe-area-inset-bottom)]">
```

### R-S-5 Typography uses the `ds-*` compound classes. **[review]**

```tsx
// ✗ Wrong — four utilities that will drift from the scale.
<h2 className="text-2xl font-medium leading-tight tracking-tight">Parties</h2>

// ✓ Right
<h2 className="ds-h2">Parties</h2>

// ✓ Right — responsive role switch, which is how Part 23 intends it.
<h1 className="ds-h2 md:ds-h1">New Tax Invoice</h1>
```

Every money and quantity figure additionally carries `ds-num` for tabular figures — in practice this means it is a `UbAmount` (Part 23 §23.2.6) and you are not writing the span yourself.

Labels use **`ds-label`** — 12.5 px, sentence case, locale-aware. **`ds-label-caps`** (11 px, uppercase, +0.09 em) is Latin-only and may never appear on a translated string: `text-transform: uppercase` does nothing to Devanagari, the tracking breaks its conjuncts, and 11 px clips its matras (Part 23 §23.2.2).

```tsx
// ✗ Wrong — an uppercase tier on a string that will be Hindi.
<span className="ds-label-caps">{t('parties.list.columns.balance')}</span>

// ✓ Right
<span className="ds-label">{t('parties.list.columns.balance')}</span>
```

### R-S-6 Write mobile-first. **[review]**

Base classes are the phone; `sm:`, `md:`, `lg:` add to them. Desktop-first with `max-*` variants is forbidden — it inverts the product's priority.

```tsx
// ✗ Wrong — desktop assumed, phone patched.
<div className="grid grid-cols-4 gap-6 max-md:grid-cols-1 max-md:gap-3">

// ✓ Right
<div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4 lg:gap-6">
```

### R-S-7 `cn()` merges; never concatenate class strings. **[lint]**

```tsx
// ✗ Wrong — conflicting classes both survive; `false` leaks into the DOM.
<div className={'rounded-card p-4 ' + (selected && 'bg-accent-quiet') + ' ' + className}>

// ✓ Right — tailwind-merge resolves conflicts; falsy values drop out.
<div className={cn('rounded-card p-4', selected && 'bg-accent-quiet', className)}>
```

### R-S-8 `className` is the last prop and is always merged. **[review]**

Every `Ub*` component accepts `className` and merges it last so a caller can always override. A component that ignores `className` forces callers into wrapper `div`s.

### R-S-9 Interaction states are complete. **[review]**

Every interactive element has hover, focus-visible, active and disabled treatments from Part 23 §23.5. `outline-none` without a replacement focus ring is an accessibility defect, not a style choice.

```tsx
// ✗ Wrong — keyboard users cannot see where they are.
<button className="rounded-control bg-primary-500 px-4 py-2 outline-none">

// ✓ Right
<button
  className="rounded-control bg-primary-500 px-4 py-2 text-text-inverse
             transition-colors duration-fast ease-standard
             hover:bg-primary-600 active:translate-y-px
             focus-visible:outline-none focus-visible:shadow-focus
             disabled:cursor-not-allowed disabled:opacity-45"
>
```

---

## 25.8 Accessibility

### R-A-1 Every input has a programmatically associated label. **[lint]**

`jsx-a11y` is on. A placeholder is not a label; it disappears the moment the user types.

```tsx
// ✗ Wrong
<input placeholder="Amount" />

// ✓ Right — UbField renders the <label for>, wires aria-describedby and aria-invalid.
<UbField name="amount" label={t('ledger.entry.amount')} required>
  {(field) => <UbMoneyInput {...field} />}
</UbField>

// ✓ Right — an icon-only control needs an accessible name.
<UbIconButton aria-label={t('parties.row.actions')} icon={<MoreHorizontal />} />
```

### R-A-2 Colour never carries meaning alone. **[review]**

This is both a WCAG requirement and a product rule from the FRDs: red/green ledger semantics are always paired with the words "You will get" / "You will give", and — since a note displaces the label in a `UbTimeline` row — with a sign as well. Part 23 §23.2.4 states the five rules normatively; the two that get broken most are that a status is a badge with a word in it rather than a coloured dot, and that an error is an outlined block with an icon and a sentence in `--form-error`, never the receivable `--error` and never a filled red block. If the screen stops being usable in greyscale, it fails review.

```tsx
// ✗ Wrong — a red number means nothing to a colour-blind user or a screenshot.
<span className="text-error">₹2,300</span>

// ✓ Right — a balance: tone + label, no sign.
<UbAmount value="2300.00" tone="receivable" label={t('parties.list.totals.receivable')} />

// ✓ Right — a movement in a timeline row whose note already carries the text:
//           the label is hidden visually and kept in the accessible name.
<UbAmount value="500.00" tone="receivable" sign="minus" labelHidden
          label={t('ledger.entry.gave')} />
```

### R-A-3 Touch targets are ≥ 44 × 44 px on mobile. **[review]**

Including icon buttons, table row menus, chips and calendar cells. Where the visual is smaller, pad the hit area rather than shrinking the target.

### R-A-4 Focus is managed on every overlay. **[review]**

`ML*` primitives are Radix-based and trap focus correctly; the rule is to **not break them**. On open, focus moves to the first field (or the dialog title for a confirm); on close, focus returns to the trigger; Escape closes; a dirty form asks before discarding.

Additionally: after a submit that reveals errors, focus the first invalid field (`shouldFocus: true` in `setError`); after adding a line item, focus its Qty cell; after a route change, move focus to the page `<h1>`.

### R-A-5 Semantic elements, correct roles. **[lint]**

```tsx
// ✗ Wrong — not focusable, not in the tab order, no Enter/Space, no role.
<div onClick={openParty}>{party.name}</div>

// ✓ Right — a link when it navigates.
<Link href={`/parties/${party.id}`} className="…">{party.name}</Link>

// ✓ Right — a button when it acts.
<button type="button" onClick={openDrawer}>…</button>
```

Headings are ordered (`h1` once per page, then `h2`, `h3` — never chosen for size, which is what `ds-*` classes are for). Lists are `<ul>/<li>`. Tables that are tabular data are `<table>`.

### R-A-6 Loading and error states are announced. **[review]**

A skeleton region carries `aria-busy="true"`; the snackbar host is an `aria-live="polite"` region (`assertive` for errors); a form-level error summary is focusable and announced.

### R-A-7 Motion respects `prefers-reduced-motion`. **[review]**

The motion tokens already collapse to 0 ms under the media query (Part 23 §23.2.3). Any hand-written animation must do the same.

### R-A-8 Contrast is verified, not assumed. **[lint]**

`scripts/check-contrast.mjs` runs in CI over the token pairings. A new token pairing that fails AA fails the build. Note the standing constraint from Part 23 §23.6: `--success` on white is 3.9:1, so success text is only used at ≥ 14 px medium or accompanied by an icon.

---

## 25.9 Internationalisation
Hindi is not a translation layer bolted on at the end; it is half the product's audience from day one, and the vernacular vocabulary in canon §0.2 — उधार दिया, जमा, बाकी, हिसाब — is what makes the app legible to a shopkeeper who has kept a paper khata for twenty years. A hard-coded English "Save" in a drawer is not a small omission; it is the one word on the screen that tells the user this app was not built for them.

The mechanical rules follow from that seriousness. Keys in both files, always. ICU plurals, because Hindi and English agree on two categories and disagreeing with them silently produces "1 पार्टियाँ". Interpolation rather than concatenation, because Hindi word order differs from English in most of the sentences this product shows. And layouts that survive strings 25 % longer, because they will be.


### R-I-1 No hard-coded user-facing string. **[lint]**

Every string a user can read is a key: labels, buttons, placeholders, `aria-label`s, tooltips, empty states, error messages, toast text, table headers, chip labels, print templates.

```tsx
// ✗ Wrong
<button>Save</button>
<input placeholder="Search name, number or code" />
<UbIconButton aria-label="More actions" />
throw new Error('Party not found');            // user-visible → must be a key

// ✓ Right
<button>{t('action.save')}</button>
<input placeholder={t('parties.list.search.placeholder')} />
<UbIconButton aria-label={t('parties.row.actions')} />
```

Developer-facing strings — console messages, test ids, analytics event names, error codes — are **not** translated and stay English.

### R-I-2 Key naming is `<module>.<screen>.<element>[.<variant>]`. **[review]**

See Part 19 §19.11.3. Keys are flat strings in the JSON.

### R-I-3 Interpolate; never concatenate. **[review]**

```tsx
// ✗ Wrong — untranslatable word order, broken plurals, broken grouping.
<span>{count + ' parties'}</span>
<span>{'Saved ₹' + amount + ' · ' + name + ' now owes ₹' + balance}</span>

// ✓ Right
<span>{t('parties.list.totals.count', { count })}</span>
<span>{t('ledger.entry.saved', { amount: formatInr(amount), name, balance: formatInr(balance) })}</span>
```

```json
{
  "parties.list.totals.count": "{count, plural, one {# party} other {# parties}}",
  "ledger.entry.saved": "Saved {amount} · {name} now owes {balance}"
}
```

### R-I-4 Both locale files always have the same keys. **[lint]**

`npm run i18n:check` fails on a mismatch. A Hindi value may temporarily equal the English one; it may not be absent.

### R-I-5 Dynamic keys come from a closed union. **[review]**

```tsx
// ✗ Wrong — the extractor cannot see these; a typo ships as a raw key.
<span>{t(`status.${invoice.status}`)}</span>

// ✓ Right — a typed map, exhaustive by construction.
const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: 'sales.status.draft',
  issued: 'sales.status.issued',
  partially_paid: 'sales.status.partiallyPaid',
  paid: 'sales.status.paid',
  overdue: 'sales.status.overdue',
  void: 'sales.status.void',
};
<span>{t(STATUS_LABEL[invoice.status])}</span>
```

### R-I-6 Numbers, money and dates go through the shared formatters. **[review]**

`formatInr`, `formatQty`, `formatBusinessDate`, `formatRelative` from `src/utils/`. Never `toLocaleString` inline, never `toFixed` for display, never `new Date().toISOString().slice(0,10)` for a business date (use `todayInTenantTz()` — the device clock is not the tenant's clock).

### R-I-7 Layouts survive a 25 % longer string. **[review]**

Hindi runs longer. No fixed-width buttons, no single-line assumptions on labels, truncation with a tooltip rather than a character cap.

---

## 25.10 Imports and path aliases

### R-IM-1 Import order is fixed and enforced. **[lint]**

`import/order` with these groups, a blank line between each:

1. `react`, `next/*`
2. Third-party packages
3. `src/*` aliased (constants, types, utils, hooks, redux, api)
4. `modules/*` aliased (design system, other features)
5. Relative (`../`, `./`)
6. Type-only imports, merged into their group with `import type`
7. Styles (there are none outside `globals.css`, so this group is usually empty)

```ts
// ✗ Wrong — no grouping, no order, mixed value and type imports.
import { PartyListRow } from './PartyListRow';
import { useDispatch } from 'react-redux';
import type { Party } from '../types/party.types';
import { cn } from 'src/utils/cn';
import { useState } from 'react';
import { UbDataGrid } from 'modules/UdhaarBook/design-system';

// ✓ Right
import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useDispatch, useSelector } from 'react-redux';

import { useTranslation } from 'src/hooks/useTranslation';
import { cn } from 'src/utils/cn';
import type { AppDispatch } from 'src/redux/store';

import { UbDataGrid, UbEmptyState, UbStatCard } from 'modules/UdhaarBook/design-system';

import { usePartyList } from '../hooks/usePartyList';
import { partyDisplay } from '../view-model/partyDisplay';
import type { Party } from '../types/party.types';
import { PartyListRow } from './PartyListRow';
```

### R-IM-2 Four aliases exist; deep relative paths do not. **[lint]**

`src/*`, `modules/*`, `app/*`, `locales/*`. Sibling and parent imports within a feature are relative; anything reaching beyond the feature is aliased. `../../../` is forbidden.

### R-IM-3 The design system is imported from its barrel only. **[lint]**

```ts
// ✗ Wrong
import { UbStatCard } from 'modules/UdhaarBook/design-system/UbStatCard/UbStatCard';

// ✓ Right
import { UbStatCard } from 'modules/UdhaarBook/design-system';
```

### R-IM-4 Type-only imports use `import type`. **[lint]**

Required by `isolatedModules` and it keeps types out of the runtime bundle.

### R-IM-5 The layer import rules of Part 19 §19.1.2 are enforced. **[lint]**

`import/no-restricted-paths` encodes them: no `src/api/**` from `**/components/**`, no `*Service` from a component, no `react` from `view-model/**`, no feature imports from `design-system/**`.

### R-IM-6 No circular imports. **[lint]**

`import/no-cycle` is an error. A cycle almost always means a barrel inside a feature (R-FN-3) or a slice importing another slice (R-RX-11).

---

## 25.11 Comments and JSDoc

### R-CM-1 Comment the **why**, never the **what**. **[review]**

```ts
// ✗ Wrong — restates the code, rots on the next edit.
// Loop over the lines and add up the totals
const total = lines.reduce(…);

// ✓ Right — records a decision and its source.
// Totals are recomputed server-side on save (canon §0.11 rule 3); this preview
// exists only so the panel updates as the user types. A divergence is surfaced,
// never silently corrected — see InvoiceEditorHeader.
const preview = computeDocumentTotals(lines, context);
```

### R-CM-2 Non-obvious code carries its spec reference. **[review]**

A business rule in code cites its FRD clause: `// BR-6: credit limit applies to debit entries only`, `// PTY-02 FR-8: page resets to 1 on any filter change`. This is what makes the codebase auditable against the SSOT, and it is the fastest way for the next reader (human or agent) to check whether the code is still right.

### R-CM-3 JSDoc on every exported function, hook, service, thunk, slice and component. **[review]**

One or two sentences: what it does, and the non-obvious constraint. Parameter tags only where the name is not self-explanatory. No `@returns` restating the return type.

```ts
/**
 * Posts a manual ledger entry and returns the entry plus the party's new balance.
 *
 * The idempotency key must be minted by the caller and REUSED on retry
 * (LED-01 FR-12, BR-8) — a fresh key on retry would double-post a slow first
 * request that eventually lands.
 */
export const postLedgerEntry = async (
  payload: LedgerEntryPayload,
  idempotencyKey: string
): Promise<LedgerEntryResult> => { … };
```

### R-CM-4 `TODO` carries an owner and a ticket. **[lint]**

`// TODO(UB-214, akash): replace with the server-side aging endpoint`. A bare `TODO` fails lint. `FIXME` is not used — if it needs fixing, either fix it or file it.

### R-CM-5 Commented-out code is not committed. **[lint]**

Git remembers. A block of dead code with an explanatory comment ("re-enable when P2 ships") is permitted only with a ticket reference, and only for fewer than ten lines.

### R-CM-6 Section banners inside long files follow one form. **[review]**

```ts
// ── Selectors ────────────────────────────────────────────────────────────────
```

---

## 25.12 Error handling
There is no Sentry at MVP (ADR-018, ADR-021), which means the only report of a client-side failure is what the user tells us. That single fact drives every rule below: a failure must be visible, must be describable in a screenshot, and must carry the one token — the request id — that ties it to a structured backend log. An empty `catch`, a toast that says "Something went wrong" with no reference, or a switch on a localised message string each turn a five-minute diagnosis into an unanswerable support thread.

The second driver is that this is a financial product. "Did my entry save?" must always have an answer on screen. That is why background work fails quietly but user-initiated work never does, and why optimistic rows that fail turn amber with a Retry rather than disappearing.


### R-E-1 Catch `unknown`, normalise once. **[lint]**

```ts
// ✗ Wrong
catch (error: any) {
  showToast(error.response.data.message);
}

// ✓ Right
catch (error) {
  const apiError = toApiError(error, 'parties.detail.error.title');
  …
}
```

### R-E-2 Switch on `error.code`, never on `error.message`. **[review]**

The message is localised; matching on it breaks the moment a user switches to Hindi.

```ts
// ✗ Wrong
if (error.message.includes('credit limit')) showOverride();

// ✓ Right
if (apiError.code === 'credit_limit_exceeded') showOverride(apiError.details);
```

### R-E-3 Every failure surfaces somewhere. **[review]**

The decision table is Part 19 §19.12.3. An empty `catch {}` is forbidden; a `catch` that only `console.error`s is permitted only for genuinely background work (analytics, prefetch, autosave downgrade) and must say so in a comment.

### R-E-4 Rendered errors show the request id. **[review]**

Anything larger than a field message renders `error.requestId` in `ds-mono` `ds-caption` with a copy affordance. It is the only link between a user's screenshot and a server log.

### R-E-5 `console.log` is banned; `console.warn` is dev-only; `console.error` goes through `logClientError`. **[lint]**

`no-console` allows `warn` and `error` only. Nothing that could be PII — mobile numbers, party names, GSTINs, amounts, note text — is ever logged.

### R-E-6 Independently-failing regions get an error boundary. **[review]**

Dashboard tiles, the line editor, the party timeline, each chart. A crash in one must not blank the page.

---

## 25.13 Dependencies
The dependency policy is stricter here than in most web projects, and the reason is in the canon: UdhaarBook runs locally for personal use first and must stay extensible and auditable later. Every package is a permanent obligation — bundle bytes on a 3G connection, a supply-chain surface, an upgrade that will one day block a Next.js major, and a piece of behaviour nobody on the team can read. A hundred lines of local code that we understand completely is almost always a better trade than a hundred kilobytes of code that we do not.

This is also why the allow-list is expressed as an ADR rather than a lint rule alone: adding a package is a product decision with a maintenance cost, not a developer convenience, and it should be recorded where the next person can find the reasoning.


### R-D-1 The ADR-021 allow-list is the whole list. **[ADR]**

Runtime: `next`, `react`, `react-dom`, `typescript`, `tailwindcss`, `tailwindcss-animate`, `ml-uikit`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `@reduxjs/toolkit`, `react-redux`, `axios`, `react-hook-form`, `@hookform/resolvers`, `yup`, `@tanstack/react-table`, `react-intl`, `dayjs`, `decimal.js-light`, `js-cookie`, `react-dropzone`, `react-error-boundary`.

Dev: `eslint` (+ the configured plugins), `prettier` (+ `prettier-plugin-tailwindcss`), `jest`, `@testing-library/*`, `husky`, `lint-staged`.

### R-D-2 Anything else requires an ADR, merged before the install. **[ADR]**

The ADR must state: what problem it solves, why no allowed package or ~100 lines of local code solves it, bundle cost in gzipped KB, licence, maintenance signal (last release, open issues, bus factor), and the removal path.

### R-D-3 Write it locally when it is small. **[review]**

The product runs locally for personal use first and must stay extensible and auditable. Things already written locally rather than installed, and which set the bar: the QR encoder (`UbQrCode`), image compression, the debounce hook, the CSV export writer, the query-string builder, the case mapper, the ID/UUID helpers, the web-vitals collector, and the service worker.

```ts
// ✗ Wrong — a dependency, a bundle cost and a supply-chain surface for 15 lines.
import debounce from 'lodash.debounce';

// ✓ Right
export function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
```

### R-D-4 No package is added for a single call site. **[review]**

### R-D-5 Imports are specific, never namespace-wide. **[lint]**

```ts
// ✗ Wrong — ships ~1,400 icons.
import * as Icons from 'lucide-react';

// ✓ Right
import { Clock, AlertTriangle } from 'lucide-react';
```

### R-D-6 The lockfile is committed and `npm ci` is what CI runs. **[lint]**

---

## 25.14 ESLint and Prettier configuration

The configuration below is normative — it is the file, not a sketch of one.

```js
// eslint.config.mjs
import next from 'eslint-config-next/core-web-vitals';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import';
import a11y from 'eslint-plugin-jsx-a11y';
import prettier from 'eslint-config-prettier';

export default [
  ...next,
  prettier,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: './tsconfig.json', ecmaFeatures: { jsx: true } },
    },
    plugins: { '@typescript-eslint': tseslint, import: importPlugin, 'jsx-a11y': a11y },
    settings: { 'import/resolver': { typescript: { project: './tsconfig.json' } } },
    rules: {
      // ── TypeScript ────────────────────────────────────────────────────────
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
      '@typescript-eslint/explicit-module-boundary-types': 'warn',
      'no-restricted-syntax': [
        'error',
        { selector: 'TSEnumDeclaration', message: 'Use an `as const` object + union type (R-TS-8).' },
      ],

      // ── React ─────────────────────────────────────────────────────────────
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'react/jsx-key': ['error', { checkFragmentShorthand: true }],
      'react/no-unstable-nested-components': 'error',
      'react/jsx-no-bind': ['warn', { allowArrowFunctions: true, ignoreRefs: true }],
      'react/self-closing-comp': 'error',

      // ── Imports ───────────────────────────────────────────────────────────
      'import/no-default-export': 'error',
      'import/no-cycle': ['error', { maxDepth: 4 }],
      'import/order': ['error', {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'type'],
        pathGroups: [
          { pattern: 'react', group: 'external', position: 'before' },
          { pattern: 'next/**', group: 'external', position: 'before' },
          { pattern: 'src/**', group: 'internal', position: 'before' },
          { pattern: 'modules/**', group: 'internal', position: 'after' },
        ],
        pathGroupsExcludedImportTypes: ['react'],
        'newlines-between': 'always',
        alphabetize: { order: 'asc', caseInsensitive: true },
      }],
      // Part 19 §19.1.2 — the layering rule, mechanically enforced.
      'import/no-restricted-paths': ['error', {
        zones: [
          { target: './src/modules/**/components/**', from: './src/api', message: 'Components never call the API. Use a hook → thunk → service (R-C-8).' },
          { target: './src/modules/**/components/**', from: './src/modules/**/api', message: 'Components never import services (R-C-8).' },
          { target: './src/modules/**/view-model/**', from: './node_modules/react', message: 'View-models are pure: no React.' },
          { target: './src/design-system/**', from: './src/modules/UdhaarBook/features', message: 'The design system never imports feature code.' },
          { target: './src/design-system/**', from: './src/redux', message: 'The design system never reads Redux.' },
          { target: './app/**', from: './src/api', message: 'Route files are thin (Part 19 §19.1.4).' },
        ],
      }],

      // ── Accessibility ─────────────────────────────────────────────────────
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/anchor-is-valid': 'error',
      'jsx-a11y/label-has-associated-control': ['error', { assert: 'either' }],
      'jsx-a11y/no-static-element-interactions': 'error',
      'jsx-a11y/click-events-have-key-events': 'error',
      'jsx-a11y/no-autofocus': 'off',   // amount fields autofocus by design (LED-01 FR-11)

      // ── General ───────────────────────────────────────────────────────────
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-restricted-globals': ['error', { name: 'event', message: 'Use the handler parameter.' }],
      // Part 19 §19.10.3 — one network state machine. `navigator.onLine === true`
      // is not evidence of connectivity, and a second implementation of it is
      // how the Save button ends up with two behaviours.
      'no-restricted-properties': ['error', {
        object: 'navigator', property: 'onLine',
        message: 'Use useDegradedNetwork() (Part 19 §19.10.3). Only src/hooks/useDegradedNetwork.ts may read this.',
      }],
      'no-restricted-imports': ['error', {
        paths: [
          { name: 'lodash', message: 'Not on the ADR-021 list (R-D-1).' },
          { name: 'moment', message: 'Use dayjs (ADR-021).' },
          { name: '@tanstack/react-query', message: 'Not used. Slice + thunk + service (ADR-004).' },
        ],
        patterns: [
          { group: ['modules/UdhaarBook/design-system/*/*'], message: 'Import from the barrel (R-IM-3).' },
          { group: ['../../../*'], message: 'Use a path alias (R-IM-2).' },
        ],
      }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-param-reassign': ['error', { props: false }],   // props:false — Immer drafts
    },
  },
  {
    // The one module allowed to read navigator.onLine — it is the state machine.
    files: ['src/hooks/useDegradedNetwork.ts'],
    rules: { 'no-restricted-properties': 'off' },
  },
  {
    // Next.js requires default exports from route files.
    files: ['app/**/{page,layout,error,not-found,loading,template,route}.tsx', 'app/**/*.ts'],
    rules: { 'import/no-default-export': 'off' },
  },
  {
    // RTK slices export their reducer as default, by convention.
    files: ['**/*Slice.ts'],
    rules: { 'import/no-default-export': 'off', 'no-param-reassign': 'off' },
  },
  {
    files: ['**/*.test.{ts,tsx}', 'src/tests/**'],
    rules: { '@typescript-eslint/no-explicit-any': 'off', 'no-console': 'off' },
  },
];
```

```jsonc
// .prettierrc
{
  "singleQuote": true,
  "semi": true,
  "trailingComma": "es5",
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always",
  "endOfLine": "auto",
  "plugins": ["prettier-plugin-tailwindcss"],
  "tailwindFunctions": ["cn", "cva"]
}
```

```jsonc
// .lintstagedrc — pre-commit, changed files only
{
  "*.{ts,tsx}": ["eslint --fix --max-warnings=0", "prettier --write"],
  "*.{json,md,css}": ["prettier --write"],
  "locales/*.json": ["node scripts/check-locales.mjs"]
}
```

---

## 25.15 Testing standards
The layering of Part 19 exists partly so that most of what can be wrong can be tested without a browser. Tax splits, Indian number grouping, GSTIN checksums, tenant-timezone date maths, permission-filtered action menus, status-to-tone maps, reducer transitions and the invalidation map are all pure, all fast and all exactly where the expensive bugs live. Component tests then cover what a user sees; end-to-end tests cover the acceptance criteria against a real backend.

The rules below are about authoring, not coverage percentages. The one number that matters is in Part 19 §19.14.6: 80 % statements on the pure layers, and no floor on components — because a coverage target on components buys shallow render tests, and a coverage target on a tax engine buys correctness.


Part 30 owns coverage strategy; these are the authoring rules.

### R-T-1 Every pure module has a unit test. **[review]**

`view-model/**`, `utils/**`, `validation/**` and every reducer and thunk. These are cheap, fast and where the real bugs are.

### R-T-2 Tests query by role and accessible name first. **[review]**

```tsx
// ✗ Wrong — brittle, and asserts nothing about accessibility.
expect(container.querySelector('.save-btn')).toBeDisabled();

// ✓ Right — the assertion doubles as an a11y check.
expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
```

`data-testid` is the fallback, in the `<feature>-<element>[-<qualifier>]` form of Part 19 §19.13.2.

### R-T-3 Component tests use `renderWithProviders`. **[review]**

Never assemble the store, `IntlProvider` and theme by hand.

### R-T-4 Services are mocked at the module boundary; MSW is not used. **[ADR]**

Part 19 §19.13.3.

### R-T-5 Every FRD §9 state row gets a test. **[review]**

Loading, Empty (first-use and filtered), Error, Success, Disabled-by-permission, and any Partial/Processing row the FRD lists.

### R-T-6 Tests assert behaviour, not implementation. **[review]**

No asserting on internal state, on a `useState` call count, or on a slice's private field. Assert what the user sees and what the server is asked for.

---

## 25.16 Performance rules

These are the coding-level rules that keep the budgets of Part 19 §19.9 achievable. They are not optimisations to apply later; applying them later means rewriting the components that violated them.

### R-P-1 Column definitions are built by a module-level factory and memoised on their real dependencies. **[review]**

This is the single most expensive mistake available in this codebase. A column array recreated on every render forces TanStack Table to rebuild its entire internal model, which re-renders every cell of every row. On a 100-row grid on a low-end phone that is a visible stall on every keystroke in the search box.

```tsx
// ✗ Wrong — a new array, new accessor functions and new cell renderers every render.
function PartyListPageContent() {
  const { t } = useTranslation();
  const columns = [
    { id: 'name', header: t('parties.col.name'), cell: ({ row }) => <span>{row.original.name}</span> },
    …
  ];
  return <UbDataGrid columns={columns} rows={rows} />;
}

// ✓ Right — factory at module scope, memoised on what actually changes,
//   translated text rendered by a component so a locale change does not
//   invalidate the array.
const col = createColumnHelper<Party>();

function createPartyColumns(onOpen: (id: string) => void, showTags: boolean) {
  return [
    col.accessor('name', {
      id: 'name',
      header: () => <TranslatedText id="parties.col.name" />,
      cell: ({ row }) => <PartyNameCell party={row.original} onOpen={onOpen} />,
    }),
    …
  ];
}

function PartyListPageContent() {
  const onOpen = useCallback((id: string) => router.push(`/parties/${id}`), [router]);
  const columns = useMemo(() => createPartyColumns(onOpen, showTags), [onOpen, showTags]);
  return <UbDataGrid columns={columns} rows={rows} />;
}
```

### R-P-2 `useWatch` is scoped to the smallest field set that matters. **[review]**

Watching the whole form recomputes the invoice totals when the user types in the notes field. Watch `lines` and the three discount fields, nothing else, and funnel them through one memoised engine call.

```ts
// ✗ Wrong — every keystroke anywhere recomputes tax for twenty lines.
const values = useWatch({ control });
const totals = computeDocumentTotals(values, context);

// ✓ Right
const lines = useWatch({ control, name: 'lines' });
const discountType = useWatch({ control, name: 'documentDiscountType' });
const discountValue = useWatch({ control, name: 'documentDiscountValue' });
const totals = useMemo(
  () => computeDocumentTotals({ lines, discountType, discountValue }, context),
  [lines, discountType, discountValue, context]
);
```

### R-P-3 No object or array literal is passed as a prop to a memoised component. **[review]**

An inline `{}`, `[]` or arrow function is a new reference on every render and silently defeats `memo`. Hoist it to a module constant when it is static, or memoise it when it is derived.

```tsx
// ✗ Wrong
<UbDataGrid rows={rows} toolbar={{ search: { value, onChange: (v) => setValue(v) } }} />

// ✓ Right
const toolbar = useMemo(
  () => ({ search: { value: searchInput, onChange: setSearchInput, placeholderId: 'parties.list.search.placeholder' } }),
  [searchInput, setSearchInput]
);
<UbDataGrid rows={rows} toolbar={toolbar} />
```

### R-P-4 Heavy, rarely-opened UI is dynamically imported. **[review]**

Charts, print templates, the import wizard, the onboarding wizard and the design-system gallery are `next/dynamic` with a skeleton fallback and `ssr: false` where they touch the DOM. A drawer whose chunk is fetched while it animates in costs the user nothing; a chart bundled into every route costs every user on every visit.

### R-P-5 Icons are imported individually. **[lint]**

See R-D-5. A namespace import of `lucide-react` alone would blow the shared-chunk budget.

### R-P-6 Skeletons reserve the real height. **[review]**

A skeleton that is a different height from the content it replaces produces layout shift, which is both a Lighthouse failure and a genuine usability problem when a user taps where a row was about to be. `UbSkeleton` presets carry the same row heights as the components they stand in for (64 px list row, 56 px grid row, the card and form shapes), and a new skeleton is measured against its real counterpart before it is committed.

### R-P-7 Debounce user input; abort superseded requests. **[review]**

Search is debounced 300 ms (the constant lives in `src/constants.ts`, not inline). The fetch effect returns `promise.abort()` so a slow first request cannot overwrite a fast second one, and the slice's `rejected` case ignores `action.meta.aborted`. Both halves are required: debouncing without aborting still races, and aborting without debouncing still floods the network on a 3G connection.

### R-P-8 Lists render memoised rows and stable callbacks. **[review]**

Row components are `memo`ised, take primitives and stable functions, and receive an id rather than closing over one. See R-C-3.

### R-P-9 No expensive work during render. **[review]**

Sorting, filtering, grouping, formatting a hundred amounts, parsing dates — all of it goes in `useMemo` keyed on the data, or in a `createSelector`, or (better) is done by the server, which is why the API has `ordering`, `q` and filtered-set totals in the first place. A component that sorts an array inline sorts it again on every unrelated re-render.

---

## 25.17 Security rules

The client is not a security boundary — the server is — but client-side mistakes still cause real harm, and three of them are easy to make in this product.

### R-SEC-1 `dangerouslySetInnerHTML` is forbidden. **[lint]**

There is no user-supplied HTML anywhere in UdhaarBook. Party names, item descriptions, notes, terms and tenant document headers are plain text and React escapes them. The temptation appears in print templates, where a developer wants a rich footer; the answer is a small set of typed blocks, not raw HTML. Combined with httpOnly token cookies (Part 19 §19.7.1), this keeps a single XSS from becoming a session compromise — but the rule stands on its own.

### R-SEC-2 Permission checks on the client hide, they do not authorise. **[review]**

`<Can permission="…">` decides what to render. Every action it guards is independently enforced by the server, and a reviewer must be able to point at that enforcement. A client-only check is a UX affordance that an attacker bypasses with a `fetch`.

### R-SEC-3 Never send or trust a tenant id from the client. **[ADR]**

Part 22 §22.1: `X-Tenant-Id` is not trusted; the active tenant is the `tid` claim. Switching tenant means asking for a new token (Part 19 §19.6.5). Code that adds a tenant header, or that filters another tenant's rows client-side, is a security defect.

### R-SEC-4 Redirect targets are validated. **[review]**

`?next=` is used after login (Part 19 §19.6.4). It must be a same-origin path beginning with a single `/`, checked before use. An unvalidated `next` is an open redirect, and a phishing link that lands on a real login page and then bounces to an attacker's site is very convincing.

```ts
// ✗ Wrong
router.replace(searchParams.get('next') ?? '/dashboard');

// ✓ Right
const nextParam = searchParams.get('next');
const safeNext =
  nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/dashboard';
router.replace(safeNext);
```

### R-SEC-5 External links carry `rel="noopener noreferrer"`. **[lint]**

Applies to WhatsApp share links, UPI intents opened in a new tab and any partner URL.

### R-SEC-6 No secret is a `NEXT_PUBLIC_*` variable. **[review]**

Everything prefixed `NEXT_PUBLIC_` is compiled into the bundle and readable by anyone. API keys, provider credentials and signing secrets live on the server. The permitted public list is in Part 19 §19.14.1 and nothing is added to it without review.

### R-SEC-7 No PII leaves the client except to our own API. **[review]**

Mobile numbers, party names, GSTINs, amounts and note text never appear in analytics properties, console output, a third-party script or a URL query string. Analytics events carry ids, codes, counts and buckets — which is exactly what the FRD §18 event schemas already specify (`amount_bucket`, not `amount`).

### R-SEC-8 Uploads are validated client-side and again server-side. **[review]**

Accept only the declared MIME types, cap the size before compression, compress to ≤ 300 KB, and never render an uploaded file as anything but an image. The server re-validates by magic bytes and strips EXIF; the client check exists to save the user a failed round trip, not to be trusted.

---

## 25.18 Code-review checklist

A reviewer — human or agent — walks this before approving. A "no" anywhere blocks the merge.

**Structure**
1. Every new file is in the folder its kind belongs to (Part 19 §19.2), with the naming form of §25.2.
2. No component imports axios, a service or `src/api/**`.
3. Route files are thin: Suspense + one `*PageContent`.
4. No barrel added inside a feature; design-system imports come from the barrel.
5. No import cycle; no `../../../`.

**Types**
6. No `any`; no non-null assertion; no `as` without a reason comment.
7. Props are `readonly`, the interface is exported and declared above the component.
8. State is a discriminated union, not booleans.
9. Money and quantity are strings; no float arithmetic on money.
10. Exported functions declare return types.

**Data layer**
11. New endpoint → a service function with wire→domain mapping and typed wire shape.
12. New async work → a thunk with three type arguments, `rejectWithValue(toApiError(...))`, and no UI.
13. New slice → `status` union, `ApiErrorShape` error, co-located selectors, a `reset*` reducer, and a `resetAllFeatureState` case.
14. New mutation → a row added to the invalidation map (Part 19 §19.3.6) and the matching `extraReducers`.
15. Document/payment/entry POST carries a caller-minted idempotency key, reused on retry.
16. Nothing non-serialisable entered the store.

**UI**
17. All documented states render: loading skeleton, both empty variants, error with retry and request id, success, permission-disabled.
18. `Ub*` components follow the template: `memo`, `displayName`, `className` last, merged with `cn()`.
19. No hard-coded colour, no arbitrary value without a comment, no inline `style` without a reason.
20. Typography uses `ds-*`; every amount uses `ds-num`.
21. Mobile-first classes; the screen is usable at 360 px and the keyboard does not cover the primary action.
22. Interaction states complete, focus ring present, touch targets ≥ 44 px.
23. Colour is never the only signal; every red/green amount carries its label.

**Forms**
24. RHF + Yup, schema composed from `useValidationSchemas()` inside a `use*Schemas()` hook.
25. Server `validation_error` details are mapped back onto fields.
26. Dirty forms guard navigation; document editors autosave.

**i18n**
27. Zero hard-coded user-facing strings, including `aria-label`s and placeholders.
28. Keys added to **both** `en.json` and `hi.json`; plurals use ICU; nothing is concatenated.
29. Dates via the shared formatters and `todayInTenantTz()`; money via `formatInr`.

**Errors and observability**
30. Errors caught as `unknown` and normalised; switched on `code`, not `message`.
31. Every failure surfaces; no empty catch; request id rendered on non-field errors.
32. No `console.log`; nothing PII is logged.

**Dependencies and tests**
33. No new package without a merged ADR.
34. Unit tests for every new pure module; component tests for every new state.
35. `npm run verify` passes: type-check, lint (zero warnings), i18n check, tests, build, bundle budget.

---

## 25.19 AI coding agent quick reference

Before considering **any** frontend file complete, satisfy every line that applies. This is the compressed form of everything above; when it conflicts with a section above, the section above wins.

**Always, for every file**
- [ ] The file is in the folder Part 19 §19.2 prescribes, with the §25.2 name.
- [ ] Named exports only (except Next.js route files and slice reducers).
- [ ] No `any`, no `!`, no unexplained `as`.
- [ ] No hard-coded user-facing string — every one is a `t('key')` present in **both** `en.json` and `hi.json`.
- [ ] No hex colour, no Tailwind default palette (`blue-500`, `gray-200`), no inline `style` without a comment.
- [ ] No `console.log`. No PII in any log.
- [ ] No package outside the ADR-021 list.
- [ ] Imports grouped and ordered per R-IM-1; design system from the barrel; no `../../../`.
- [ ] Comments say *why*, and cite the FRD clause for any business rule.

**Writing a component**
- [ ] `'use client'` if it uses state, effects, events or context.
- [ ] `readonly` props interface, exported, above the component; parameter is `Readonly<Props>`.
- [ ] ≤ 7 props (counting `className`); past that, split or take children.
- [ ] `className` last, merged with `cn()`.
- [ ] `Ub*` only: `Base` function + `displayName` + `memo` + `index.ts` + barrel line + test + gallery entry.
- [ ] No axios, no service, no business rule, no tax/permission arithmetic in the JSX.
- [ ] Renders loading, both empty variants, error (with retry + request id), success, permission-disabled.
- [ ] Keys are stable ids; no component defined inside another.
- [ ] Mobile-first classes; `ds-*` typography; `ds-num` on every amount; focus ring; ≥ 44 px targets; label beside every coloured amount.

**Writing a hook**
- [ ] `'use client'`; returns data + handlers, never JSX.
- [ ] Exported result interface; handlers in `useCallback`, derived objects in `useMemo`.
- [ ] Effects have complete deps and clean up; fetch effects abort on dependency change.
- [ ] `localStorage`/`window` access is guarded and wrapped in try/catch.
- [ ] One concern; delegates the rest to sibling hooks.

**Writing a service**
- [ ] One exported async function per endpoint, with a declared return type.
- [ ] Wire shape typed in snake_case; a `to<Domain>` mapper converts to camelCase.
- [ ] Money and quantity stay **strings**.
- [ ] Path from `API_PATHS`; query built with `toQueryString`.
- [ ] Idempotency key accepted as a parameter for creating POSTs.
- [ ] No React, no Redux, no `t()`.

**Writing a thunk**
- [ ] `createAsyncThunk<Return, Arg, { rejectValue: ApiErrorShape }>`.
- [ ] Type string is `'<sliceName>/<thunkName>'`.
- [ ] Body is try → one service call; catch → `rejectWithValue(toApiError(error, 'some.key'))`.
- [ ] No UI, no snackbar, no router, no `window`.

**Writing a slice**
- [ ] `name` = file name = store key; registered in `store.ts`.
- [ ] `status` is a union; `error` is `ApiErrorShape | null`; nothing non-serialisable.
- [ ] Reducers are past-tense events; a `reset*` reducer exists; a `resetAllFeatureState` case exists.
- [ ] `extraReducers` handles pending, fulfilled **and** rejected (ignoring aborts).
- [ ] Cross-feature reaction listens to the other feature's thunk; no reducer cross-import.
- [ ] Selectors exported at the bottom; derived ones use `createSelector`.
- [ ] Part 19 §19.3.6 invalidation map updated for any new mutation.

**Writing a form**
- [ ] RHF with `yupResolver`, `mode: 'onTouched'`.
- [ ] Schema in `validation/<x>Schemas.ts`, inside `use<X>Schemas()`, composed from `useValidationSchemas()` — no raw Yup primitives with English literals.
- [ ] Fields rendered through `UbField`; numeric fields use `UbMoneyInput`/`UbQuantityInput`/`UbPercentInput` with `inputMode`.
- [ ] `applyServerErrors` maps 400 details back onto fields with `shouldFocus`.
- [ ] Field arrays keyed on RHF's field id, rows memoised, totals from one scoped `useWatch`.
- [ ] Dirty guard on navigation; document editors autosave locally and to the server.
- [ ] Client totals labelled as previews; the server's numbers replace them on save.

**Before saying "done"**
- [ ] `npm run type-check` — clean.
- [ ] `npm run lint` — zero errors, zero warnings.
- [ ] `npm run i18n:check` — key sets identical.
- [ ] `npm run test` — new pure modules and new states covered.
- [ ] `npm run build` and `npm run check:bundle` — within the Part 19 §19.9.2 budgets.
- [ ] Walked §25.18 and answered yes to all 35 lines.
