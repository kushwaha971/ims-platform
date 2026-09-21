/**
 * The page numbers a pagination bar shows, with `null` where it elides.
 *
 * Ported from BrandHub's `buildPageRange` (`BrandHubDataGrid/…`), which is the
 * shape a designer signed off on: first page, last page, the current page and
 * one either side, and an ellipsis wherever a run was skipped. Seven or fewer
 * pages show every number, because eliding two of six is churn.
 *
 * `null` rather than the string `'…'` that BrandHub uses: the ellipsis is
 * presentation, and a component that receives a sentinel string has to know it
 * is a sentinel. A caller mapping over this cannot mistake `null` for a page.
 *
 * Both arguments are 1-BASED, unlike BrandHub's 0-based `pageIndex`, because
 * every other page number in this product is 1-based and one file translating
 * between the two is one file where an off-by-one can hide.
 */
export const buildPageRange = (
  current: number,
  total: number
): readonly (number | null)[] => {
  const pages = Math.max(1, Math.trunc(total));
  const page = Math.min(Math.max(1, Math.trunc(current)), pages);

  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1);

  const range: (number | null)[] = [1];
  if (page > 3) range.push(null);
  for (let n = Math.max(2, page - 1); n <= Math.min(pages - 1, page + 1); n += 1) {
    range.push(n);
  }
  if (page < pages - 2) range.push(null);
  range.push(pages);
  return range;
};
