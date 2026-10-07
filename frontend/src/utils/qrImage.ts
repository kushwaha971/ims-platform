/**
 * Shop P0 — a QR's module matrix as a PNG, so a phone can share the picture itself
 * (WhatsApp takes an image from the share sheet; a prefilled message cannot carry one).
 * Black on white with the standard four-module quiet zone, whatever the theme:
 * scanners are not themed. Null where the browser has no canvas (tests, old WebViews).
 */
export const qrPngBlob = (modules: readonly string[], scale = 10): Promise<Blob | null> => {
  const quiet = 4;
  const count = modules.length + quiet * 2;
  if (typeof document === 'undefined' || modules.length === 0) return Promise.resolve(null);
  const canvas = document.createElement('canvas');
  canvas.width = count * scale;
  canvas.height = count * scale;
  const context = canvas.getContext('2d');
  if (!context) return Promise.resolve(null);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#000000';
  modules.forEach((row, r) => {
    for (let c = 0; c < row.length; c += 1) {
      if (row[c] === '1') context.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
    }
  });
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
};
