/**
 * F03 (LIB-02) — the catalogue's view types, camelCase. The wire shapes and
 * their conversion live in `api/libraryMapping.ts` and nowhere else.
 *
 * Keys the server OMITS until their tables exist (B05, CLAUDE.md PTY-03) are
 * absent here too: a title has no `holdsWaiting`/`holds`/`issues12m` and a copy
 * no `dueOn`/`borrower`/`loans` until LIB-06 and LIB-08. A field typed as
 * always-present would render "0 waiting" for holds nobody has counted.
 */

export const MATERIAL_TYPES = [
  'book',
  'reference',
  'magazine',
  'textbook',
  'audio_visual',
  'other',
] as const;
export type MaterialType = (typeof MATERIAL_TYPES)[number];

export const COPY_STATUSES = [
  'available',
  'on_loan',
  'on_hold_shelf',
  'in_repair',
  'lost',
  'missing',
  'withdrawn',
] as const;
export type CopyStatus = (typeof COPY_STATUSES)[number];

export const COPY_SOURCES = ['bought', 'gifted', 'transferred', 'other'] as const;
export type CopySource = (typeof COPY_SOURCES)[number];

export const COPY_CONDITIONS = ['good', 'fair', 'poor'] as const;
export type CopyCondition = (typeof COPY_CONDITIONS)[number];

export const WITHDRAW_REASONS = [
  'worn_out',
  'lost',
  'missing',
  'transferred',
  'damaged',
  'other',
] as const;
export type WithdrawReason = (typeof WITHDRAW_REASONS)[number];

export type TitleStatus = 'active' | 'archived';

export interface CatalogueRef {
  readonly id: string;
  readonly name: string;
}

export interface TitleRow {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly authors: string;
  readonly isbn13: string | null;
  readonly isbn10: string | null;
  readonly category: CatalogueRef | null;
  readonly materialType: MaterialType;
  readonly copiesTotal: number;
  readonly copiesAvailable: number;
  readonly status: TitleStatus;
}

export interface CopyRow {
  readonly id: string;
  readonly accessionNumber: string;
  readonly barcode: string | null;
  readonly title: { readonly id: string; readonly title: string; readonly authors: string };
  readonly location: { readonly id: string; readonly code: string } | null;
  readonly locationText: string;
  readonly status: CopyStatus;
  readonly isReference: boolean;
  readonly price: string | null;
  readonly condition: CopyCondition;
  readonly volumeLabel: string;
}

export interface TitleDetail extends TitleRow {
  readonly publisher: string;
  readonly edition: string;
  readonly year: number | null;
  readonly language: string;
  readonly callNumber: string;
  readonly keywords: string;
  readonly notes: string;
  readonly copies: readonly CopyRow[];
  readonly version: number;
}

export interface CopyEvent {
  readonly id: string;
  readonly fromStatus: CopyStatus | null;
  readonly toStatus: CopyStatus;
  readonly reasonCode: string;
  readonly note: string;
  readonly onDate: string;
  readonly createdAt: string;
}

export interface CopyDetail extends CopyRow {
  readonly acquiredOn: string | null;
  readonly source: CopySource;
  readonly sourceNote: string;
  readonly withdrawnOn: string | null;
  readonly withdrawnReason: WithdrawReason | null;
  readonly withdrawnNote: string;
  readonly lastSeenOn: string | null;
  readonly issuedEver: boolean;
  readonly events: readonly CopyEvent[];
  readonly version: number;
}

export interface LibraryCategory {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly titleCount: number;
}

export interface LibraryLocation {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly copyCount: number;
}

/** A list page (the server's `PagePagination` meta). */
export interface CataloguePage<R> {
  readonly rows: readonly R[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly totalPages: number;
  /** Any record of this kind at all, whatever the filters (approved designs, 12 Oct 2026). */
  readonly hasAny?: boolean;
}

/** The titles list's axes, as the URL carries them (FR-10 — those B05 serves). */
export type TitleFilters = Readonly<{
  q: string;
  availability: '' | 'on_shelf' | 'all_out';
  materialType: '' | MaterialType;
  category: string;
  status: '' | 'archived' | 'all';
  ordering: '' | '-created_at';
  page: string;
}>;

/** The copies list's axes (FR-10). */
export type CopyFilters = Readonly<{
  q: string;
  status: '' | CopyStatus;
  location: string;
  title: string;
  priceMissing: '' | 'true';
  ordering: '' | 'title';
  page: string;
}>;

/** The copies block of "Add book" and "Add copies" (FR-4). */
export interface CopiesFormValues {
  count: string;
  numbering: 'auto' | 'typed';
  numbers: string[];
  locationId: string;
  price: string;
  acquiredOn: string;
  source: CopySource;
  sourceNote: string;
  isReference: boolean;
  volumeLabel: string;
}

export interface TitleFormValues {
  title: string;
  subtitle: string;
  authors: string;
  isbn: string;
  publisher: string;
  edition: string;
  year: string;
  language: string;
  categoryId: string;
  materialType: MaterialType;
  callNumber: string;
  keywords: string;
  notes: string;
}

export interface AddBookFormValues extends TitleFormValues {
  copies: CopiesFormValues;
}

export interface WithdrawFormValues {
  reason: WithdrawReason | '';
  note: string;
}

/** What a create or add-copies answered with (FR-4, BR-5). */
export interface CopiesCreated {
  readonly titleId: string;
  readonly title: string;
  readonly numbers: readonly string[];
  readonly isbnExists: boolean;
}
