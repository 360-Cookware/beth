import type { BethRecipe, RecipeLibrary } from '../recipes/recipes.js';
import { BM25Index } from './bm25.js';

export interface RecipeSearchOptions {
  /** Only recipes that link (actively) to this product id. */
  productId?: string;
  /** Exclude non-recipe articles (care guides etc.). Default true. */
  recipesOnly?: boolean;
  limit?: number;
}

export class RecipeSearch {
  private readonly index: BM25Index;

  constructor(private readonly library: RecipeLibrary) {
    this.index = new BM25Index(
      library.recipes.map((r) => ({
        id: r.handle,
        fields: [
          { text: r.title, weight: 5 },
          { text: r.tags.join(' '), weight: 2 },
          { text: [r.category ?? '', r.cuisine ?? ''].join(' '), weight: 2 },
          { text: r.description ?? '', weight: 1 },
          { text: r.ingredients.map((i) => i.text).join(' '), weight: 1 },
        ],
      })),
    );
  }

  search(query: string, options: RecipeSearchOptions = {}): BethRecipe[] {
    const recipesOnly = options.recipesOnly ?? true;
    const limit = options.limit ?? 5;
    const allowed = options.productId ? new Set(this.library.byProductId.get(options.productId) ?? []) : null;
    const keep = (r: BethRecipe) => (!recipesOnly || r.kind === 'recipe') && (!allowed || allowed.has(r));
    if (!query.trim()) {
      return this.library.recipes.filter(keep).slice(0, limit);
    }
    return this.index
      .search(query, 100)
      .map((hit) => this.library.byHandle.get(hit.id))
      .filter((r): r is BethRecipe => Boolean(r) && keep(r as BethRecipe))
      .slice(0, limit);
  }

  /** Exact or near-exact title lookup, e.g. "One-Pot Lasagna Soup". */
  findByTitle(title: string): BethRecipe | null {
    const norm = title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    return (
      this.library.recipes.find(
        (r) =>
          r.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .trim() === norm,
      ) ?? null
    );
  }
}
