import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ProductSearch,
  RecipeSearch,
  buildCatalog,
  buildRecipeLibrary,
  type ShopifyArticleInput,
  type ShopifyProductInput,
} from '../../core/src/index.js';
import { CatalogProvider, parseFilters } from '../src/catalog-provider.js';
import { runChatTurn, validateBlocks } from '../src/engine.js';
import { prepareCartAction, type KnowledgeView } from '../src/tools.js';
import type { Block } from '../src/blocks.js';

const FIX = resolve(__dirname, '../../../fixtures/shopify');
const products = (
  JSON.parse(readFileSync(resolve(FIX, 'catalog.2026-11-17.json'), 'utf8')) as {
    products: ShopifyProductInput[];
  }
).products;
const articles = (
  JSON.parse(readFileSync(resolve(FIX, 'recipes.2026-11-17.json'), 'utf8')) as {
    articles: ShopifyArticleInput[];
  }
).articles;
const catalog = buildCatalog(products);
const library = buildRecipeLibrary(articles, catalog);
const k: KnowledgeView = {
  catalog,
  library,
  productSearch: new ProductSearch(catalog),
  recipeSearch: new RecipeSearch(library),
};

const ask = (message: string, productHandle?: string) =>
  runChatTurn({ message, history: [], context: { productHandle: productHandle ?? null } }, k);
const find = <T extends Block['type']>(blocks: Block[], type: T) =>
  blocks.find((b): b is Extract<Block, { type: T }> => b.type === type);

describe('catalog provider and engine', () => {
  it('greets with quick replies and an honest preview notice', async () => {
    const { blocks, provider } = await ask('hi');
    expect(provider).toBe('catalog');
    expect(find(blocks, 'quick_replies')?.options.length).toBeGreaterThan(0);
    expect(find(blocks, 'notice')?.text).toMatch(/Preview/);
  });

  it('parses budget, capacity, induction and cover filters', () => {
    const { filters } = parseFilters('a 4 quart pot under $150 for induction');
    expect(filters.maxPriceCents).toBe(15000);
    expect(filters.minCapacityQt).toBeCloseTo(3.6);
    expect(filters.inductionCompatible).toBe(true);
  });

  it('recommends real, recommendable products with verified highlights', async () => {
    const { blocks } = await ask('4 quart stock pot');
    const cards = find(blocks, 'product_cards')!.products;
    expect(cards.length).toBeGreaterThan(0);
    expect(cards[0]!.label).toBe('Best match');
    for (const card of cards) {
      const p = catalog.byHandle.get(card.handle)!;
      expect(p.recommendable).toBe(true);
      expect(card.priceCents).toBe(p.minPriceCents);
    }
    expect(cards.some((c) => /stock pot/i.test(c.title))).toBe(true);
  });

  it('finds recipes and links only active products', async () => {
    const { blocks } = await ask('lasagna recipes');
    const recipes = find(blocks, 'recipe_cards')!.recipes;
    expect(recipes.some((r) => /lasagna/i.test(r.title))).toBe(true);
    for (const r of recipes)
      for (const p of r.products) expect(catalog.byHandle.get(p.handle)?.status).toBe('ACTIVE');
  });

  it('answers questions about the current product from verified specs, or says it cannot verify', async () => {
    const sautee = catalog.products.find((p) => /3\.5 Quart Saut/i.test(p.title))!;
    const { blocks } = await ask('Is it oven safe?', sautee.handle);
    const text = find(blocks, 'text')!.text;
    expect(text).toMatch(/oven-safe temperature: \d+/i);
    const { blocks: b2 } = await ask('how much does it weigh?', sautee.handle);
    expect(find(b2, 'text')!.text).toMatch(/weight/i);
  });

  it('compares products with aligned rows', async () => {
    const { blocks } = await ask('compare saucepans');
    const cmp = find(blocks, 'comparison')!;
    expect(cmp.columns.length).toBeGreaterThanOrEqual(2);
    for (const row of cmp.rows) expect(row.values).toHaveLength(cmp.columns.length);
  });

  it('validates add-to-cart requests against the snapshot', () => {
    const pot = catalog.byHandle.get('stainless-steel-4-quart-stockpot-with-cover')!;
    expect(prepareCartAction(k, pot.handle, null, 1)).toMatchObject({
      ok: true,
      variantId: pot.variants[0]!.legacyId,
    });
    expect(prepareCartAction(k, 'not-a-product', null, 1)).toEqual({ ok: false, reason: 'unknown_product' });
    expect(prepareCartAction(k, pot.handle, '123', 1)).toEqual({ ok: false, reason: 'unknown_variant' });
    expect(prepareCartAction(k, pot.handle, null, 0)).toEqual({ ok: false, reason: 'bad_quantity' });
    const comingSoon = catalog.products.find((p) => p.comingSoon)!;
    expect(prepareCartAction(k, comingSoon.handle, null, 1)).toEqual({
      ok: false,
      reason: 'not_recommendable',
    });
  });

  it('removes invented products, wrong prices and foreign links', () => {
    const pot = catalog.byHandle.get('stainless-steel-4-quart-stockpot-with-cover')!;
    const fake = {
      handle: 'invented',
      title: 'X',
      url: '',
      image: null,
      priceCents: 1,
      maxPriceCents: 1,
      currency: 'USD',
      rating: null,
      highlights: [],
      variants: [],
      available: true,
    };
    const wrongPrice = { ...fake, handle: pot.handle, priceCents: 1, variants: [] };
    const out = validateBlocks(
      [
        { type: 'product_cards', products: [fake, wrongPrice] },
        { type: 'text', text: 'See https://evil.example/x and https://www.360cookware.com/pages/faq' },
      ],
      k,
    );
    expect(out.find((b) => b.type === 'product_cards')).toBeUndefined();
    expect((out[0] as { text: string }).text).toBe(
      'See [link removed] and https://www.360cookware.com/pages/faq',
    );
  });

  it('falls back to the catalog provider when the primary provider fails', async () => {
    const broken = {
      name: 'broken',
      respond: async () => {
        throw new Error('down');
      },
    };
    const result = await runChatTurn({ message: 'fry pan', history: [], context: {} }, k, broken);
    expect(result.fallback).toBe(true);
    expect(result.provider).toBe(new CatalogProvider().name);
    expect(find(result.blocks, 'product_cards')).toBeDefined();
  });
});

describe('follow-ups on the previous cards', () => {
  it('compares and finds recipes for the products shown before', async () => {
    const first = await ask('stock pot');
    const handles = first.blocks.flatMap((b) =>
      b.type === 'product_cards' ? b.products.map((p) => p.handle) : [],
    );
    const cmp = await runChatTurn(
      { message: 'Compare these', history: [], context: { recentProductHandles: handles } },
      k,
    );
    expect(cmp.blocks.find((b) => b.type === 'comparison')).toBeDefined();
    const rec = await runChatTurn(
      { message: 'Recipes for these', history: [], context: { recentProductHandles: handles } },
      k,
    );
    expect(rec.blocks.find((b) => b.type === 'recipe_cards')).toBeDefined();
  });
});
