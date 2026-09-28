/**
 * Handing the browser a file to save — the one way a page does that with a
 * name: an anchor made for the moment and clicked. Built imperatively because
 * it is never part of the rendered page. No React, no Redux.
 */
export const saveFile = (href: string, filename?: string): void => {
  const anchor = document.createElement('a');
  anchor.href = href;
  if (filename) anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
};

/** A file the page already holds (a fetched CSV), saved under the server's name. */
export const saveBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  saveFile(url, filename);
  // Revoked on the next tick: the click has already handed the URL over.
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};
