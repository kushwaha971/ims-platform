import { memo } from 'react';

/**
 * A still image in two formats: WebP for the browsers that take it, JPEG for
 * the rest. Pre-encoded files (a recording's poster, a film's thumbnail), so
 * it is a plain `<picture>` — `next/image` would route them through the image
 * optimiser to produce what is already on disk.
 *
 * `width` and `height` are required: they are what reserves the box before the
 * file arrives, which is the whole of this component's contribution to CLS.
 * `loading` defaults to `lazy`; pass `eager` only for an image in the first
 * screen.
 */
export interface UbPictureProps {
  readonly webp: string;
  readonly jpg: string;
  readonly width: number;
  readonly height: number;
  /** Empty when the image is decorative or described by the text beside it. */
  readonly alt: string;
  readonly loading?: 'lazy' | 'eager';
  readonly className?: string;
}

function UbPictureBase({
  webp,
  jpg,
  width,
  height,
  alt,
  loading = 'lazy',
  className,
}: Readonly<UbPictureProps>) {
  return (
    <picture>
      <source srcSet={webp} type="image/webp" />
      <img
        src={jpg}
        alt={alt}
        width={width}
        height={height}
        loading={loading}
        decoding="async"
        className={className}
      />
    </picture>
  );
}

UbPictureBase.displayName = 'UbPicture';
export const UbPicture = memo(UbPictureBase);
