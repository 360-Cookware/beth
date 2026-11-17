/**
 * Controlled, read-only tools over the knowledge engines (architecture §5).
 * Every value they return comes from the verified snapshot. They change nothing.
 */
import {
  SPEC_DEFINITIONS,
  type BethProduct,
  type BethRecipe,
  type CatalogIndex,
  type ProductSearch,
  type ProductSearchFilters,
  type RecipeLibrary,
  type RecipeSearch,
  type SpecKey,
} from '@beth/core';
import type { ComparisonColumn, ComparisonRow, ProductCard, RecipeCard } from './blocks.js';

export interface KnowledgeView {
  catalog: CatalogIndex;
  library: RecipeLibrary;
  productSearch: ProductSearch;
  recipeSearch: RecipeSearch;
}

/** Spec keys shown on cards and in comparisons, in display order. */
const HIGHLIGHT_KEYS: SpecKey[] = [
  'capacityQt',
  'nominalSizeIn',
  'rimDiameterIn',
  'nominalDimensionsIn',
  'material',
  'inductionCompatible',
  'ovenSafeMaxF',
  'coverIncluded',
  'madeIn',
];

const COMPARISON_KEYS: SpecKey[] = [
  'capacityQt',
  'nominalSizeIn',
  'rimDiameterIn',
  'cookingDiameterIn',
  'insideHeightIn',
  'material',
  'gauge',
  'construction',
  'inductionCompatible',
  'ovenSafeMaxF',
  'coverIncluded',
  'handleStyle',
  'madeIn',
  'weight',
];

/** Display string for a verified spec, or null if unknown or in conflict. */
export function verifiedSpec(p: BethProduct, key: SpecKey): string | null {
  const field = p.specs[key];
  if (!field || field.status !== 'verified' || field.display == null) return null;
  return field.display;
}

export function productCard(p: BethProduct, label?: string): ProductCard {
  const highlights: string[] = [];
  for (const key of HIGHLIGHT_KEYS) {
    const value = verifiedSpec(p, key);
    if (value) highlights.push(`${SPEC_DEFINITIONS[key].label}: ${value}`);
    if (highlights.length >= 4) break;
  }
  return {
    handle: p.handle,
    title: p.title,
    url: p.url ?? `https://www.360cookware.com/products/${p.handle}`,
    image: p.image ? { url: p.image.url, alt: p.image.alt } : null,
    priceCents: p.minPriceCents,
    maxPriceCents: p.maxPriceCents,
    currency: p.currency,
    rating: p.rating,
    highlights,
    variants: p.variants.map((v) => ({ id: v.legacyId, title: v.title, available: v.availableForSale })),
    available: p.available,
    ...(label ? { label } : {}),
  };
}

export function searchProducts(
  k: KnowledgeView,
  query: string,
  filters: ProductSearchFilters = {},
  limit = 3,
): BethProduct[] {
  return k.productSearch.search(query, filters, limit).map((r) => r.product);
}

export function getProduct(k: KnowledgeView, handle: string): BethProduct | null {
  return k.catalog.byHandle.get(handle) ?? null;
}

/** Aligned comparison. Only attributes stated for at least one product are kept. */
export function compareProducts(
  k: KnowledgeView,
  handles: string[],
): { columns: ComparisonColumn[]; rows: ComparisonRow[] } | null {
  const products = handles
    .map((h) => getProduct(k, h))
    .filter((p): p is BethProduct => Boolean(p))
    .slice(0, 3);
  if (products.length < 2) return null;
  const columns = products.map((p) => ({ handle: p.handle, title: p.title, url: p.url ?? '' }));
  const rows: ComparisonRow[] = [{ label: 'Price', values: products.map((p) => formatUsd(p.minPriceCents)) }];
  for (const key of COMPARISON_KEYS) {
    const values = products.map((p) => verifiedSpec(p, key));
    if (values.some((v) => v !== null)) rows.push({ label: SPEC_DEFINITIONS[key].label, values });
  }
  const ratings = products.map((p) =>
    p.rating ? `${p.rating.average.toFixed(1)} ★ (${p.rating.count})` : null,
  );
  if (ratings.some((r) => r !== null)) rows.push({ label: 'Rating', values: ratings });
  return { columns, rows };
}

export function recipeCard(k: KnowledgeView, r: BethRecipe): RecipeCard {
  const products = r.productLinks
    .filter((l) => l.status === 'active' && l.productId)
    .map((l) => k.catalog.byId.get(l.productId!))
    .filter((p): p is BethProduct => Boolean(p))
    .map((p) => ({ handle: p.handle, title: p.title, url: p.url ?? '' }));
  return {
    handle: r.handle,
    title: r.title,
    url: r.url,
    image: r.image,
    totalMinutes: r.totalMinutes,
    servings: r.servings,
    products: dedupeBy(products, (p) => p.handle),
  };
}

export function searchRecipes(k: KnowledgeView, query: string, productId?: string, limit = 3): BethRecipe[] {
  return k.recipeSearch
    .search(query, { limit, ...(productId ? { productId } : {}) })
    .filter((r) => r.published);
}

export interface CartActionOk {
  ok: true;
  /** Numeric variant ID for /cart/add.js. */
  variantId: string;
  quantity: number;
  handle: string;
  title: string;
}

export interface CartActionError {
  ok: false;
  reason: 'unknown_product' | 'not_recommendable' | 'unknown_variant' | 'unavailable' | 'bad_quantity';
}

/**
 * Validates an add-to-cart request. It changes nothing: the shopper's browser performs the
 * add through the Ajax Cart API after an explicit tap, and reports success only on Shopify's 200.
 */
export function prepareCartAction(
  k: KnowledgeView,
  handle: string,
  variantId: string | null,
  quantity: number,
): CartActionOk | CartActionError {
  const p = getProduct(k, handle);
  if (!p) return { ok: false, reason: 'unknown_product' };
  if (!p.recommendable) return { ok: false, reason: 'not_recommendable' };
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10)
    return { ok: false, reason: 'bad_quantity' };
  const variant = variantId
    ? p.variants.find((v) => v.legacyId === variantId || v.id === variantId)
    : p.variants.length === 1
      ? p.variants[0]
      : undefined;
  if (!variant) return { ok: false, reason: 'unknown_variant' };
  if (!variant.availableForSale) return { ok: false, reason: 'unavailable' };
  return { ok: true, variantId: variant.legacyId, quantity, handle: p.handle, title: p.title };
}

export function formatUsd(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function dedupeBy<T>(items: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(key(i)) ? false : (seen.add(key(i)), true)));
}
