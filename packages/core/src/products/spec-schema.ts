/**
 * Canonical product specification schema.
 *
 * Every spec Beth may state to a customer has a canonical key, a value type and a
 * comparator. Values are *observed* in several Shopify sources; the merge step
 * (see merge.ts) decides whether a value is verified or in conflict.
 */

export type SpecKey =
  | 'capacityQt'
  | 'nominalSizeIn'
  | 'nominalDimensionsIn'
  | 'rimDiameterIn'
  | 'cookingDiameterIn'
  | 'tabToTabDiameterIn'
  | 'insideHeightIn'
  | 'outsideHeightIn'
  | 'rimDimensionsIn'
  | 'cookingDimensionsIn'
  | 'material'
  | 'gauge'
  | 'bakewareGauge'
  | 'construction'
  | 'ovenSafeMaxF'
  | 'cooktopCompatibility'
  | 'inductionCompatible'
  | 'handleStyle'
  | 'madeIn'
  | 'weight'
  | 'coverIncluded'
  | 'dishwasherRecommended'
  | 'temperatureRangeF'
  | 'cookingSettings'
  | 'basePlateOutsideIn'
  | 'basePlateInsideIn'
  | 'specialFeature'
  | 'designNote';

export interface Dimensions2D {
  a: number;
  b: number;
}

export interface MaterialValue {
  /** Stainless steel grades named by the source, e.g. [316] or [304, 316]. */
  grades: number[];
  text: string;
}

export interface RangeValue {
  min: number;
  max: number;
}

export type SpecValue = number | boolean | string | Dimensions2D | MaterialValue | RangeValue;

/**
 * Where an observation came from. Ordered by trust, highest first. All sources
 * except `legacy_tabs` are visible to shoppers on the live product page, so a
 * disagreement between them is a real customer-facing conflict.
 */
export type SpecSource =
  'spec_table' | 'description' | 'title' | 'includes' | 'care_guide' | 'tags' | 'legacy_tabs';

export const SOURCE_PRECEDENCE: readonly SpecSource[] = [
  'spec_table',
  'description',
  'title',
  'includes',
  'care_guide',
  'tags',
  'legacy_tabs',
];

/** Sources that are not shown to shoppers by the live theme. They never verify a value. */
export const NON_AUTHORITATIVE_SOURCES: ReadonlySet<SpecSource> = new Set(['legacy_tabs']);

export const SOURCE_LABELS: Record<SpecSource, string> = {
  spec_table: 'Product page spec table (accentuate.ingredients)',
  description: 'Product description',
  title: 'Product title',
  includes: "Product page 'What's included' (accentuate.includes)",
  care_guide: 'Product page care guide (CW360_faq.care__product_guides)',
  tags: 'Product tags',
  legacy_tabs: 'Legacy Product Tabs metafield (ptabs.tabs, not rendered)',
};

export interface SpecDefinition {
  key: SpecKey;
  label: string;
  kind: 'number' | 'boolean' | 'text' | 'dimensions' | 'material' | 'range';
  unit?: 'in' | 'qt' | '°F' | 'lb';
}

export const SPEC_DEFINITIONS: Record<SpecKey, SpecDefinition> = {
  capacityQt: { key: 'capacityQt', label: 'Capacity', kind: 'number', unit: 'qt' },
  nominalSizeIn: { key: 'nominalSizeIn', label: 'Size', kind: 'number', unit: 'in' },
  nominalDimensionsIn: { key: 'nominalDimensionsIn', label: 'Size', kind: 'dimensions', unit: 'in' },
  rimDiameterIn: { key: 'rimDiameterIn', label: 'Diameter (rim to rim)', kind: 'number', unit: 'in' },
  cookingDiameterIn: {
    key: 'cookingDiameterIn',
    label: 'Inside cooking diameter',
    kind: 'number',
    unit: 'in',
  },
  tabToTabDiameterIn: {
    key: 'tabToTabDiameterIn',
    label: 'Diameter (tab to tab)',
    kind: 'number',
    unit: 'in',
  },
  insideHeightIn: { key: 'insideHeightIn', label: 'Inside height', kind: 'number', unit: 'in' },
  outsideHeightIn: { key: 'outsideHeightIn', label: 'Outside height', kind: 'number', unit: 'in' },
  rimDimensionsIn: {
    key: 'rimDimensionsIn',
    label: 'Dimensions (rim to rim)',
    kind: 'dimensions',
    unit: 'in',
  },
  cookingDimensionsIn: {
    key: 'cookingDimensionsIn',
    label: 'Inside cooking dimensions',
    kind: 'dimensions',
    unit: 'in',
  },
  material: { key: 'material', label: 'Material', kind: 'material' },
  gauge: { key: 'gauge', label: 'Gauge', kind: 'text' },
  bakewareGauge: { key: 'bakewareGauge', label: 'Bakeware gauge', kind: 'text' },
  construction: { key: 'construction', label: 'Construction', kind: 'text' },
  ovenSafeMaxF: { key: 'ovenSafeMaxF', label: 'Oven safe up to', kind: 'number', unit: '°F' },
  cooktopCompatibility: { key: 'cooktopCompatibility', label: 'Cooktop compatibility', kind: 'text' },
  inductionCompatible: { key: 'inductionCompatible', label: 'Induction compatible', kind: 'boolean' },
  handleStyle: { key: 'handleStyle', label: 'Handle', kind: 'text' },
  madeIn: { key: 'madeIn', label: 'Made in', kind: 'text' },
  weight: { key: 'weight', label: 'Weight', kind: 'text' },
  coverIncluded: { key: 'coverIncluded', label: 'Cover included', kind: 'boolean' },
  dishwasherRecommended: {
    key: 'dishwasherRecommended',
    label: 'Dishwasher recommended',
    kind: 'boolean',
  },
  temperatureRangeF: { key: 'temperatureRangeF', label: 'Temperature range', kind: 'range', unit: '°F' },
  cookingSettings: { key: 'cookingSettings', label: 'Cooking settings', kind: 'text' },
  basePlateOutsideIn: {
    key: 'basePlateOutsideIn',
    label: 'Base plate (outside)',
    kind: 'number',
    unit: 'in',
  },
  basePlateInsideIn: { key: 'basePlateInsideIn', label: 'Base plate (inside)', kind: 'number', unit: 'in' },
  specialFeature: { key: 'specialFeature', label: 'Special feature', kind: 'text' },
  designNote: { key: 'designNote', label: 'Design', kind: 'text' },
};

const NUMBER_TOLERANCE = 0.02;

function normText(v: string): string {
  return v
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function handleTokens(v: string): Set<string> {
  return new Set(
    normText(v)
      .split(' ')
      .filter(Boolean)
      .map((t) => (t === 'handles' ? 'handle' : t)),
  );
}

/** Returns true when two observations of the same spec agree. */
export function specValuesAgree(key: SpecKey, a: SpecValue, b: SpecValue): boolean {
  const def = SPEC_DEFINITIONS[key];
  if (key === 'handleStyle' && typeof a === 'string' && typeof b === 'string') {
    // "Stay Cool Handle" does not contradict "Stay Cool Long Handle": one is less specific.
    const ta = handleTokens(a);
    const tb = handleTokens(b);
    const [small, large] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
    return [...small].every((t) => large.has(t));
  }
  switch (def.kind) {
    case 'number':
      return typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= NUMBER_TOLERANCE;
    case 'boolean':
      return a === b;
    case 'dimensions': {
      if (typeof a !== 'object' || typeof b !== 'object' || !('a' in a) || !('a' in b)) return false;
      const x = [a.a, a.b].sort((m, n) => m - n);
      const y = [b.a, b.b].sort((m, n) => m - n);
      return Math.abs(x[0]! - y[0]!) <= NUMBER_TOLERANCE && Math.abs(x[1]! - y[1]!) <= NUMBER_TOLERANCE;
    }
    case 'material': {
      if (typeof a !== 'object' || typeof b !== 'object' || !('grades' in a) || !('grades' in b))
        return false;
      // Sources that name no grade ("surgical grade stainless steel") do not contradict a named grade.
      if (a.grades.length === 0 || b.grades.length === 0) return true;
      const ga = [...a.grades].sort().join(',');
      const gb = [...b.grades].sort().join(',');
      return ga === gb;
    }
    case 'range':
      return (
        typeof a === 'object' &&
        typeof b === 'object' &&
        'min' in a &&
        'min' in b &&
        a.min === b.min &&
        a.max === b.max
      );
    case 'text':
    default:
      return typeof a === 'string' && typeof b === 'string' && normText(a) === normText(b);
  }
}

/** Human-readable display for a spec value. */
export function formatSpecValue(key: SpecKey, value: SpecValue): string {
  const def = SPEC_DEFINITIONS[key];
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') {
    const n = Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
    if (def.unit === 'in') return `${n}″`;
    if (def.unit === 'qt') return `${n} qt`;
    if (def.unit === '°F') return `${n}°F`;
    return n;
  }
  if (typeof value === 'string') return value;
  if ('grades' in value) return value.text;
  if ('a' in value) return `${value.a}″ × ${value.b}″`;
  if ('min' in value) return `${value.min}–${value.max}°F`;
  return String(value);
}
