/**
 * Integration test: Admin API (faked from the recorded fixtures) → bulk JSONL → snapshots in
 * PostgreSQL → in-memory engines. Runs only when BETH_TEST_DATABASE_URL points to a disposable
 * database with the migrations applied (its Beth tables are truncated).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type {
  AdminArticleNode,
  AdminProductNode,
  ShopifyArticleInput,
  ShopifyProductInput,
} from '@beth/core';
import type { AdminClient } from '../app/services/shopify/admin-graphql.server';

const DB_URL = process.env.BETH_TEST_DATABASE_URL;
const FIXTURES = resolve(__dirname, '../../../fixtures/shopify');
const BULK_URL = 'https://bulk.test/products.jsonl';
const BLOG_ID = 'gid://shopify/Blog/6989819';
const ALIASES = [
  'specTable',
  'includes',
  'shortDetails',
  'ptabs',
  'care',
  'customTitle',
  'bf2026',
  'rating',
  'ratingCount',
  'related',
  'complementary',
  'upgradeToSet',
  'setInclude',
  'bundleSet',
] as const;

const catalog = (
  JSON.parse(readFileSync(resolve(FIXTURES, 'catalog.2026-11-17.json'), 'utf8')) as {
    products: ShopifyProductInput[];
  }
).products;
const articles = (
  JSON.parse(readFileSync(resolve(FIXTURES, 'recipes.2026-11-17.json'), 'utf8')) as {
    articles: ShopifyArticleInput[];
  }
).articles;

/** Inverse of mapProductNode: the shape the Admin API returns. */
function toRawProduct(p: ShopifyProductInput): AdminProductNode {
  const { collections, metafieldKeys, metafields, variants, ...rest } = p;
  const raw: Record<string, unknown> = {
    ...rest,
    collections: { nodes: collections.map((handle) => ({ handle })) },
    mfIndex: {
      nodes: (metafieldKeys ?? []).map((k) => {
        const i = k.indexOf('.');
        return { namespace: k.slice(0, i), key: k.slice(i + 1), type: 'string' };
      }),
    },
    variants: { nodes: variants },
  };
  for (const alias of ALIASES) raw[alias] = metafields[alias] == null ? null : { value: metafields[alias] };
  return raw as AdminProductNode;
}

function toRawArticle(a: ShopifyArticleInput, blogId = BLOG_ID): AdminArticleNode {
  return {
    ...a,
    author: a.author == null ? null : { name: a.author },
    rk: { nodes: a.recipekitMetafields },
    featured: a.featuredProduct == null ? null : { value: a.featuredProduct },
    blog: { id: blogId },
  };
}

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
  return lines.join('\n');
}

interface FakeStore {
  products: Map<string, AdminProductNode>;
  articles: Map<string, AdminArticleNode>;
}

function fakeAdmin(store: FakeStore): AdminClient {
  const graphql = async (query: string, options?: { variables?: Record<string, unknown> }) => {
    const v = options?.variables ?? {};
    let data: unknown;
    if (query.includes('bulkOperationRunQuery')) {
      data = {
        bulkOperationRunQuery: {
          bulkOperation: { id: 'gid://shopify/BulkOperation/1', status: 'CREATED' },
          userErrors: [],
        },
      };
    } else if (query.includes('query BethBulkStatus')) {
      data = { node: { id: v['id'], status: 'COMPLETED', errorCode: null, url: BULK_URL } };
    } else if (query.includes('query BethBlog(')) {
      data = { blogs: { nodes: [{ id: BLOG_ID, handle: 'recipes', title: 'Recipes' }] } };
    } else if (query.includes('query BethArticles(')) {
      const all = [...store.articles.values()];
      const start = v['after'] ? Number(v['after']) : 0;
      const first = Number(v['first']);
      const nodes = all.slice(start, start + first);
      const end = start + nodes.length;
      data = { articles: { nodes, pageInfo: { hasNextPage: end < all.length, endCursor: String(end) } } };
    } else if (query.includes('query BethProduct(')) {
      data = { product: store.products.get(String(v['id'])) ?? null };
    } else if (query.includes('query BethArticle(')) {
      data = { article: store.articles.get(String(v['id'])) ?? null };
    } else {
      throw new Error(`Unexpected query: ${query.slice(0, 60)}`);
    }
    return new Response(JSON.stringify({ data }));
  };
  return { graphql } as unknown as AdminClient;
}

describe.skipIf(!DB_URL)('knowledge sync (PostgreSQL)', () => {
  const SHOP = 'test-shop.myshopify.com';
  const store: FakeStore = {
    products: new Map(catalog.map((p) => [p.id, toRawProduct(p)])),
    articles: new Map(articles.map((a) => [a.id, toRawArticle(a)])),
  };
  let sync: typeof import('../app/services/knowledge/sync.server');
  let knowledgeStore: typeof import('../app/services/knowledge/store.server');
  let deliveries: typeof import('../app/services/webhook-deliveries.server');
  let db: typeof import('../app/db.server').default;
  let core: typeof import('@beth/core');

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    db = (await import('../app/db.server')).default;
    sync = await import('../app/services/knowledge/sync.server');
    knowledgeStore = await import('../app/services/knowledge/store.server');
    deliveries = await import('../app/services/webhook-deliveries.server');
    core = await import('@beth/core');
    await db.$executeRawUnsafe(
      'TRUNCATE "ProductSnapshot", "RecipeSnapshot", "KnowledgeSyncRun", "WebhookDelivery"',
    );
    vi.stubGlobal('fetch', async (url: string) =>
      url === BULK_URL
        ? new Response(toBulkJsonl([...store.products.values()]))
        : new Response('not found', { status: 404 }),
    );
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await db?.$disconnect();
  });

  it('runs a full sync and reproduces the fixture-based knowledge numbers', async () => {
    const runId = await sync.runFullSync(SHOP, fakeAdmin(store), 'manual');
    expect(runId).toBeTruthy();
    const run = await db.knowledgeSyncRun.findUniqueOrThrow({ where: { id: runId! } });
    expect(run.status).toBe('succeeded');
    expect(run.bulkOperationId).toBe('gid://shopify/BulkOperation/1');
    expect(run.counts).toMatchObject({
      products: { exported: 275, created: 275, updated: 0, unchanged: 0, deleted: 0 },
      recipes: { exported: 274, created: 274, deleted: 0 },
    });
    expect(run.conflicts).toBe(4);

    const knowledge = await knowledgeStore.loadKnowledge(SHOP);
    const quality = core.summarizeProductQuality(knowledge.catalog);
    expect(quality.totalProducts).toBe(275);
    expect(quality.onlineActive).toBe(139);
    expect(quality.recommendable).toBe(111);
    const recipes = core.summarizeRecipeQuality(knowledge.library, knowledge.catalog);
    expect(recipes.publishedArticles).toBe(259);
    expect(recipes.withActiveProductLink).toBe(210);
  });

  it('a second full sync changes nothing', async () => {
    const runId = await sync.runFullSync(SHOP, fakeAdmin(store), 'schedule');
    const run = await db.knowledgeSyncRun.findUniqueOrThrow({ where: { id: runId! } });
    expect(run.counts).toMatchObject({
      products: { unchanged: 275, created: 0, updated: 0, deleted: 0 },
      recipes: { unchanged: 274, created: 0, updated: 0, deleted: 0 },
    });
  });

  it('skips a full sync while another one is running', async () => {
    const running = await db.knowledgeSyncRun.create({
      data: { shop: SHOP, kind: 'full', trigger: 'manual', status: 'running' },
    });
    expect(await sync.runFullSync(SHOP, fakeAdmin(store), 'manual')).toBeNull();
    await db.knowledgeSyncRun.delete({ where: { id: running.id } });
  });

  it('refreshes one product, versions it and keeps 8 versions', async () => {
    const target = catalog.find((p) => p.handle === '9-piece-stainless-steel-cookware-set')!;
    for (let i = 1; i <= 9; i++) {
      store.products.set(target.id, toRawProduct({ ...target, title: `${target.title} v${i}` }));
      expect(await sync.refreshProduct(SHOP, fakeAdmin(store), target.id)).toBe('updated');
    }
    expect(await sync.refreshProduct(SHOP, fakeAdmin(store), target.id)).toBe('unchanged');
    const versions = await db.productSnapshot.findMany({
      where: { shop: SHOP, productId: target.id },
      orderBy: { version: 'asc' },
    });
    expect(versions).toHaveLength(8);
    expect(versions.filter((v) => v.current)).toHaveLength(1);
    expect(versions.at(-1)?.version).toBe(10);
    const knowledge = await knowledgeStore.loadKnowledge(SHOP);
    expect(knowledge.catalog.byHandle.get(target.handle)?.title).toBe(`${target.title} v9`);
  });

  it('marks deleted products and articles, including articles moved out of the recipes blog', async () => {
    const product = catalog.find((p) => p.handle === '1-quart-cover-only')!;
    store.products.delete(product.id);
    expect(await sync.refreshProduct(SHOP, fakeAdmin(store), product.id)).toBe('deleted');

    const article = articles[0]!;
    store.articles.set(article.id, toRawArticle(article, 'gid://shopify/Blog/1'));
    expect(await sync.refreshArticle(SHOP, fakeAdmin(store), article.id)).toBe('deleted');

    const knowledge = await knowledgeStore.loadKnowledge(SHOP);
    expect(knowledge.catalog.products).toHaveLength(274);
    expect(knowledge.catalog.byHandle.has(product.handle)).toBe(false);
    expect(knowledge.library.recipes.some((r) => r.id === article.id)).toBe(false);
  });

  it('records each webhook delivery once', async () => {
    expect(await deliveries.isFirstDelivery('delivery-1', SHOP, 'products/update')).toBe(true);
    expect(await deliveries.isFirstDelivery('delivery-1', SHOP, 'products/update')).toBe(false);
  });
});
