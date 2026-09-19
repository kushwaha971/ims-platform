'use client';

import { memo, type ReactNode } from 'react';

import { UbStack, UbText } from 'src/design-system';

/**
 * PLT-01 §7 / PLT-02 §7 — the title block every `(auth)` screen opens with.
 *
 * It was written out five times, once per screen, as the same `<div
 * className="flex flex-col gap-1"><h1 className="ds-h2 …"><p className="ds-body-sm
 * …">`. Five copies of a heading is five chances for one screen to ship an
 * `<h2>` where the others have an `<h1>`, which is exactly the kind of outline
 * break nobody notices without a screen reader.
 *
 * It is deliberately a FEATURE component, not a design-system one: it is the
 * auth group's screen furniture, and `UbPageHeader` already owns the
 * application shell's version of the same idea (§19.6.1). A component used by
 * one feature belongs to that feature (§19.2.2).
 *
 * The element is always `<h1>`: each of these screens is a page, and its title
 * is that page's first heading. `variant` changes the SIZE only — §23.2.2's
 * tiers are visual, and the no-token panel is smaller without ceasing to be the
 * heading of what the user is looking at.
 */
export interface AuthScreenHeadingProps {
  readonly title: string;
  readonly description?: ReactNode;
  /** Centred on the screens that also centre their language toggle. */
  readonly centered?: boolean;
  readonly variant?: 'h1' | 'h2' | 'h3';
}

function AuthScreenHeadingBase({
  title,
  description,
  centered = false,
  variant = 'h2',
}: Readonly<AuthScreenHeadingProps>) {
  return (
    <UbStack gap={1} className={centered ? 'text-center' : undefined}>
      <UbText as="h1" variant={variant}>
        {title}
      </UbText>
      {description !== undefined && description !== null && description !== false && (
        <UbText variant="body-sm" tone="tertiary">
          {description}
        </UbText>
      )}
    </UbStack>
  );
}

AuthScreenHeadingBase.displayName = 'AuthScreenHeading';
export const AuthScreenHeading = memo(AuthScreenHeadingBase);
