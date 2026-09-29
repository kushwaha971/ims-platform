type Translate = (id: string, values?: Record<string, string | number | Date>) => string;

/**
 * `t(id)`, or `null` when `id` has no copy loaded on this screen.
 *
 * react-intl answers a missing id with the id itself (`defaultMessage: id`), so
 * a catalogue key a vertical ships — `library.off.copiesOut`,
 * `gym.role.trainer`, `nav.module.lending` — prints as a raw message id on any
 * screen that has not loaded its catalogue. Callers use this to fall back to
 * plain words instead.
 */
export const loadedMessage = (
  t: Translate,
  id: string,
  values?: Record<string, string | number | Date>
): string | null => {
  if (!id) return null;
  const text = t(id, values);
  return text && text !== id ? text : null;
};
