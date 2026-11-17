import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ShopifyProductInput } from '../src/products/shopify-types.js';
import type { ShopifyArticleInput } from '../src/recipes/recipes.js';

const here = dirname(fileURLToPath(import.meta.url));
export const FIXTURE_DIR = resolve(here, '../../../fixtures/shopify');
export const CATALOG_FIXTURE = 'catalog.2026-11-17.json';
export const RECIPES_FIXTURE = 'recipes.2026-11-17.json';

let catalogCache: ShopifyProductInput[] | null = null;
let recipesCache: ShopifyArticleInput[] | null = null;

/** Real read-only export of the 360 Cookware catalog (Admin API 2026-10, 2026-11-17). */
export function loadCatalogFixture(): ShopifyProductInput[] {
  catalogCache ??= (
    JSON.parse(readFileSync(resolve(FIXTURE_DIR, CATALOG_FIXTURE), 'utf8')) as {
      products: ShopifyProductInput[];
    }
  ).products;
  return catalogCache;
}

/** Real read-only export of the Recipes blog (274 articles, 2026-11-17). */
export function loadRecipeFixture(): ShopifyArticleInput[] {
  recipesCache ??= (
    JSON.parse(readFileSync(resolve(FIXTURE_DIR, RECIPES_FIXTURE), 'utf8')) as {
      articles: ShopifyArticleInput[];
    }
  ).articles;
  return recipesCache;
}

export function productByHandle(handle: string): ShopifyProductInput {
  const p = loadCatalogFixture().find((x) => x.handle === handle);
  if (!p) throw new Error(`fixture product not found: ${handle}`);
  return p;
}
