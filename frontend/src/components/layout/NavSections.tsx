'use client';

import { usePathname } from 'next/navigation';

import { UbBox, UbDivider, UbLink, UbStack, UbText } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { cn } from 'src/utils/cn';

import { useNavigation } from 'modules/DigiKhaato/features/navigation/useNavigation';

/**
 * The entitlement-driven navigation list, shared by the rail and the drawer.
 *
 * It was inlined in `UbSidebar`, which was fine while the rail was the only
 * navigation there was. It stopped being fine the moment a drawer needed the
 * same list: two copies of "which sections, which items, which one is current,
 * what does current look like" drift, and the accent-edge trick below is exactly
 * the sort of detail that gets copied once and then fixed in only one place.
 *
 * Both callers paint on `--surface-nav`, which stays dark in BOTH themes
 * (Zoho-style), which is why this uses the on-nav text tokens rather than
 * `--text-primary`.
 *
 * `onNavigate` exists for the drawer: a rail stays open when you follow a link,
 * a drawer must close. The rail passes nothing.
 */
export function NavSections({
  onNavigate,
}: Readonly<{ onNavigate?: () => void }>): React.JSX.Element {
  const pathname = usePathname();
  const { t } = useTranslation();
  const { sections } = useNavigation();

  return (
    <UbStack gap={5} as="div" className="min-h-0 flex-1">
      {sections.map((section, index) => (
        <UbStack key={section.key} gap={1}>
          {index > 0 && (
            <UbDivider decorative className="mb-3 border-surface-navHover opacity-80" />
          )}
          <UbText as="span" variant="label" tone="onNavMuted" className="px-2 pb-1">
            {t(section.labelId)}
          </UbText>
          {section.items.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

            const inner = (
              <>
                {/* The accent edge, outside the row's own box so the label does
                    not move when the row becomes current. */}
                {active && (
                  <UbBox
                    aria-hidden
                    className="absolute inset-y-2 left-0 w-0.5 rounded-pill bg-accent"
                  />
                )}
                <Icon aria-hidden className="h-4 w-4 shrink-0" />
                {t(item.labelId)}
              </>
            );

            const row =
              'relative flex min-h-11 items-center gap-3 rounded-control px-3 ' +
              'transition-colors duration-fast ease-standard';

            /**
             * An item whose page does not exist yet is NOT a link.
             *
             * `next/link` prefetches, and the sidebar renders on every app
             * route, so eight links pointing at unbuilt pages meant eight
             * `?_rsc=` requests on every screen, every one a 404, on the phone
             * connection this product is designed around. A merchant who
             * tapped one got a not-found page. Found while a browser journey
             * hung — the prefetch traffic never let the page settle.
             *
             * The row stays visible and keeps its icon and label, because it is
             * what tells a shopkeeper the product will eventually do stock and
             * invoices. It is marked `Soon` and is inert: no href, no prefetch,
             * `aria-disabled` so a screen reader does not offer it as a
             * destination.
             */
            if (!item.ready) {
              return (
                <UbBox
                  key={item.key}
                  aria-disabled
                  className={cn(row, 'cursor-default text-text-onNavMuted opacity-60')}
                >
                  <Icon aria-hidden className="h-4 w-4 shrink-0" />
                  <UbText as="span" variant="body-sm" tone="inherit">
                    {t(item.labelId)}
                  </UbText>
                  <UbText
                    as="span"
                    variant="micro"
                    tone="inherit"
                    className="ml-auto rounded-pill bg-surface-navHover px-1.5 py-0.5"
                  >
                    {t('nav.soon')}
                  </UbText>
                </UbBox>
              );
            }

            return (
              <UbLink
                key={item.key}
                href={item.href}
                variant="body-sm"
                tone="inherit"
                underline={false}
                aria-current={active ? 'page' : undefined}
                onClick={onNavigate}
                className={cn(
                  row,
                  active
                    ? 'bg-surface-navHover font-medium text-text-onNav'
                    : 'text-text-onNavMuted hover:bg-surface-navHover hover:text-text-onNav'
                )}
              >
                {inner}
              </UbLink>
            );
          })}
        </UbStack>
      ))}
    </UbStack>
  );
}
