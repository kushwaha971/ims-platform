'use client';

import { ImageOff } from 'lucide-react';

import { cn } from 'src/utils/cn';

/**
 * A stored image — the shop's logo or signature (WLB-01 §7, PLT-07 §7
 * `UbImagePreview`).
 *
 * A plain `<img>`, deliberately not `next/image`: the file is served by the
 * API behind the session cookie (`GET /files/{id}`, tenant-checked), which the
 * Next image optimiser cannot fetch on the merchant's behalf and must not
 * cache. The box is fixed so the page does not jump when the image arrives,
 * and a missing image shows an honest empty tile with `emptyLabel` rather than
 * the browser's broken-image glyph.
 *
 * EC-2 (WLB-01): a transparent logo sits on a white plate, so it stays legible
 * on a dark sidebar.
 */
export interface UbImagePreviewProps {
  readonly src: string | null;
  readonly alt: string;
  readonly emptyLabel: string;
  readonly size?: 'sm' | 'md' | 'lg';
  readonly className?: string;
}

const BOX: Readonly<Record<NonNullable<UbImagePreviewProps['size']>, string>> = {
  sm: 'h-10 w-10',
  md: 'h-20 w-32',
  lg: 'h-28 w-48',
};

export function UbImagePreview({
  src,
  alt,
  emptyLabel,
  size = 'md',
  className,
}: Readonly<UbImagePreviewProps>): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-control border border-border-subtle bg-white',
        BOX[size],
        className
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- authenticated API file, see above
        <img src={src} alt={alt} className="max-h-full max-w-full object-contain" />
      ) : (
        <span className="flex flex-col items-center gap-1 px-2 text-center text-text-tertiary">
          <ImageOff aria-hidden className="h-4 w-4" />
          <span className="ds-caption">{emptyLabel}</span>
        </span>
      )}
    </div>
  );
}
