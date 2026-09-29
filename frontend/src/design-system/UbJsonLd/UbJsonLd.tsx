/**
 * Structured data for search engines: one `<script type="application/ld+json">`
 * (CR-2026-09-29-PLATFORM-C).
 *
 * A design-system component because a raw `<script>` belongs here and not in a
 * route file, and because the one thing that is easy to get wrong about it —
 * the escaping — should be written once. It has no `'use client'` and no hooks:
 * render it from a SERVER component, so the markup is in the HTML a crawler
 * receives rather than added after hydration (Google does run scripts, most
 * link-preview bots and other engines do not).
 */
export interface UbJsonLdProps {
  /** A schema.org object — `{ '@context': 'https://schema.org', … }`. */
  readonly data: Readonly<Record<string, unknown>>;
  /** For tests and the e2e harness. */
  readonly 'data-testid'?: string;
}

/**
 * `JSON.stringify` for inside a `<script>`: a `<` in any string (an FAQ answer
 * that one day mentions `</script>`) would end the element early, so every one
 * is escaped, and so are `&` and `>` for the same parsers. U+2028/U+2029 are
 * valid JSON and a syntax error to older JavaScript parsers.
 */
// By code point: written literally, the two characters ARE line breaks to a
// JavaScript source parser, which is the very defect being escaped.
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

export const serializeJsonLd = (data: Readonly<Record<string, unknown>>): string =>
  JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replaceAll(LINE_SEPARATOR, '\\u2028')
    .replaceAll(PARAGRAPH_SEPARATOR, '\\u2029');

export function UbJsonLd({ data, 'data-testid': testId }: Readonly<UbJsonLdProps>): React.JSX.Element {
  return (
    <script
      type="application/ld+json"
      data-testid={testId}
      // The content is our own object, serialised and escaped above; nothing
      // in it is markup.
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}

UbJsonLd.displayName = 'UbJsonLd';
