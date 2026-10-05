import type { UbAsyncComboboxPaging } from 'src/design-system';
import type { PagedSearchStatus } from 'src/hooks/usePagedSearch';
import type { TranslateFn } from 'src/hooks/useTranslation';

/**
 * A paged search's next-page row for `UbAsyncCombobox` (owner, 5 Oct 2026):
 * the same two words on every picker, so no caller spells them again.
 */
export const comboPaging = (
  search: {
    readonly hasMore: boolean;
    readonly status: PagedSearchStatus;
    readonly loadMore: () => void;
  },
  t: TranslateFn
): UbAsyncComboboxPaging => ({
  hasMore: search.hasMore,
  loadingMore: search.status === 'loadingMore',
  onLoadMore: search.loadMore,
  loadingMoreLabel: t('common.search.loadingMore'),
  showMoreLabel: t('common.search.showMore'),
});
