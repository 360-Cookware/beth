import { htmlToText } from '../text/html.js';
import { visualPromotionFromPercent, type VisualPromotion } from '../pricing/promotions.js';
import {
  extractFromCare,
  extractFromDescription,
  extractFromIncludes,
  extractFromLegacyTabs,
  extractFromSpecTable,
  extractFromTags,
  extractFromTitle,
  extractSummary,
  type OtherSpec,
} from './extract.js';
import { mergeObservations, type LegacyDisagreement, type SpecConflict, type SpecField } from './merge.js';
import type { ShopifyProductInput } from './shopify-types.js';
import { SPEC_DEFINITIONS, type SpecKey } from './spec-schema.js';

const DIMENSION_KEYS: ReadonlySet<SpecKey> = new Set<SpecKey>([
  'rimDiameterIn',
  'cookingDiameterIn',
  'tabToTabDiameterIn',
  'insideHeightIn',
  'outsideHeightIn',
  'rimDimensionsIn',
  'cookingDimensionsIn',
  'capacityQt',
]);

export type ProductKind =
  | 'cookware'
  | 'bakeware'
  | 'set'
  | 'slow_cooker'
  | 'accessory'
  | 'cutting_board_or_utensil'
  | 'flatware'
  | 'part'
  | 'gift_card'
  | 'other';

export type ProductCondition = 'new' | 'factory_second' | 'refurbished' | 'preowned';

export interface BethVariant {
  id: string;
  legacyId: string;
  title: string;
  sku: string | null;
  priceCents: number;
  compareAtCents: number | null;
  availableForSale: boolean;
  options: { name: string; value: string }[];
}

export interface BethProduct {
  id: string;
  legacyId: string;
  handle: string;
  title: string;
  /** Canonical storefront URL (null when the product is not on the Online Store). */
  url: string | null;
  status: string;
  vendor: string;
  productType: string;
  kind: ProductKind;
  condition: ProductCondition;
  taxonomy: string | null;
  categories: string[];
  sizeClass: string | null;
  tags: string[];
  collections: string[];
  image: { url: string; alt: string | null; width: number | null; height: number | null } | null;
  /** Base prices in the shop currency (USD). Localized prices are resolved at request time. */
  currency: 'USD';
  minPriceCents: number;
  maxPriceCents: number;
  variants: BethVariant[];
  available: boolean;
  comingSoon: boolean;
  /** Purchasable with no stock on hand (inventory policy CONTINUE). Shipping timing is unknown to Beth. */
  preorder: boolean;
  recommendable: boolean;
  notRecommendableReasons: string[];
  rating: { average: number; count: number } | null;
  summary: string | null;
  includes: string[];
  careText: string | null;
  specs: Partial<Record<SpecKey, SpecField>>;
  otherSpecs: OtherSpec[];
  promotion: VisualPromotion | null;
  quality: {
    conflicts: SpecConflict[];
    legacyDisagreements: LegacyDisagreement[];
    missingExpectedSpecs: SpecKey[];
    hasSpecTable: boolean;
  };
  updatedAt: string;
}

export function toCents(amount: string | null | undefined): number | null {
  if (amount === null || amount === undefined || amount === '') return null;
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

const COOKWARE_TYPES = new Set([
  'fry pan',
  'saucepan',
  'sauté pan',
  'saute pan',
  'stock pot',
  'wok',
  'cookware',
  '360 cookware',
]);
const BAKEWARE_TYPES = new Set(['bakeware', '360 bakeware']);
const ACCESSORY_TYPES = new Set(['accessories', 'cleaner', 'cookbook', 'bowls', 'cooking accessories']);

export function classifyProduct(p: ShopifyProductInput): ProductKind {
  const type = p.productType.trim().toLowerCase();
  const title = p.title.toLowerCase();
  if (p.isGiftCard || type === 'gift card') return 'gift_card';
  if (type === 'flatware' || /liberty tabletop/i.test(p.vendor)) return 'flatware';
  if (type === 'cookware part' || /\bcover only\b|\breplacement\b/.test(title)) return 'part';
  if (/epicurean/i.test(p.vendor)) return 'cutting_board_or_utensil';
  if (type === 'slow cooker' || /slow cooker base/.test(title)) return 'slow_cooker';
  if (type === 'sets' || /\b(\d+|three|four|five|six|nine)[-\s]*piece\b.*\bset\b|\bset$/.test(title))
    return 'set';
  if (BAKEWARE_TYPES.has(type)) return 'bakeware';
  if (COOKWARE_TYPES.has(type)) return 'cookware';
  if (ACCESSORY_TYPES.has(type)) return 'accessory';
  if (/factory seconds?/.test(type)) {
    if (/pan|pot|skillet|wok|saucier|griddle/.test(title)) return 'cookware';
  }
  return 'other';
}

export function classifyCondition(p: ShopifyProductInput): ProductCondition {
  const s = `${p.title} ${p.productType}`.toLowerCase();
  if (/factory second/.test(s)) return 'factory_second';
  if (/pre-?owned/.test(s)) return 'preowned';
  if (/refurbished/.test(s)) return 'refurbished';
  return 'new';
}

function parseRating(value: string | null, count: string | null): { average: number; count: number } | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as { value?: string };
    const average = Number(parsed.value);
    const n = Number(count ?? '0');
    if (!Number.isFinite(average) || average <= 0) return null;
    return { average: Math.round(average * 10) / 10, count: Number.isFinite(n) ? n : 0 };
  } catch {
    return null;
  }
}

/** Specs a shopper reasonably expects for each kind; used for the data-quality report only. */
export const EXPECTED_SPECS: Partial<Record<ProductKind, SpecKey[]>> = {
  cookware: ['material', 'ovenSafeMaxF', 'inductionCompatible', 'madeIn', 'handleStyle'],
  bakeware: ['material', 'ovenSafeMaxF', 'madeIn'],
  set: ['material', 'ovenSafeMaxF', 'inductionCompatible', 'madeIn'],
  slow_cooker: ['temperatureRangeF'],
};

function sizeSpecPresent(specs: Partial<Record<SpecKey, SpecField>>): boolean {
  return Boolean(
    specs.capacityQt ||
    specs.nominalSizeIn ||
    specs.nominalDimensionsIn ||
    specs.cookingDiameterIn ||
    specs.cookingDimensionsIn ||
    specs.rimDiameterIn,
  );
}

export function normalizeProduct(p: ShopifyProductInput): BethProduct {
  const kind = classifyProduct(p);
  const condition = classifyCondition(p);
  const table = extractFromSpecTable(p.metafields.specTable);
  const tagFacts = extractFromTags(p.tags);
  const includes = extractFromIncludes(p.metafields.includes);
  const care = extractFromCare(p.metafields.care);
  // Sets list dimensions per component (e.g. a loaf pan and a jelly roll pan in one table).
  // Those rows describe the pieces, not the set, so they are kept for display only.
  if (kind === 'set') {
    const perPiece = table.observations.filter((o) => DIMENSION_KEYS.has(o.key));
    table.observations = table.observations.filter((o) => !DIMENSION_KEYS.has(o.key));
    for (const o of perPiece) {
      table.other.push({ label: SPEC_DEFINITIONS[o.key].label, value: o.raw, source: 'spec_table' });
    }
  }
  const description = extractFromDescription(p.descriptionHtml).filter(
    (o) => kind !== 'set' || !DIMENSION_KEYS.has(o.key),
  );
  const observations = [
    ...table.observations,
    ...description,
    ...extractFromTitle(p.title),
    ...includes.observations,
    ...care.observations,
    ...tagFacts.observations,
    ...extractFromLegacyTabs(p.metafields.ptabs),
  ];
  const merged = mergeObservations(observations);

  const variants: BethVariant[] = p.variants.map((v) => ({
    id: v.id,
    legacyId: v.legacyResourceId,
    title: v.title,
    sku: v.sku,
    priceCents: toCents(v.price) ?? 0,
    compareAtCents: toCents(v.compareAtPrice),
    availableForSale: v.availableForSale,
    options: v.selectedOptions,
  }));
  const prices = variants.map((v) => v.priceCents);
  const available = variants.some((v) => v.availableForSale);
  const comingSoon = p.tags.some((t) => /^coming[_\s-]?soon$/i.test(t.trim()));
  const onlineStore = Boolean(p.onlineStoreUrl);
  const preorder =
    available &&
    p.tracksInventory &&
    (p.totalInventory ?? 0) <= 0 &&
    p.variants.some((v) => v.availableForSale && v.inventoryPolicy === 'CONTINUE');

  const reasons: string[] = [];
  if (p.status !== 'ACTIVE') reasons.push(`status ${p.status}`);
  if (!onlineStore) reasons.push('not published to the Online Store');
  if (!available) reasons.push(comingSoon ? 'coming soon (not purchasable yet)' : 'not available for sale');
  else if (comingSoon) reasons.push('coming soon / pre-order (shown only when asked, always labeled)');
  if (kind === 'part') reasons.push('replacement part');
  if (kind === 'gift_card') reasons.push('gift card (only on request)');
  if (variants.length === 0) reasons.push('no variants');

  const expected = EXPECTED_SPECS[kind] ?? [];
  const missingExpectedSpecs = expected.filter(
    (k) => !merged.specs[k] || merged.specs[k]?.status !== 'verified',
  );
  if ((kind === 'cookware' || kind === 'bakeware') && !sizeSpecPresent(merged.specs)) {
    missingExpectedSpecs.push('capacityQt');
  }

  const image = p.featuredMedia?.preview?.image ?? null;
  const bfPercent = p.metafields.bf2026 ? Number(p.metafields.bf2026) : NaN;

  return {
    id: p.id,
    legacyId: p.legacyResourceId,
    handle: p.handle,
    title: p.title,
    url: p.onlineStoreUrl,
    status: p.status,
    vendor: p.vendor,
    productType: p.productType,
    kind,
    condition,
    taxonomy: p.category?.fullName ?? null,
    categories: tagFacts.categories,
    sizeClass: tagFacts.sizeClass,
    tags: p.tags,
    collections: p.collections,
    image: image ? { url: image.url, alt: image.altText, width: image.width, height: image.height } : null,
    currency: 'USD',
    minPriceCents: prices.length ? Math.min(...prices) : 0,
    maxPriceCents: prices.length ? Math.max(...prices) : 0,
    variants,
    available,
    comingSoon,
    preorder,
    recommendable: reasons.length === 0,
    notRecommendableReasons: reasons,
    rating: parseRating(p.metafields.rating, p.metafields.ratingCount),
    summary: extractSummary(p.metafields.shortDetails) ?? firstSentences(htmlToText(p.descriptionHtml), 2),
    includes: includes.items,
    careText: care.text,
    specs: merged.specs,
    otherSpecs: table.other,
    promotion:
      Number.isFinite(bfPercent) && bfPercent > 0 ? visualPromotionFromPercent('BF2026', bfPercent) : null,
    quality: {
      conflicts: merged.conflicts,
      legacyDisagreements: merged.legacyDisagreements,
      missingExpectedSpecs,
      hasSpecTable: table.observations.length + table.other.length > 0,
    },
    updatedAt: p.updatedAt,
  };
}

function firstSentences(text: string, n: number): string | null {
  const flat = text.replace(/\n+/g, ' ').trim();
  if (!flat) return null;
  const parts = flat.match(/[^.!?]+[.!?]+/g) ?? [flat];
  return parts.slice(0, n).join(' ').trim();
}

export interface CatalogIndex {
  products: BethProduct[];
  byHandle: Map<string, BethProduct>;
  byId: Map<string, BethProduct>;
}

export function buildCatalog(products: ShopifyProductInput[]): CatalogIndex {
  const normalized = products.map(normalizeProduct);
  return {
    products: normalized,
    byHandle: new Map(normalized.map((p) => [p.handle, p])),
    byId: new Map(normalized.map((p) => [p.id, p])),
  };
}
