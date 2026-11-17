import { htmlToInlineText, htmlToText, parseListItems, parseTableRows } from '../text/html.js';
import {
  parseDimensions,
  parseFahrenheit,
  parseFahrenheitRange,
  parseInches,
  parseInduction,
  parseMaterial,
  parseQuarts,
} from './parse-values.js';
import type { SpecKey, SpecSource, SpecValue } from './spec-schema.js';

export interface SpecObservation {
  key: SpecKey;
  value: SpecValue;
  /** The exact text the value was read from (for audits and "the product page says…" answers). */
  raw: string;
  source: SpecSource;
}

export interface OtherSpec {
  label: string;
  value: string;
  source: SpecSource;
}

export interface SpecTableResult {
  observations: SpecObservation[];
  /** Rows with labels that have no canonical mapping (kept for display, never inferred). */
  other: OtherSpec[];
}

type RowMapper = (value: string) => SpecObservation[];

function obs(key: SpecKey, value: SpecValue | null, raw: string, source: SpecSource): SpecObservation[] {
  return value === null || value === undefined ? [] : [{ key, value, raw, source }];
}

/** Maps spec-table labels (as they appear in accentuate.ingredients) to canonical specs. */
function specTableMappers(source: SpecSource): Record<string, RowMapper> {
  const inches = (key: SpecKey) => (v: string) => obs(key, parseInches(v) ?? numberOnly(v), v, source);
  const dims = (key: SpecKey) => (v: string) => obs(key, parseDimensions(v), v, source);
  const text = (key: SpecKey) => (v: string) => obs(key, v.trim() || null, v, source);
  return {
    'diameter (rim to rim)': inches('rimDiameterIn'),
    'diameter rim to rim': inches('rimDiameterIn'),
    'inside cooking diameter': inches('cookingDiameterIn'),
    'diameter (tab to tab)': inches('tabToTabDiameterIn'),
    'inside height': inches('insideHeightIn'),
    'height outside': inches('outsideHeightIn'),
    'dimensions (rim to rim)': dims('rimDimensionsIn'),
    'inside cooking dimensions': dims('cookingDimensionsIn'),
    gauge: text('gauge'),
    'cookware gauge': text('gauge'),
    'bakeware gauge': text('bakewareGauge'),
    construction: text('construction'),
    material: (v) => obs('material', parseMaterial(v), v, source),
    'oven safe': (v) => obs('ovenSafeMaxF', parseFahrenheit(v), v, source),
    'cooktop compatibility': (v) => [
      ...obs('cooktopCompatibility', v.trim() || null, v, source),
      ...obs('inductionCompatible', parseInduction(v), v, source),
    ],
    handle: text('handleStyle'),
    handles: text('handleStyle'),
    manufacturing: (v) => obs('madeIn', normalizeMadeIn(v), v, source),
    'product weight': text('weight'),
    weight: text('weight'),
    'temperature range': (v) => obs('temperatureRangeF', parseFahrenheitRange(v), v, source),
    'cooking settings': text('cookingSettings'),
    'outside base plate dimension': inches('basePlateOutsideIn'),
    'inside base plate dimension': inches('basePlateInsideIn'),
    'special feature': text('specialFeature'),
    design: text('designNote'),
    features: text('designNote'),
  };
}

function numberOnly(v: string): number | null {
  const m = /^\s*(\d*\.?\d+)\s*$/.exec(v);
  return m?.[1] ? Number(m[1]) : null;
}

/** "Handcrafted in the U.S.A" → "Handcrafted in the USA". Returns null when no country is stated. */
export function normalizeMadeIn(raw: string): string | null {
  const s = raw.replace(/\s+/g, ' ').trim();
  if (/u\.?\s?s\.?\s?a\.?|united states|america/i.test(s)) {
    return /handcraft/i.test(s) ? 'Handcrafted in the USA' : 'Made in the USA';
  }
  return null;
}

function labelKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[:\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parses the PDP spec table metafield (accentuate.ingredients). */
export function extractFromSpecTable(html: string | null | undefined): SpecTableResult {
  const result: SpecTableResult = { observations: [], other: [] };
  if (!html) return result;
  const mappers = specTableMappers('spec_table');
  for (const row of parseTableRows(html)) {
    const label = row[0] ?? '';
    const value = row.slice(1).join(' ').trim();
    if (!label || !value) continue;
    const mapper = mappers[labelKey(label)];
    if (mapper) {
      result.observations.push(...mapper(value));
    } else {
      result.other.push({ label: label.replace(/:\s*$/, '').trim(), value, source: 'spec_table' });
    }
  }
  return result;
}

/**
 * Extracts specs stated in the product description. Patterns are anchored to the
 * labels 360 Cookware uses ("Diameter Rim to Rim:", "Inside Cooking Diameter:",
 * "Oven Safe Up To 500 Degrees", "Induction Capable", "T-316 Surgical Grade…").
 * Free marketing prose is never interpreted beyond these explicit statements.
 */
export function extractFromDescription(html: string | null | undefined): SpecObservation[] {
  if (!html) return [];
  const text = htmlToText(html);
  const flat = text.replace(/\n/g, ' ');
  const out: SpecObservation[] = [];
  const src: SpecSource = 'description';
  const find = (re: RegExp) => re.exec(flat);

  const rim = find(/diameter\s*(?:\(\s*)?rim\s*to\s*rim\)?\s*[:-]?\s*([\d.\s/-]+\s*(?:"|”|″|in\b|inch))/i);
  if (rim?.[1]) out.push(...obs('rimDiameterIn', parseInches(rim[1]), rim[0], src));
  const rimAlt = find(/rim\s*diameter\s*[:-]\s*([\d.]+\s*(?:"|”|″))/i);
  if (rimAlt?.[1]) out.push(...obs('rimDiameterIn', parseInches(rimAlt[1]), rimAlt[0], src));

  const cooking = find(/inside\s*cooking\s*diameter\s*[:-]?\s*([\d.\s/-]+\s*(?:"|”|″|in\b|inch))/i);
  if (cooking?.[1]) out.push(...obs('cookingDiameterIn', parseInches(cooking[1]), cooking[0], src));
  // "Inside Diameter" (without "cooking") is not mapped: on stock pots it can describe the
  // rim opening rather than the cooking surface, and Beth must not conflate the two.

  const height = find(/inside\s*height\s*[:-]?\s*([\d.\s/-]+\s*(?:"|”|″|in\b|inch))/i);
  if (height?.[1]) out.push(...obs('insideHeightIn', parseInches(height[1]), height[0], src));

  const oven = find(/oven[\s-]*safe\s*(?:up\s*to|to)?\s*(\d{3})\s*(?:°|º|degrees?)?\s*(?:f\b|fahrenheit)?/i);
  if (oven?.[1]) out.push(...obs('ovenSafeMaxF', Number(oven[1]), oven[0], src));

  const induction = find(/\binduction\s*(?:capable|compatible|ready|safe)\b/i);
  if (induction) out.push(...obs('inductionCompatible', true, induction[0], src));
  const notInduction = find(/\bnot\s+(?:\w+\s+){0,3}induction\b|\binduction\b[^.]{0,20}\bnot\b/i);
  if (notInduction) out.push(...obs('inductionCompatible', false, notInduction[0], src));

  const material = find(/\bT[-\s]?(?:304|316)\b[^.\n]{0,60}?(?:stainless(?:\s+steel)?|surgical\s+grade)/i);
  if (material) out.push(...obs('material', parseMaterial(material[0]), material[0], src));

  const gauge = find(/(\.\d{2,3})\s*gauge/i);
  if (gauge?.[1]) out.push(...obs('gauge', gauge[1], gauge[0], src));

  const made = find(/handcrafted\s+in\s+the\s+u\.?\s?s\.?\s?a\.?|made\s+in\s+the\s+u\.?\s?s\.?\s?a\.?/i);
  if (made) out.push(...obs('madeIn', normalizeMadeIn(made[0]), made[0], src));

  const handle = find(/\b(stay[\s-]cool\s+(?:long\s+)?handles?)\b/i);
  if (handle?.[1]) out.push(...obs('handleStyle', titleCase(handle[1]), handle[0], src));

  const dishwasherSafe = find(/\bdishwasher[\s-]safe\b/i);
  if (dishwasherSafe) out.push(...obs('dishwasherRecommended', true, dishwasherSafe[0], src));

  return out;
}

function titleCase(s: string): string {
  return s.replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\s+/g, ' ');
}

/** Specs stated in the product title ("3.5 Quart Sauté Pan with Cover", "10 Inch Fry Pan", '9" x 13"'). */
export function extractFromTitle(title: string): SpecObservation[] {
  const out: SpecObservation[] = [];
  const src: SpecSource = 'title';
  const qt = parseQuarts(title);
  if (qt !== null) out.push(...obs('capacityQt', qt, title, src));
  const dims = /(\d+(?:\.\d+)?)\s*(?:"|”|″|in(?:ch)?)?\s*[x×]\s*(\d+(?:\.\d+)?)\s*(?:"|”|″|in(?:ch)?)?/i.exec(
    title,
  );
  if (dims?.[1] && dims[2]) {
    out.push(...obs('nominalDimensionsIn', { a: Number(dims[1]), b: Number(dims[2]) }, title, src));
  } else {
    const inch = /(\d+(?:\.\d+)?)\s*(?:-\s*)?(?:inch|in\.|"|”|″)/i.exec(title);
    if (inch?.[1]) out.push(...obs('nominalSizeIn', Number(inch[1]), title, src));
  }
  if (/\bwith\s+(?:cover|lid)\b/i.test(title)) out.push(...obs('coverIncluded', true, title, src));
  if (/\bwithout\s+(?:cover|lid)\b|\bcover\s+only\b/i.test(title)) {
    // "Cover Only" products *are* a cover; they do not include a pan. No coverIncluded statement.
  }
  return out;
}

export interface TagFacts {
  categories: string[];
  sizeClass: string | null;
  measure: string | null;
  observations: SpecObservation[];
}

/** Reads merchant-structured tags: Category_*, Size_*, Measure_* (and the "Mesure_" typo), induction tags. */
export function extractFromTags(tags: string[]): TagFacts {
  const facts: TagFacts = { categories: [], sizeClass: null, measure: null, observations: [] };
  for (const tag of tags) {
    const t = tag.trim();
    const cat = /^Category_(.+)$/i.exec(t);
    if (cat?.[1]) facts.categories.push(cat[1].trim());
    const size = /^Size_(.+)$/i.exec(t);
    if (size?.[1] && !facts.sizeClass) facts.sizeClass = size[1].trim();
    const measure = /^Mea?s?ure_(.+)$/i.exec(t);
    if (measure?.[1] && !facts.measure) facts.measure = measure[1].trim();
    if (/^induction (?:ready|capable|compatible)$/i.test(t)) {
      facts.observations.push({ key: 'inductionCompatible', value: true, raw: t, source: 'tags' });
    }
  }
  if (facts.measure) {
    const qt = parseQuarts(facts.measure);
    if (qt !== null)
      facts.observations.push({ key: 'capacityQt', value: qt, raw: facts.measure, source: 'tags' });
  }
  return facts;
}

export interface IncludesFacts {
  items: string[];
  observations: SpecObservation[];
}

/** Parses "What's included" (accentuate.includes). */
export function extractFromIncludes(html: string | null | undefined): IncludesFacts {
  const items = parseListItems(html).filter((i) => !/^your .* includes:?$/i.test(i));
  const observations: SpecObservation[] = [];
  const cover = items.find((i) => /\b(cover|lid)\b/i.test(i) && !/sold separately/i.test(i));
  if (cover) observations.push({ key: 'coverIncluded', value: true, raw: cover, source: 'includes' });
  return { items, observations };
}

/** Reads a JSON {en, es} metafield or a JSON array of HTML strings, returning English HTML. */
export function readLocalizedHtml(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return trimmed;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      const parts = parsed
        .map((p) => (typeof p === 'string' ? p : typeof p === 'object' && p && 'en' in p ? String(p.en) : ''))
        .filter((p) => p.trim().length > 0);
      return parts.length ? parts.join('\n') : null;
    }
    if (parsed && typeof parsed === 'object' && 'en' in parsed) {
      const en = (parsed as { en: unknown }).en;
      return typeof en === 'string' && en.trim() ? en : null;
    }
  } catch {
    return trimmed;
  }
  return null;
}

export interface CareFacts {
  text: string | null;
  observations: SpecObservation[];
}

/** Parses "Care & Product Guides" for dishwasher guidance. */
export function extractFromCare(value: string | null | undefined): CareFacts {
  const html = readLocalizedHtml(value);
  const text = html ? htmlToText(html) : null;
  const observations: SpecObservation[] = [];
  if (text) {
    const notRecommended =
      /\b(?:do not|don't|not)\s+recommend\s+(?:using\s+)?(?:the\s+)?dishwasher|\bnot\s+dishwasher[\s-]safe\b|\bhand[\s-]?wash(?:ing)?\s+only\b/i.exec(
        text,
      );
    if (notRecommended) {
      observations.push({
        key: 'dishwasherRecommended',
        value: false,
        raw: notRecommended[0],
        source: 'care_guide',
      });
    } else if (/\bdishwasher[\s-]safe\b/i.test(text)) {
      observations.push({
        key: 'dishwasherRecommended',
        value: true,
        raw: 'dishwasher safe',
        source: 'care_guide',
      });
    }
  }
  return { text: text || null, observations };
}

/**
 * Parses the legacy Product Tabs metafield (ptabs.tabs). This content is NOT
 * rendered by the live theme, so it is only used to flag stale data — never to
 * verify a value.
 */
export function extractFromLegacyTabs(html: string | null | undefined): SpecObservation[] {
  if (!html) return [];
  const items = parseListItems(html);
  const out: SpecObservation[] = [];
  const src: SpecSource = 'legacy_tabs';
  for (const item of items) {
    if (/\bT[-\s]?(?:304|316)\b/i.test(item))
      out.push({ key: 'material', value: parseMaterial(item), raw: item, source: src });
    if (/^dishwasher[\s-]safe$/i.test(item.trim()))
      out.push({ key: 'dishwasherRecommended', value: true, raw: item, source: src });
    if (/^induction\s+(?:capable|compatible|ready)$/i.test(item.trim()))
      out.push({ key: 'inductionCompatible', value: true, raw: item, source: src });
    const gauge = /^(\.\d{2,3})\s*gauge$/i.exec(item.trim());
    if (gauge?.[1]) out.push({ key: 'gauge', value: gauge[1], raw: item, source: src });
  }
  return out;
}

/** Short PDP intro copy (accentuate.short_details), as plain text. */
export function extractSummary(value: string | null | undefined): string | null {
  const html = readLocalizedHtml(value);
  const text = html ? htmlToText(html) : '';
  return text ? text.replace(/\n+/g, ' ') : null;
}

export { htmlToInlineText };
