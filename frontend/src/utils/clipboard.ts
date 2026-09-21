/**
 * One copy-to-clipboard, because there will be more than one thing to copy — an
 * invitation link today, a share link and a UPI string later — and three
 * independent implementations of the same fallback is how one of them ends up
 * silently doing nothing.
 *
 * It returns a boolean rather than throwing. Every caller has to tell the user
 * whether the copy happened, and a `try/catch` per call site is how a caller
 * ends up saying "Copied" after a rejected permission prompt.
 *
 * `navigator.clipboard` is absent on an insecure origin and rejects when the
 * document is not focused, which is why the `execCommand` path is still here:
 * it is deprecated, it works, and the alternative is a merchant who cannot copy
 * a link that will never be shown again.
 */
export const copyText = async (value: string): Promise<boolean> => {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Fall through to the legacy path rather than reporting failure.
    }
  }

  if (typeof document === 'undefined') return false;

  try {
    const field = document.createElement('textarea');
    field.value = value;
    // Off-screen rather than hidden: a `display:none` element cannot be
    // selected, and an unselected one copies an empty string.
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.top = '-1000px';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(field);
    return ok;
  } catch {
    return false;
  }
};
