'use client';

import { UbCard, UbStack, UbText, type UbCardProps } from 'src/design-system';
import { cn } from 'src/utils/cn';

/** One compact content rhythm for Library records, including nested drawers. */
export function LibraryCard({
  title,
  description,
  action,
  children,
  padded = true,
  elevated = false,
  className,
  'data-testid': testId,
}: Readonly<UbCardProps & { 'data-testid'?: string }>): React.JSX.Element {
  return (
    <UbCard padded={false} elevated={elevated} className={cn(!elevated && 'shadow-1', className)}>
      <UbStack gap={padded ? 3 : 0} className={padded ? 'p-3' : undefined} data-testid={testId}>
        {(title || description || action) && (
          <UbStack
            direction="row"
            align="center"
            justify="between"
            gap={3}
            className={!padded ? 'p-3' : undefined}
          >
            <UbStack gap={1} className="min-w-0 flex-1">
              {title && (
                <UbText as="h2" variant="body-medium">
                  {title}
                </UbText>
              )}
              {description && (
                <UbText variant="caption" tone="secondary">
                  {description}
                </UbText>
              )}
            </UbStack>
            {action}
          </UbStack>
        )}
        {children}
      </UbStack>
    </UbCard>
  );
}

/** Compact metadata shared by Library book and copy records. */
export function LibraryFacts({
  items,
}: Readonly<{ items: readonly (readonly [string, string])[] }>): React.JSX.Element {
  return (
    <UbStack className="grid grid-cols-2 gap-x-4 gap-y-3">
      {items.map(([label, value]) => (
        <UbStack key={label} gap={1} className="min-w-0">
          <UbText variant="caption" tone="tertiary">
            {label}
          </UbText>
          <UbText variant="body-sm-medium" className="break-words">
            {value}
          </UbText>
        </UbStack>
      ))}
    </UbStack>
  );
}
