import type { Dimensions2D, MaterialValue, RangeValue } from './spec-schema.js';

/** Parses "2.5", ".110", "2-3/4", "2 3/4", "½" into a number. */
export function parseNumberish(raw: string): number | null {
  const s = raw.replace(/[½¼¾]/g, (c) => ({ '½': '.5', '¼': '.25', '¾': '.75' })[c] ?? c).trim();
  const mixed = /^(\d+)[\s-]+(\d+)\/(\d+)/.exec(s);
  if (mixed) {
    const whole = Number(mixed[1]);
    const num = Number(mixed[2]);
    const den = Number(mixed[3]);
    if (den > 0) return whole + num / den;
  }
  const frac = /^(\d+)\/(\d+)/.exec(s);
  if (frac && Number(frac[2]) > 0) return Number(frac[1]) / Number(frac[2]);
  const dec = /^(\d*\.?\d+)/.exec(s);
  if (dec?.[1]) {
    const n = Number(dec[1]);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const INCH_MARK = /(?:"|”|″|''|in\.?|inch(?:es)?)/i;

/** Parses an inch measurement such as `12.17"` or `10.5 inches`. Requires an inch marker. */
export function parseInches(raw: string): number | null {
  const m = new RegExp(`(\\d+(?:[\\s-]+\\d+\\/\\d+|\\.\\d+)?|\\.\\d+)\\s*${INCH_MARK.source}`, 'i').exec(raw);
  if (!m?.[1]) return null;
  return parseNumberish(m[1]);
}

/** Parses `13.87" x 10.02"` style dimensions. */
export function parseDimensions(raw: string): Dimensions2D | null {
  const m = /(\d*\.?\d+)\s*(?:"|”|″|in\.?)?\s*[x×]\s*(\d*\.?\d+)\s*(?:"|”|″|in\.?)?/i.exec(raw);
  if (!m?.[1] || !m[2]) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return { a, b };
}

/** Parses an oven-safe temperature in °F from text like "Up to 500°F" or "Oven Safe Up To 500 Degrees". */
export function parseFahrenheit(raw: string): number | null {
  const m = /(\d{3})\s*(?:°|º|degrees?)?\s*(?:f\b|fahrenheit)?/i.exec(raw);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  return n >= 100 && n <= 1000 ? n : null;
}

/** Parses "155-255 Degrees Fahrenheit". */
export function parseFahrenheitRange(raw: string): RangeValue | null {
  const m = /(\d{2,3})\s*(?:°|º)?\s*[-–to]+\s*(\d{2,3})/i.exec(raw);
  if (!m?.[1] || !m[2]) return null;
  return { min: Number(m[1]), max: Number(m[2]) };
}

/** Extracts stainless steel grades (T-304, T-316, 18/10…) from material text. */
export function parseMaterial(raw: string): MaterialValue {
  const grades = new Set<number>();
  for (const m of raw.matchAll(/\bT[-\s]?(304|316)\b/gi)) grades.add(Number(m[1]));
  for (const m of raw.matchAll(/\b(304|316)\s*(?:stainless|surgical)/gi)) grades.add(Number(m[1]));
  return { grades: [...grades].sort((a, b) => a - b), text: raw.trim() };
}

/** Parses a capacity in quarts from "3.5 Quart", "4 qt", "2.3 Quart". */
export function parseQuarts(raw: string): number | null {
  const m = /(\d*\.?\d+)\s*(?:-|\s)?(?:quart|qt)\b/i.exec(raw);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 && n < 50 ? n : null;
}

/**
 * Interprets cooktop compatibility text. Returns true/false only when the text
 * is explicit about induction; otherwise null (unknown).
 */
export function parseInduction(raw: string): boolean | null {
  const s = raw.toLowerCase();
  if (/\b(not|no|isn'?t|aren'?t|without)\b[^.]{0,30}\binduction\b/.test(s)) return false;
  if (/\binduction\b[^.]{0,30}\b(not|no)\b/.test(s)) return false;
  if (/\binduction\b/.test(s)) return true;
  return null;
}
