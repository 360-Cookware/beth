import {
  ProductSearch,
  RecipeSearch,
  buildCatalog,
  buildRecipeLibrary,
  type CatalogIndex,
  type RecipeLibrary,
} from '@beth/core';
import { loadCurrentProducts, loadCurrentRecipes } from './snapshots.server';

/** In-memory knowledge for one shop, built from the current snapshots. */
export interface Knowledge {
  shop: string;
  catalog: CatalogIndex;
  library: RecipeLibrary;
  productSearch: ProductSearch;
  recipeSearch: RecipeSearch;
  loadedAt: Date;
}

const cache = new Map<string, Knowledge>();
const pending = new Map<string, Promise<Knowledge>>();
const generation = new Map<string, number>();

/** Returns the cached knowledge, building it from the database when missing or forced. */
export function loadKnowledge(shop: string, options: { force?: boolean } = {}): Promise<Knowledge> {
  if (!options.force) {
    const hit = cache.get(shop);
    if (hit) return Promise.resolve(hit);
    const inflight = pending.get(shop);
    if (inflight) return inflight;
  }
  const startedGeneration = generation.get(shop) ?? 0;
  const promise = (async () => {
    const [products, articles] = await Promise.all([loadCurrentProducts(shop), loadCurrentRecipes(shop)]);
    const catalog = buildCatalog(products);
    const library = buildRecipeLibrary(articles, catalog);
    const knowledge: Knowledge = {
      shop,
      catalog,
      library,
      productSearch: new ProductSearch(catalog),
      recipeSearch: new RecipeSearch(library),
      loadedAt: new Date(),
    };
    // Only cache if no invalidation happened while loading.
    if ((generation.get(shop) ?? 0) === startedGeneration) cache.set(shop, knowledge);
    return knowledge;
  })().finally(() => {
    if (pending.get(shop) === promise) pending.delete(shop);
  });
  pending.set(shop, promise);
  return promise;
}

/** Drops the cached knowledge; the next read rebuilds it (a few milliseconds for this catalog). */
export function invalidateKnowledge(shop: string): void {
  generation.set(shop, (generation.get(shop) ?? 0) + 1);
  cache.delete(shop);
  pending.delete(shop);
}
