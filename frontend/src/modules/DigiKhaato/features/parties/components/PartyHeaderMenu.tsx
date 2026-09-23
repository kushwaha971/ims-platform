'use client';

import { useCallback, useState } from 'react';

import { Archive, BookOpen, MoreHorizontal, Pencil } from 'lucide-react';

import { UbButton, UbDialog, UbStack } from 'src/design-system';
import type { TranslateFn } from 'src/hooks/useTranslation';

/**
 * PTY-03's khata page: the actions that are not the reason the page exists.
 *
 * ── Why these three moved off the row ──────────────────────────────────────
 * The header grew one action per feature — PTY-01's Edit, PTY-04's Archive,
 * LED-01's two ledger buttons, LED-02's opening balance — and at five it ran
 * off the right edge of a 360 px phone: the page became 275 px wider than the
 * screen, with two actions painted outside the viewport and reachable only by
 * scrolling the page sideways. Nothing failed, because `getByRole` finds a
 * button whether or not it is on the screen; a screenshot is what showed it,
 * and `e2e/ledger.mjs` now asserts the page's own `scrollWidth` at every size
 * so the next action to be added fails loudly instead.
 *
 * LED-02 FR-3 asked for exactly this and said so — "an **Add opening balance**
 * link in the party page header menu" — and there was no menu, so it went in
 * the row. The menu is the answer to both.
 *
 * ── Why the ledger's two actions stay OUT of it ────────────────────────────
 * "You gave" and "You got" are why a merchant opens a khata at a counter, and
 * the target is eight seconds from tap to saved. A menu costs a tap and a
 * decision on the one action that cannot afford either. Everything in here is
 * something done once a month or once in a party's life.
 *
 * ── One menu at every width ────────────────────────────────────────────────
 * Not "a menu below `md`". A layout that only exists on a phone is a layout
 * that is tested on a phone, and the row was already crowded at 768 px — five
 * actions fit there only because the words happen to be short in English.
 *
 * ── Why a sheet and not an anchored popover ────────────────────────────────
 * The first version used `UbPopover`, and the bundle gate refused it: +10.9 KB
 * on this route, because `@radix-ui/react-popover` is a whole positioning
 * engine and `/parties/[id]` had no other consumer of it. The bundle-budgets
 * file already records the same finding about the data grid's column menu,
 * which is `dynamic()` for exactly that reason — and a ⋯ button that waits for
 * a chunk before it can be pressed is worse than the bytes.
 *
 * `UbDialog` costs nothing extra here: `MLDialog` is hand-rolled on
 * `createPortal` with no Radix behind it, and this page already loads it for
 * the archive confirmation. And on the screen that actually had the problem it
 * is the better control — a sheet has full-width targets and cannot be
 * mispositioned near an edge, which is what phone apps use an overflow menu for
 * in the first place.
 */
export interface PartyHeaderMenuProps {
  readonly t: TranslateFn;
  readonly onEdit?: () => void;
  readonly onAddOpening?: () => void;
  readonly onArchive?: () => void;
}

export function PartyHeaderMenu({
  t,
  onEdit,
  onAddOpening,
  onArchive,
}: Readonly<PartyHeaderMenuProps>): React.JSX.Element | null {
  const [open, setOpen] = useState(false);

  /* Every item closes the menu before it acts, and the order matters: an item
     that opens a drawer while its own popover is still mounted leaves two
     overlays on screen, and Escape then closes the wrong one. */
  const run = useCallback((action?: () => void) => {
    setOpen(false);
    action?.();
  }, []);

  const items = [
    { key: 'edit', label: t('parties.detail.edit'), icon: Pencil, action: onEdit },
    { key: 'opening', label: t('ledger.opening.action'), icon: BookOpen, action: onAddOpening },
    { key: 'archive', label: t('parties.archive.action'), icon: Archive, action: onArchive },
  ].filter((item) => item.action !== undefined);

  /* Nothing to offer, no button. A ⋯ that opens an empty panel is worse than
     no ⋯ — it is a control that teaches a merchant the app is broken. This is
     the accountant's khata page, where every write is hidden (§19.7.5). */
  if (items.length === 0) return null;

  return (
    <>
      {/* "More" on screen, "More actions" to a screen reader. WCAG 2.5.3 asks
          that the accessible name CONTAIN the visible text, which it does — and
          a button announced as just "More" tells somebody navigating by control
          nothing about what it is more of. */}
      <UbButton
        variant="ghost"
        icon={<MoreHorizontal className="h-4 w-4" aria-hidden />}
        aria-label={t('parties.detail.moreActions')}
        onClick={() => setOpen(true)}
      >
        {t('parties.detail.more')}
      </UbButton>
      <UbDialog
        open={open}
        onOpenChange={setOpen}
        title={t('parties.detail.moreActions')}
        closeLabel={t('common.action.close')}
      >
        <UbStack gap={1}>
          {items.map((item) => (
            <UbButton
              key={item.key}
              variant="ghost"
              fullWidth
              className="justify-start"
              icon={<item.icon className="h-4 w-4" aria-hidden />}
              onClick={() => run(item.action)}
            >
              {item.label}
            </UbButton>
          ))}
        </UbStack>
      </UbDialog>
    </>
  );
}
