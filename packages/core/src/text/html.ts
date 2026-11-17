/**
 * Minimal, dependency-free HTML helpers for Shopify rich-text content
 * (product descriptions, metafields, Recipe Kit JSON).
 *
 * These helpers only *read* merchant content. They never execute it and never
 * return HTML: everything that leaves this module is plain text, which keeps
 * catalog content inert when it is later shown to the language model (it is
 * treated as untrusted data, never as instructions).
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  deg: '°',
  reg: '®',
  trade: '™',
  copy: '©',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
  times: '×',
  eacute: 'é',
  egrave: 'è',
  ntilde: 'ñ',
  bull: '•',
  middot: '·',
  prime: '′',
  Prime: '″',
};

/** Decodes named, decimal and hexadecimal HTML entities. Unknown entities are left untouched. */
export function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, body: string) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body] ?? NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

/** Collapses runs of whitespace (including non-breaking spaces) into single spaces. */
export function collapseWhitespace(input: string): string {
  return input.replace(/[\s\u00a0]+/g, ' ').trim();
}

/**
 * Converts HTML into readable plain text. Block-level boundaries become line
 * breaks so callers can still split by line. Script/style contents are dropped.
 */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return '';
  let s = html;
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/(p|div|li|tr|h[1-6]|ul|ol|table|section|article)>/gi, '\n');
  s = s.replace(/<li[^>]*>/gi, '\n');
  s = s.replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  return s
    .split('\n')
    .map((line) => collapseWhitespace(line))
    .filter((line) => line.length > 0)
    .join('\n');
}

/** Plain text on a single line. */
export function htmlToInlineText(html: string | null | undefined): string {
  return collapseWhitespace(htmlToText(html).replace(/\n/g, ' '));
}

/** Extracts `<tr>` rows as arrays of cell text (`<td>`/`<th>`). */
export function parseTableRows(html: string | null | undefined): string[][] {
  if (!html) return [];
  const rows: string[][] = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let row: RegExpExecArray | null;
  while ((row = rowRe.exec(html)) !== null) {
    const cells: string[] = [];
    const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cell: RegExpExecArray | null;
    const rowHtml = row[1] ?? '';
    while ((cell = cellRe.exec(rowHtml)) !== null) {
      cells.push(htmlToInlineText(cell[1] ?? ''));
    }
    if (cells.some((c) => c.length > 0)) rows.push(cells);
  }
  return rows;
}

/**
 * Extracts list-like items from rich text: `<li>` items, or paragraphs/lines that
 * start with a bullet character ("•", "-", "*").
 */
export function parseListItems(html: string | null | undefined): string[] {
  if (!html) return [];
  const items: string[] = [];
  const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let li: RegExpExecArray | null;
  while ((li = liRe.exec(html)) !== null) {
    const text = htmlToInlineText(li[1] ?? '');
    if (text) items.push(text);
  }
  if (items.length > 0) return items;
  for (const line of htmlToText(html).split('\n')) {
    const m = /^[•\-*·]\s*(.+)$/.exec(line.trim());
    if (m?.[1]) items.push(collapseWhitespace(m[1]));
  }
  return items;
}

/** Extracts `href` values from anchors. */
export function extractHrefs(html: string | null | undefined): string[] {
  if (!html) return [];
  const out: string[] = [];
  const re = /<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[2]) out.push(decodeEntities(m[2]));
  }
  return out;
}

/** Extracts anchors as `{ href, text }`. */
export function extractAnchors(html: string | null | undefined): { href: string; text: string }[] {
  if (!html) return [];
  const out: { href: string; text: string }[] = [];
  const re = /<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    out.push({ href: decodeEntities(m[2] ?? ''), text: htmlToInlineText(m[3] ?? '') });
  }
  return out;
}

/** Normalizes text for loose comparisons: lowercase, ASCII-folded, punctuation removed. */
export function normalizeForMatch(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[“”″"]/g, ' in ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
