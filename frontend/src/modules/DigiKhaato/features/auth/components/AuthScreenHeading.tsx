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
 *
 * ── CR-2026-09-19-D: two parts, and the second one is quieter ───────────────
 * All three references split the heading in two — Zoho's "Sign in" over a
 * lighter "to access Books", Notion's value proposition over its action. The
 * screens used to set one line at `ds-h2` and a second, unrelated sentence
 * under it at the same weight as a field hint. The block below makes the split
 * structural: `title` is the action, `description` is the quieter half of the
 * same sentence, and it is `--text-tertiary` at `ds-body` rather than caption,
 * because it is a sentence to read and not a note to skip.
 *
 * Centred is now the DEFAULT. The column and the mark above it are centred; a
 * left-aligned heading between two centred things is the kind of half-decision
 * that makes a page look assembled rather than designed.
 */
export interface AuthScreenHeadingProps {
  readonly title: string;
  readonly description?: ReactNode;
  /** Left-align on the wide screens whose content is not centred (the wizard). */
  readonly align?: 'center' | 'start';
  readonly variant?: 'h1' | 'h2' | 'h3';
}

function AuthScreenHeadingBase({
  title,
  description,
  align = 'center',
  variant = 'h2',
}: Readonly<AuthScreenHeadingProps>) {
  return (
    <UbStack gap={2} align={align === 'center' ? 'center' : 'start'}>
      <UbText as="h1" variant={variant} align={align}>
        {title}
      </UbText>
      {description !== undefined && description !== null && description !== false && (
        <UbText variant="body" tone="tertiary" align={align} className="max-w-prose text-balance">
          {description}
        </UbText>
      )}
    </UbStack>
  );
}

AuthScreenHeadingBase.displayName = 'AuthScreenHeading';
export const AuthScreenHeading = memo(AuthScreenHeadingBase);
