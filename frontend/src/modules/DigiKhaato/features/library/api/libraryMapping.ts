/**
 * F01 — wire (snake_case) ↔ view (camelCase) for every library payload, in one
 * place (FRD library §7, "mapping in `api/libraryMapping.ts`"). The services
 * call these; components never see a wire shape.
 *
 * Starts with the one conversion every library list needs — the filters a
 * list sends as query parameters — and grows with each F-task's payloads.
 */
import type {
  CopiesFormValues,
  CopyCondition,
  CopyDetail,
  CopyEvent,
  CopyFilters,
  CopyRow,
  CopySource,
  CopyStatus,
  LibraryCategory,
  LibraryLocation,
  MaterialType,
  TitleDetail,
  TitleFilters,
  TitleFormValues,
  TitleRow,
  TitleStatus,
  WithdrawReason,
} from '../types/catalogue.types';
import type { LibraryListFilters } from '../types/library.types';

/** `{ dueBefore: '2026-10-01', q: '' }` → `{ due_before: '2026-10-01' }` (blanks dropped). */
export const toLibraryQuery = (filters: LibraryListFilters): Record<string, string> =>
  Object.fromEntries(
    Object.entries(filters)
      .filter(([, value]) => value.trim() !== '')
      .map(([key, value]) => [key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), value.trim()])
  );

// ── F03 (LIB-02) — the catalogue ─────────────────────────────────────────────

type Wire = Readonly<Record<string, unknown>>;

const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const strOrNull = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;
const num = (value: unknown): number => (typeof value === 'number' ? value : 0);

export const toTitleRow = (row: Wire): TitleRow => {
  const category = row.category as Wire | null;
  return {
    id: str(row.id),
    title: str(row.title),
    subtitle: str(row.subtitle),
    authors: str(row.authors),
    isbn13: strOrNull(row.isbn13),
    isbn10: strOrNull(row.isbn10),
    category: category ? { id: str(category.id), name: str(category.name) } : null,
    materialType: str(row.material_type) as MaterialType,
    copiesTotal: num(row.copies_total),
    copiesAvailable: num(row.copies_available),
    status: str(row.status) as TitleStatus,
  };
};

export const toCopyRow = (row: Wire): CopyRow => {
  const title = (row.title ?? {}) as Wire;
  const location = row.location as Wire | null;
  return {
    id: str(row.id),
    accessionNumber: str(row.accession_number),
    barcode: strOrNull(row.barcode),
    title: { id: str(title.id), title: str(title.title), authors: str(title.authors) },
    location: location ? { id: str(location.id), code: str(location.code) } : null,
    locationText: str(row.location_text),
    status: str(row.status) as CopyStatus,
    isReference: row.is_reference === true,
    price: strOrNull(row.price),
    condition: str(row.condition) as CopyCondition,
    volumeLabel: str(row.volume_label),
  };
};

export const toTitleDetail = (row: Wire): TitleDetail => ({
  ...toTitleRow(row),
  publisher: str(row.publisher),
  edition: str(row.edition),
  year: typeof row.year === 'number' ? row.year : null,
  language: str(row.language),
  callNumber: str(row.call_number),
  keywords: str(row.keywords),
  notes: str(row.notes),
  copies: ((row.copies ?? []) as Wire[]).map(toCopyRow),
  version: num(row.version),
});

export const toCopyEvent = (row: Wire): CopyEvent => ({
  id: str(row.id),
  fromStatus: strOrNull(row.from_status) as CopyStatus | null,
  toStatus: str(row.to_status) as CopyStatus,
  reasonCode: str(row.reason_code),
  note: str(row.note),
  onDate: str(row.on_date),
  createdAt: str(row.created_at),
});

export const toCopyDetail = (row: Wire): CopyDetail => ({
  ...toCopyRow(row),
  acquiredOn: strOrNull(row.acquired_on),
  source: str(row.source) as CopySource,
  sourceNote: str(row.source_note),
  withdrawnOn: strOrNull(row.withdrawn_on),
  withdrawnReason: strOrNull(row.withdrawn_reason) as WithdrawReason | null,
  withdrawnNote: str(row.withdrawn_note),
  lastSeenOn: strOrNull(row.last_seen_on),
  issuedEver: row.issued_ever === true,
  events: ((row.events ?? []) as Wire[]).map(toCopyEvent),
  version: num(row.version),
});

export const toCategory = (row: Wire): LibraryCategory => ({
  id: str(row.id),
  name: str(row.name),
  parentId: strOrNull(row.parent_id),
  sortOrder: num(row.sort_order),
  isActive: row.is_active !== false,
  titleCount: num(row.title_count),
});

export const toLocation = (row: Wire): LibraryLocation => ({
  id: str(row.id),
  code: str(row.code),
  name: str(row.name),
  sortOrder: num(row.sort_order),
  isActive: row.is_active !== false,
  copyCount: num(row.copy_count),
});

const blankToNull = (value: string): string | null => (value.trim() === '' ? null : value.trim());

/** The title's own fields, as `POST`/`PATCH /library/titles` take them. */
export const toTitleBody = (values: TitleFormValues): Record<string, unknown> => ({
  title: values.title.trim(),
  subtitle: values.subtitle.trim(),
  authors: values.authors.trim(),
  isbn: values.isbn.trim(),
  publisher: values.publisher.trim(),
  edition: values.edition.trim(),
  year: values.year.trim() === '' ? null : Number(values.year),
  language: values.language.trim(),
  category_id: blankToNull(values.categoryId),
  material_type: values.materialType,
  call_number: values.callNumber.trim(),
  keywords: values.keywords.trim(),
  notes: values.notes.trim(),
});

/**
 * The `copies` object (FR-4). `numbers` is sent only when the merchant chose to
 * type them — an empty list would be read as "type zero numbers for N copies",
 * which the server refuses as a length mismatch.
 */
export const toCopiesBody = (values: CopiesFormValues): Record<string, unknown> => {
  const count = Number(values.count);
  return {
    count,
    ...(values.numbering === 'typed'
      ? { numbers: values.numbers.slice(0, count).map((n) => n.trim()) }
      : {}),
    location_id: blankToNull(values.locationId),
    price: blankToNull(values.price),
    acquired_on: blankToNull(values.acquiredOn),
    source: values.source,
    source_note: values.sourceNote.trim(),
    is_reference: values.isReference,
    volume_label: values.volumeLabel.trim(),
  };
};

/** The titles list's query (blank and default axes left out). */
export const titleListQuery = (filters: TitleFilters): Record<string, string> =>
  toLibraryQuery({
    q: filters.q,
    availability: filters.availability,
    materialType: filters.materialType,
    category: filters.category,
    status: filters.status,
    ordering: filters.ordering,
    page: filters.page === '1' ? '' : filters.page,
  });

export const copyListQuery = (filters: CopyFilters): Record<string, string> =>
  toLibraryQuery({
    q: filters.q,
    status: filters.status,
    location: filters.location,
    title: filters.title,
    priceMissing: filters.priceMissing,
    ordering: filters.ordering,
    page: filters.page === '1' ? '' : filters.page,
  });
