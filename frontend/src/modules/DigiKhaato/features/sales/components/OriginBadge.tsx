'use client';

import { Link2 } from 'lucide-react';

import { UbLink, UbStack, UbText } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';

import { originHref } from '../originLinks';
import { originWords } from '../view-model/originDisplay';

import type { DocumentOrigin } from '../types/sales.types';
import 'src/i18n/catalogues/sales';

/**
 * A5 (FRD 00 PLT-X05 §7, §8) — "From Gym · Membership M-0042" on an invoice list row and on the
 * invoice page, for a document the document port issued. Linked to the module's own screen when
 * that module has registered a path (`originLinks.ts`), plain text otherwise. Provenance, not
 * state: a caption rather than a status pill, which would read as something to act on.
 */
export function OriginBadge({ origin }: Readonly<{ origin: DocumentOrigin }>): React.JSX.Element {
  const { t } = useTranslation();
  const words = originWords(origin);
  const text = t(words.id, {
    module: words.moduleId ? t(words.moduleId) : words.module,
    label: words.label ?? '',
  });
  const href = originHref(origin);
  return (
    <UbStack direction="row" gap={1} align="center" data-testid="origin-badge">
      <Link2 className="h-3.5 w-3.5 shrink-0 text-text-tertiary" aria-hidden />
      {href ? (
        <UbLink href={href} variant="caption">
          {text}
        </UbLink>
      ) : (
        <UbText variant="caption" tone="secondary">
          {text}
        </UbText>
      )}
    </UbStack>
  );
}
