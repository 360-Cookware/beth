import { describe, expect, it } from 'vitest';
import { buildCatalog } from '../src/products/normalize.js';
import { buildRecipeLibrary, isoDurationToMinutes, parseRecipeArticle } from '../src/recipes/recipes.js';
import { summarizeRecipeQuality } from '../src/recipes/recipe-quality-report.js';
import { RecipeSearch } from '../src/search/recipe-search.js';
import { loadCatalogFixture, loadRecipeFixture } from './fixtures.js';

const catalog = buildCatalog(loadCatalogFixture());
const library = buildRecipeLibrary(loadRecipeFixture(), catalog);

describe('recipe parsing', () => {
  it('parses ISO durations and ignores zero values', () => {
    expect(isoDurationToMinutes('PT1H30M')).toBe(90);
    expect(isoDurationToMinutes('PT0S')).toBeNull();
    expect(isoDurationToMinutes('P0D')).toBeNull();
    expect(isoDurationToMinutes(undefined)).toBeNull();
  });

  it('parses One-Pot Lasagna Soup from Recipe Kit data and links the stock pot', () => {
    const article = loadRecipeFixture().find((a) => a.handle === 'one-pot-lasagna-soup')!;
    const r = parseRecipeArticle(article);
    expect(r.kind).toBe('recipe');
    expect(r.ingredients.length).toBe(15);
    expect(r.directions.length).toBeGreaterThan(3);
    expect(r.productLinks.map((l) => l.handle)).toContain('stainless-steel-4-quart-stockpot-with-cover');
    // Times are not stated in this recipe, so Beth must not show any.
    expect(r.prepMinutes).toBeNull();
    expect(r.cookMinutes).toBeNull();
    expect(r.url).toBe('https://www.360cookware.com/blogs/recipes/one-pot-lasagna-soup');
  });

  it('resolves links against the catalog and indexes recipes by product', () => {
    const r = library.byHandle.get('one-pot-lasagna-soup')!;
    const link = r.productLinks.find((l) => l.handle === 'stainless-steel-4-quart-stockpot-with-cover')!;
    expect(link.status).toBe('active');
    const stockPot = catalog.byHandle.get('stainless-steel-4-quart-stockpot-with-cover')!;
    expect(library.byProductId.get(stockPot.id)).toContain(r);
  });

  it('flags links to products that no longer exist', () => {
    const s = summarizeRecipeQuality(library, catalog);
    const handles = s.brokenLinks.map((b) => b.handle);
    expect(handles).toEqual(expect.arrayContaining(['4-quart-mixing-bowl', '3-piece-mixing-bowl-set']));
  });

  it('matches the audit totals', () => {
    const s = summarizeRecipeQuality(library, catalog);
    expect(s.publishedArticles).toBe(259);
    expect(s.structuredRecipes).toBeGreaterThanOrEqual(240);
    expect(s.withActiveProductLink).toBeGreaterThan(150);
  });
});

describe('recipe search', () => {
  const search = new RecipeSearch(library);

  it('finds a recipe by exact title', () => {
    expect(search.findByTitle('One-Pot Lasagna Soup')?.handle).toBe('one-pot-lasagna-soup');
  });

  it('finds recipes for a product the customer already owns', () => {
    const saute = catalog.byHandle.get('stainless-steel-3-5-quart-saute-pan-with-cover')!;
    const results = search.search('', { productId: saute.id, limit: 50 });
    expect(results.length).toBeGreaterThan(10);
    for (const r of results)
      expect(r.productLinks.some((l) => l.productId === saute.id && l.status === 'active')).toBe(true);
  });

  it('ranks soup recipes for a soup query', () => {
    const results = search.search('lasagna soup', { limit: 3 });
    expect(results[0]?.handle).toBe('one-pot-lasagna-soup');
  });
});
