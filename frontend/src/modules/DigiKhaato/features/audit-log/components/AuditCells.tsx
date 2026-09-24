'use client';

import { memo } from 'react';

import { UbStack, UbStatusBadge, UbText } from 'src/design-system';

import type { DiffLine } from '../view-model/auditDisplay';

/**
 * PLT-08 §7 `AuditDiffCell` — up to three "field: before → after" lines in
 * caption type, and "+n more" for the rest. Pre-computed by the view-model so
 * a page of 25 rows does no JSON walking at render (§5: ≤ 16 ms a row).
 */
export const AuditDiffCell = memo(function AuditDiffCell({
  lines,
  moreLabel,
}: Readonly<{ lines: readonly DiffLine[]; moreLabel: string | null }>): React.JSX.Element {
  return (
    <UbStack gap={0.5} className="min-w-0">
      {lines.map((line) => (
        <UbText key={line.key} variant="caption" tone="secondary" className="break-words">
          {line.key}: {line.before} → {line.after}
        </UbText>
      ))}
      {moreLabel && (
        <UbText variant="caption" tone="tertiary">
          {moreLabel}
        </UbText>
      )}
    </UbStack>
  );
});

/** The "Who" cell: the name, and a quiet badge for a former member (EC-2). */
export const AuditActorCell = memo(function AuditActorCell({
  name,
  role,
  formerLabel,
}: Readonly<{ name: string; role: string | null; formerLabel: string | null }>): React.JSX.Element {
  return (
    <UbStack gap={0.5} className="min-w-0">
      <UbText variant="body" className="break-words">
        {name}
      </UbText>
      {role && (
        <UbText variant="caption" tone="tertiary">
          {role}
        </UbText>
      )}
      {formerLabel && <UbStatusBadge label={formerLabel} tone="neutral" />}
    </UbStack>
  );
});

export const AuditTextCell = memo(function AuditTextCell({
  text,
  sub,
}: Readonly<{ text: string; sub?: string | null }>): React.JSX.Element {
  return (
    <UbStack gap={0.5} className="min-w-0">
      <UbText variant="body" className="break-words">
        {text}
      </UbText>
      {sub && (
        <UbText variant="caption" tone="tertiary" className="break-words">
          {sub}
        </UbText>
      )}
    </UbStack>
  );
});
