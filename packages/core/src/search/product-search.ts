import type { BethProduct, CatalogIndex, ProductCondition, ProductKind } from '../products/normalize.js';
import { BM25Index } from './bm25.js';

export interface ProductSearchFilters {
  kinds?: ProductKind[];
  maxPriceCents?: number;
  minPriceCents?: number;
  minCapacityQt?: number;
  maxCapacityQt?: number;
  /** Only products whose induction compatibility is *verified* true. */
  inductionCompatible?: boolean;
  /** Only products whose verified oven-safe temperature is at least this value. */
  minOvenSafeF?: number;
  coverIncluded?: boolean;
  /** Conditions to include. Defaults to ['new']. */
  conditions?: ProductCondition[];
  /** Include products that are not purchasable right now (e.g. coming soon). Default false. */
  includeUnavailable?: boolean;
  excludeHandles?: string[];
}

export interface ProductSearchResult {
  product: BethProduct;
  score: number;
  /** Why each filter matched, using verified specs only. */
  matched: string[];
}

function specNumber(p: BethProduct, key: 'capacityQt' | 'ovenSafeMaxF'): number | null {
  const f = p.specs[key];
  return f && f.status === 'verified' && typeof f.value === 'number' ? f.value : null;
}

function specBool(p: BethProduct, key: 'inductionCompatible' | 'coverIncluded'): boolean | null {
  const f = p.specs[key];
  return f && f.status === 'verified' && typeof f.value === 'boolean' ? f.value : null;
}

export class ProductSearch {
  private readonly index: BM25Index;

  constructor(private readonly catalog: CatalogIndex) {
    this.index = new BM25Index(
      catalog.products.map((p) => ({
        id: p.id,
        fields: [
          { text: p.title, weight: 4 },
          { text: p.productType, weight: 3 },
          { text: p.categories.join(' '), weight: 3 },
          {
            text: p.tags.filter((t) => !/^(Category|Size|Measure|Mesure|Collection)_/i.test(t)).join(' '),
            weight: 1,
          },
          { text: p.summary ?? '', weight: 1 },
          { text: p.includes.join(' '), weight: 1 },
        ],
      })),
    );
  }

  /** Applies filters strictly on *verified* data; unknown specs never pass a spec filter. */
  filter(p: BethProduct, f: ProductSearchFilters): { ok: boolean; matched: string[] } {
    const matched: string[] = [];
    const conditions = f.conditions ?? ['new'];
    if (!conditions.includes(p.condition)) return { ok: false, matched };
    if (!f.includeUnavailable && !p.recommendable) return { ok: false, matched };
    if (f.includeUnavailable && (p.status !== 'ACTIVE' || !p.url)) return { ok: false, matched };
    if (f.excludeHandles?.includes(p.handle)) return { ok: false, matched };
    if (f.kinds && !f.kinds.includes(p.kind)) return { ok: false, matched };
    if (f.maxPriceCents !== undefined) {
      if (p.minPriceCents > f.maxPriceCents) return { ok: false, matched };
      matched.push('price');
    }
    if (f.minPriceCents !== undefined && p.maxPriceCents < f.minPriceCents) return { ok: false, matched };
    if (f.minCapacityQt !== undefined || f.maxCapacityQt !== undefined) {
      const qt = specNumber(p, 'capacityQt');
      if (qt === null) return { ok: false, matched };
      if (f.minCapacityQt !== undefined && qt < f.minCapacityQt) return { ok: false, matched };
      if (f.maxCapacityQt !== undefined && qt > f.maxCapacityQt) return { ok: false, matched };
      matched.push('capacity');
    }
    if (f.inductionCompatible !== undefined) {
      if (specBool(p, 'inductionCompatible') !== f.inductionCompatible) return { ok: false, matched };
      matched.push('induction');
    }
    if (f.minOvenSafeF !== undefined) {
      const t = specNumber(p, 'ovenSafeMaxF');
      if (t === null || t < f.minOvenSafeF) return { ok: false, matched };
      matched.push('oven');
    }
    if (f.coverIncluded !== undefined) {
      if (specBool(p, 'coverIncluded') !== f.coverIncluded) return { ok: false, matched };
      matched.push('cover');
    }
    return { ok: true, matched };
  }

  search(query: string, filters: ProductSearchFilters = {}, limit = 10): ProductSearchResult[] {
    const results: ProductSearchResult[] = [];
    const ranked = query.trim() ? this.index.search(query, 200) : [];
    const scores = new Map(ranked.map((r) => [r.id, r.score]));
    const candidates = query.trim()
      ? ranked.map((r) => this.catalog.byId.get(r.id)).filter((p): p is BethProduct => Boolean(p))
      : this.catalog.products;
    for (const p of candidates) {
      const { ok, matched } = this.filter(p, filters);
      if (!ok) continue;
      // Light popularity prior from verified review counts (real Yotpo data), never dominant.
      const prior = p.rating ? Math.log10(1 + p.rating.count) * 0.15 : 0;
      results.push({ product: p, score: (scores.get(p.id) ?? 0) + prior, matched });
    }
    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}
