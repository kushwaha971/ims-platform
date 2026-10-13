/**
 * F03 (LIB-02 §9) — the ISBN check digit, so a mistyped ISBN is caught in the
 * drawer rather than by a 400 after Save. ISBN-10 is mod 11 (`X` = 10) and
 * ISBN-13 is the EAN mod-10 with a 978/979 prefix; spaces and hyphens are
 * stripped first. Fifteen lines, so written rather than imported (ADR-021).
 * The server is the authority and normalises to ISBN-13 itself.
 */
export const normaliseIsbn = (raw: string): string => raw.replace(/[\s-]/g, '').toUpperCase();

/** The statutory layout, before there is a check digit to validate (QA B15). */
export const isIsbnShape = (raw: string): boolean =>
  /^(?:\d{9}[\dX]|97[89]\d{10})$/.test(normaliseIsbn(raw));

export const isValidIsbn = (raw: string): boolean => {
  const value = normaliseIsbn(raw);
  if (!isIsbnShape(value)) return false;
  if (value.length === 10) {
    const sum = [...value].reduce(
      (acc, ch, i) => acc + (ch === 'X' ? 10 : Number(ch)) * (10 - i),
      0
    );
    return sum % 11 === 0;
  }
  const sum = [...value].reduce((acc, ch, i) => acc + Number(ch) * (i % 2 === 0 ? 1 : 3), 0);
  return sum % 10 === 0;
};

/** Does a search term look like an ISBN at all (FR-3's "searches first")? */
export const looksLikeIsbn = (raw: string): boolean => /^[\d\s-]{9,17}[\dXx]$/.test(raw.trim());
