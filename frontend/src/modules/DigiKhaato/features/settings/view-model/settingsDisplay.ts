/**
 * PLT-06 — the reminder-template rules the editor shows while typing.
 *
 * The SERVER is the authority (`settings_schema.reminder_template_errors`);
 * this mirrors it so the merchant sees "Unknown placeholder {balanse}" under
 * the box instead of a 400 after Save. The two lists must match, and a test on
 * each side pins the same cases.
 */
export const REMINDER_PLACEHOLDERS = [
  'party_name',
  'business_name',
  'amount',
  'due_date',
  'upi_link',
] as const;
export type ReminderPlaceholder = (typeof REMINDER_PLACEHOLDERS)[number];

export const REMINDER_MAX_CHARS = 500;

export type TemplateProblem =
  | { readonly kind: 'tooLong' }
  | { readonly kind: 'unknown'; readonly name: string }
  | { readonly kind: 'doubleBraces' }
  | { readonly kind: 'missingAmount' };

const PLACEHOLDER = /\{([^{}]*)\}/g;

export const templateProblems = (text: string): readonly TemplateProblem[] => {
  const problems: TemplateProblem[] = [];
  if (text.length > REMINDER_MAX_CHARS) problems.push({ kind: 'tooLong' });
  const names = Array.from(text.matchAll(PLACEHOLDER), (match) => (match[1] ?? '').trim());
  for (const name of names) {
    if (!(REMINDER_PLACEHOLDERS as readonly string[]).includes(name)) {
      problems.push({ kind: 'unknown', name });
    }
  }
  if (text.includes('{{') || text.includes('}}')) problems.push({ kind: 'doubleBraces' });
  if (text.trim() && !names.includes('amount')) problems.push({ kind: 'missingAmount' });
  return problems;
};

/**
 * FR-5's live preview with sample values. Plain text substitution — the
 * preview is rendered as React text, which escapes it (§19), so a template
 * containing markup previews as the characters the customer will receive.
 */
export const renderTemplatePreview = (
  text: string,
  sample: Readonly<Record<ReminderPlaceholder, string>>
): string =>
  text.replace(PLACEHOLDER, (whole, raw: string) => {
    const name = raw.trim() as ReminderPlaceholder;
    return name in sample ? sample[name] : whole;
  });

/** Insert a placeholder at the caret (the chip buttons under the box). */
export const insertAt = (
  text: string,
  placeholder: ReminderPlaceholder,
  caret: number | null
): { readonly text: string; readonly caret: number } => {
  const token = `{${placeholder}}`;
  const at = caret === null || caret < 0 || caret > text.length ? text.length : caret;
  return { text: `${text.slice(0, at)}${token}${text.slice(at)}`, caret: at + token.length };
};
