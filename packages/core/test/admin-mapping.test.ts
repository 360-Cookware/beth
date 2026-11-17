import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assembleBulkProducts,
  legacyIdFromGid,
  mapArticleNode,
  mapProductNode,
  type AdminArticleNode,
  type AdminProductNode,
} from '../src/shopify/admin-mapping.js';
import {
  PRODUCTS_BULK_QUERY,
  PRODUCT_BY_ID_QUERY,
  PRODUCT_METAFIELD_ALIASES,
} from '../src/shopify/admin-queries.js';
import { FIXTURE_DIR, loadCatalogFixture, loadRecipeFixture } from './fixtures.js';

const sample = JSON.parse(readFileSync(resolve(FIXTURE_DIR, 'admin-raw-sample.2026-11-17.json'), 'utf8')) as {
  products: AdminProductNode[];
  articles: AdminArticleNode[];
};

/** Flattens a paginated product node into bulk-operation JSONL (children carry __parentId). */
function toBulkJsonl(nodes: AdminProductNode[]): string {
  const lines: string[] = [];
  let seq = 1;
  for (const node of nodes) {
    const { collections, mfIndex, variants, ...product } = node;
    lines.push(JSON.stringify(product));
    for (const c of collections?.nodes ?? [])
      lines.push(
        JSON.stringify({ id: `gid://shopify/Collection/${seq++}`, handle: c.handle, __parentId: node.id }),
      );
    for (const m of mfIndex?.nodes ?? [])
      lines.push(JSON.stringify({ id: `gid://shopify/Metafield/${seq++}`, ...m, __parentId: node.id }));
    for (const v of variants?.nodes ?? []) lines.push(JSON.stringify({ ...v, __parentId: node.id }));
  }
  return lines.join('\n') + '\n';
}

describe('Admin GraphQL → knowledge input mapping', () => {
  const catalog = new Map(loadCatalogFixture().map((p) => [p.id, p]));
  const recipes = new Map(loadRecipeFixture().map((a) => [a.id, a]));

  it('reproduces the recorded catalog fixture from raw product nodes', () => {
    expect(sample.products.length).toBeGreaterThanOrEqual(8);
    for (const node of sample.products) {
      expect(mapProductNode(node)).toEqual(catalog.get(node.id));
    }
  });

  it('re-assembles bulk JSONL into the same products', () => {
    const { products, orphanLines } = assembleBulkProducts(toBulkJsonl(sample.products));
    expect(orphanLines).toBe(0);
    expect(products.map(mapProductNode)).toEqual(sample.products.map((n) => catalog.get(n.id)));
  });

  it('counts child lines without a known parent as orphans', () => {
    const jsonl = JSON.stringify({
      id: 'gid://shopify/ProductVariant/1',
      __parentId: 'gid://shopify/Product/404',
    });
    expect(assembleBulkProducts(jsonl).orphanLines).toBe(1);
  });

  it('reproduces the recorded recipe fixture from raw article nodes', () => {
    for (const node of sample.articles) {
      expect(mapArticleNode(node)).toEqual(recipes.get(node.id));
    }
  });

  it('requests every metafield alias in both product queries and never selects index values', () => {
    for (const [alias, [ns, key]] of Object.entries(PRODUCT_METAFIELD_ALIASES)) {
      const selection = `${alias}: metafield(namespace: "${ns}", key: "${key}") { value }`;
      expect(PRODUCT_BY_ID_QUERY).toContain(selection);
      expect(PRODUCTS_BULK_QUERY).toContain(selection);
    }
    expect(PRODUCT_BY_ID_QUERY).toContain('mfIndex: metafields(first: 100) { nodes { namespace key type } }');
    expect(PRODUCTS_BULK_QUERY).toContain('metafields { edges { node { id namespace key type } } }');
  });

  it('extracts numeric IDs from GIDs', () => {
    expect(legacyIdFromGid('gid://shopify/Blog/6989819')).toBe('6989819');
    expect(legacyIdFromGid('gid://shopify/Product/1?x=1')).toBe('1');
  });
});
