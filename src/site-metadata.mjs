// Adapted from trytotapeout/TapeBrowser@5f1d82c, GPL-3.0-or-later. See UPSTREAM.md.
export const IMAGE_FILES={logo:['logo.png','logo.jpg'],cover:['cover.png','cover.jpg']};
export const IMAGE_MAX_BYTES=50*1024;
export const MANIFEST_PATH='deweb.json';
export function extractTitle(bytes) {
  const head = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, 64 * 1024));
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head);
  if (!m) return '';
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return m[1]
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => {
      if (e[0] === '#') {
        const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
      }
      return named[e.toLowerCase()] ?? all;
    })
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}
