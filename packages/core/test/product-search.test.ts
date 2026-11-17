import { describe, expect, it } from 'vitest';
import { buildCatalog } from '../src/products/normalize.js';
import { ProductSearch } from '../src/search/product-search.js';
import { loadCatalogFixture } from './fixtures.js';

const catalog = buildCatalog(loadCatalogFixture());
const search = new ProductSearch(catalog);

describe('product search', () => {
  it('only returns recommendable, new-condition products by default', () => {
    const results = search.search('fry pan', {}, 50);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.product.recommendable).toBe(true);
      expect(r.product.condition).toBe('new');
    }
  });

  it('filters on verified specs only (induction + cover + capacity)', () => {
    const results = search.search(
      '',
      { inductionCompatible: true, coverIncluded: true, minCapacityQt: 3 },
      50,
    );
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.product.specs.inductionCompatible?.status).toBe('verified');
      expect(r.product.specs.coverIncluded?.value).toBe(true);
      expect((r.product.specs.capacityQt?.value as number) >= 3).toBe(true);
    }
  });

  it('respects a budget', () => {
    const results = search.search('sauté pan', { maxPriceCents: 30000 }, 20);
    for (const r of results) expect(r.product.minPriceCents).toBeLessThanOrEqual(30000);
    expect(results.map((r) => r.product.handle)).toContain('stainless-steel-3-5-quart-saute-pan-with-cover');
  });

  it('finds a stock pot for soup', () => {
    const handles = search
      .search('stock pot for soup', { kinds: ['cookware'] }, 5)
      .map((r) => r.product.handle);
    expect(handles.some((h) => h.includes('stockpot') || h.includes('stock-pot'))).toBe(true);
  });

  it('excludes coming-soon products unless asked', () => {
    const handles = search.search('stock pot', {}, 50).map((r) => r.product.handle);
    expect(handles).not.toContain('4-quart-stock-pot-with-cover-fat-free-rack');
    const withUnavailable = search
      .search('stock pot', { includeUnavailable: true }, 50)
      .map((r) => r.product.handle);
    expect(withUnavailable).toContain('4-quart-stock-pot-with-cover-fat-free-rack');
  });
});
