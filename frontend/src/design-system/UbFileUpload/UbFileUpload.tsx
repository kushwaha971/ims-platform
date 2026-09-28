'use client';

import { useCallback, useId, type ReactNode } from 'react';

import { Upload } from 'lucide-react';

import { mlButtonClasses, type MLButtonVariant } from 'src/design-system/primitives';
import { cn } from 'src/utils/cn';

/**
 * Picking one file — a logo or a signature (WLB-01 §7, PLT-07 §7 `UbFileUpload`).
 *
 * A real `<input type="file">` inside a button-styled label, so the phone
 * offers camera AND gallery (PLT-07 §6) and the keyboard and screen reader get
 * the platform's own control. The component does NOT upload: it hands the
 * chosen `File` to `onSelect` and the feature decides when to send it.
 *
 * `accept` is a HINT to the picker, never a check — the server sniffs the
 * bytes (a renamed SVG is refused there). `maxBytes` refuses a 9 MB photo
 * before it is sent over 4G, with `onReject` telling the feature why.
 */
export interface UbFileUploadProps {
  readonly label: ReactNode;
  readonly onSelect: (file: File) => void;
  readonly onReject?: (reason: 'too_large' | 'wrong_type') => void;
  readonly accept?: string;
  readonly maxBytes?: number;
  readonly disabled?: boolean;
  readonly variant?: MLButtonVariant;
  readonly describedBy?: string;
  readonly className?: string;
}

export function UbFileUpload({
  label,
  onSelect,
  onReject,
  accept = 'image/png,image/jpeg,image/webp',
  maxBytes,
  disabled = false,
  variant = 'outlineNeutral',
  describedBy,
  className,
}: Readonly<UbFileUploadProps>): React.JSX.Element {
  const id = useId();

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      // Reset so choosing the SAME file again (after a refusal) fires again.
      event.target.value = '';
      if (!file) return;
      const allowed = accept.split(',').map((type) => type.trim());
      if (file.type && !allowed.includes(file.type)) {
        onReject?.('wrong_type');
        return;
      }
      if (maxBytes && file.size > maxBytes) {
        onReject?.('too_large');
        return;
      }
      onSelect(file);
    },
    [accept, maxBytes, onReject, onSelect]
  );

  return (
    <label
      htmlFor={id}
      aria-disabled={disabled || undefined}
      className={cn(
        mlButtonClasses(variant, 'md'),
        // The input is INSIDE the label so its focus reaches the visible box.
        'cursor-pointer focus-within:shadow-focus',
        disabled && 'pointer-events-none opacity-45',
        className
      )}
    >
      <input
        id={id}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={handleChange}
        disabled={disabled}
        aria-describedby={describedBy}
      />
      <Upload aria-hidden className="h-4 w-4" />
      {label}
    </label>
  );
}
