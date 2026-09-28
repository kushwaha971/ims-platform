'use client';

import { memo } from 'react';

import { Check } from 'lucide-react';

import {
  UbButton,
  UbColorInput,
  UbPressable,
  UbStack,
  UbStatusBadge,
  UbText,
  UbTextInput,
} from 'src/design-system';
import type { UbFieldRenderProps } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { cn } from 'src/utils/cn';
import { contrastRatio, HEX_COLOUR, MIN_PRIMARY_CONTRAST } from 'src/utils/theme';

import { BRAND_SWATCHES } from '../constants/brandSwatches';

/**
 * WLB-01 §7 `ColourField` — swatches, the native picker and a hex box, with a
 * live contrast badge ("AA ✓ 4.9:1" / "Too light for buttons").
 *
 * The badge uses the SAME formula as the server (`src/utils/theme.ts`), so it
 * never says "fine" for a colour Save then refuses. When the server does refuse
 * (`low_contrast`), its suggested darker shade is offered with one button.
 */
export interface ColourFieldProps {
  readonly field: UbFieldRenderProps;
  readonly disabled: boolean;
  readonly suggestedHex: string | null;
}

function ColourFieldInner({
  field,
  disabled,
  suggestedHex,
}: Readonly<ColourFieldProps>): React.JSX.Element {
  const { t, n } = useTranslation();
  const value = String(field.value ?? '');
  const valid = HEX_COLOUR.test(value);
  const ratio = valid ? contrastRatio(value, '#FFFFFF') : null;
  const passes = ratio !== null && ratio >= MIN_PRIMARY_CONTRAST;

  return (
    <UbStack gap={2}>
      <UbStack direction="row" gap={2} wrap role="group" aria-label={t('branding.colour.swatches')}>
        {BRAND_SWATCHES.map((hex) => {
          const selected = value.toUpperCase() === hex;
          return (
            <UbPressable
              key={hex}
              selected={selected}
              disabled={disabled}
              onClick={() => field.onChange(hex)}
              aria-label={t('branding.colour.swatch', { hex })}
              className={cn(
                // 36 px swatches, 8 px apart: `.ub-hit`'s 4 px overhang a side makes each
                // a 44 px target that meets its neighbour's (R-A-3, Sprint 12).
                'ub-hit flex h-9 w-9 items-center justify-center rounded-control border border-border-subtle',
                selected && 'ring-2 ring-text-primary ring-offset-2'
              )}
              style={{ backgroundColor: hex }}
            >
              {selected ? <Check aria-hidden className="h-4 w-4 text-white" /> : null}
            </UbPressable>
          );
        })}
      </UbStack>
      <UbStack direction="row" gap={2} align="center">
        <UbColorInput
          value={value}
          onChange={field.onChange}
          label={t('branding.colour.picker')}
          disabled={disabled}
        />
        <UbTextInput
          id={field.id}
          name={field.name}
          value={value}
          onChange={field.onChange}
          onBlur={field.onBlur}
          uppercase
          maxLength={7}
          placeholder={field.placeholder}
          invalid={field.invalid}
          aria-invalid={field['aria-invalid']}
          aria-describedby={field['aria-describedby']}
          disabled={disabled}
          className="w-36 font-mono"
        />
        {ratio !== null && (
          <UbStatusBadge
            tone={passes ? 'success' : 'error'}
            label={
              passes
                ? t('branding.colour.contrastOk', { ratio: n(ratio, { maximumFractionDigits: 1 }) })
                : t('branding.colour.tooLight')
            }
          />
        )}
      </UbStack>
      {suggestedHex && (
        <UbStack direction="row" gap={2} align="center" wrap>
          <UbText variant="body-sm" tone="error">
            {t('branding.colour.lowContrast', { hex: suggestedHex })}
          </UbText>
          <UbButton
            variant="secondary"
            size="sm"
            onClick={() => field.onChange(suggestedHex)}
            disabled={disabled}
          >
            {t('branding.colour.useSuggestion')}
          </UbButton>
        </UbStack>
      )}
      <UbText variant="caption" tone="tertiary">
        {t('branding.colour.hint')}
      </UbText>
    </UbStack>
  );
}

export const ColourField = memo(ColourFieldInner);
