/**
 * Live knowledge sync: Shopify Admin API → snapshots (Postgres) → in-memory engines.
 *
 * - Full sync: products through a bulk operation (no query-cost limit), recipes through a
 *   paginated articles query. Runs on install, from the admin "Sync now" button and on a
 *   schedule (deployment phase).
 * - Incremental: webhooks and Events schedule a trailing refresh of one product or article.
 *   The webhook payload is never trusted as data: the record is re-read from the Admin API.
 *
 * Everything is read-only for the store. bulkOperationRunQuery only starts an export job.
 */
import {
  ARTICLE_BY_ID_QUERY,
  ARTICLES_PAGE_QUERY,
  BLOG_BY_HANDLE_QUERY,
  BULK_OPERATION_STATUS_QUERY,
  BULK_RUN_QUERY_MUTATION,
  INVENTORY_ITEM_PRODUCT_QUERY,
  PRODUCT_BY_ID_QUERY,
  PRODUCTS_BULK_QUERY,
  assembleBulkProducts,
  legacyIdFromGid,
  mapArticleNode,
  mapProductNode,
  summarizeProductQuality,
  type AdminArticleNode,
  type AdminProductNode,
} from '@beth/core';
import prisma from '../../db.server';
import { adminQuery, errorMessage, type AdminClient } from '../shopify/admin-graphql.server';
import * as snapshots from './snapshots.server';
import { invalidateKnowledge, loadKnowledge } from './store.server';

export const RECIPES_BLOG_HANDLE = process.env.BETH_RECIPES_BLOG_HANDLE || 'recipes';

const BULK_POLL_MS = 3_000;
const BULK_TIMEOUT_MS = 15 * 60_000;
const RUN_STALE_MS = 30 * 60_000;
const ARTICLES_PAGE_SIZE = 40;

export type SyncTrigger = 'install' | 'manual' | 'schedule' | 'webhook';

export interface SyncCounts {
  exported: number;
  created: number;
  updated: number;
  unchanged: number;
  deleted: number;
}

const emptyCounts = (): SyncCounts => ({ exported: 0, created: 0, updated: 0, unchanged: 0, deleted: 0 });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------------------------
// Full sync

/** Runs a full sync unless one is already running for the shop. Returns the run ID, or null if skipped. */
export async function runFullSync(
  shop: string,
  admin: AdminClient,
  trigger: SyncTrigger,
): Promise<string | null> {
  const running = await prisma.knowledgeSyncRun.findFirst({
    where: { shop, kind: 'full', status: 'running', startedAt: { gt: new Date(Date.now() - RUN_STALE_MS) } },
    select: { id: true },
  });
  if (running) return null;

  const run = await prisma.knowledgeSyncRun.create({
    data: { shop, kind: 'full', trigger, status: 'running' },
  });
  try {
    const products = await syncProducts(shop, admin, run.id);
    const recipes = await syncRecipes(shop, admin);
    invalidateKnowledge(shop);
    const knowledge = await loadKnowledge(shop, { force: true });
    const quality = summarizeProductQuality(knowledge.catalog);
    await prisma.knowledgeSyncRun.update({
      where: { id: run.id },
      data: {
        status: 'succeeded',
        finishedAt: new Date(),
        counts: { products: { ...products }, recipes: { ...recipes } },
        conflicts: quality.withConflicts,
      },
    });
    return run.id;
  } catch (error) {
    await prisma.knowledgeSyncRun.update({
      where: { id: run.id },
      data: { status: 'failed', finishedAt: new Date(), error: errorMessage(error).slice(0, 2000) },
    });
    throw error;
  }
}

/** Fire-and-forget for request handlers. Render runs a long-lived Node process, so this completes. */
export function startFullSync(shop: string, admin: AdminClient, trigger: SyncTrigger): void {
  runFullSync(shop, admin, trigger).catch((error) => {
    console.error(`[beth] knowledge sync failed for ${shop}: ${errorMessage(error)}`);
  });
}

export function startInitialSyncIfNeeded(shop: string, admin: AdminClient): void {
  void (async () => {
    const succeeded = await prisma.knowledgeSyncRun.count({
      where: { shop, kind: 'full', status: 'succeeded' },
    });
    if (succeeded === 0) await runFullSync(shop, admin, 'install');
  })().catch((error) => {
    console.error(`[beth] initial knowledge sync failed for ${shop}: ${errorMessage(error)}`);
  });
}

async function syncProducts(shop: string, admin: AdminClient, runId: string): Promise<SyncCounts> {
  const started = await adminQuery<{
    bulkOperationRunQuery: {
      bulkOperation: { id: string; status: string } | null;
      userErrors: { field: string[] | null; message: string }[];
    };
  }>(admin, BULK_RUN_QUERY_MUTATION, { query: PRODUCTS_BULK_QUERY });

  const { bulkOperation, userErrors } = started.bulkOperationRunQuery;
  if (!bulkOperation || userErrors.length > 0) {
    const reason = userErrors.map((e) => e.message).join('; ') || 'no operation returned';
    throw new Error(`Bulk product export could not start: ${reason}`);
  }
  await prisma.knowledgeSyncRun.update({
    where: { id: runId },
    data: { bulkOperationId: bulkOperation.id },
  });

  const url = await waitForBulkOperation(admin, bulkOperation.id);
  const jsonl = url ? await download(url) : '';
  const { products: nodes, orphanLines } = assembleBulkProducts(jsonl);
  if (orphanLines > 0) console.warn(`[beth] bulk export for ${shop}: ${orphanLines} orphan lines ignored`);

  const counts = emptyCounts();
  const seen = new Set<string>();
  for (const node of nodes) {
    const input = mapProductNode(node);
    seen.add(input.id);
    counts.exported++;
    counts[await snapshots.upsertProductSnapshot(shop, input)]++;
  }
  // An empty export is treated as a failure signal, never as "every product was deleted".
  if (counts.exported > 0) counts.deleted = await snapshots.markMissingProductsDeleted(shop, seen);
  return counts;
}

async function waitForBulkOperation(admin: AdminClient, id: string): Promise<string | null> {
  const deadline = Date.now() + BULK_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const data = await adminQuery<{
      node: { status: string; errorCode: string | null; url: string | null } | null;
    }>(admin, BULK_OPERATION_STATUS_QUERY, { id });
    const op = data.node;
    if (!op) throw new Error(`Bulk operation ${id} not found`);
    if (op.status === 'COMPLETED') return op.url;
    if (['FAILED', 'CANCELED', 'CANCELING', 'EXPIRED'].includes(op.status)) {
      throw new Error(`Bulk operation ${op.status.toLowerCase()} (${op.errorCode ?? 'no error code'})`);
    }
    await sleep(BULK_POLL_MS);
  }
  throw new Error(`Bulk operation ${id} did not finish within ${BULK_TIMEOUT_MS / 60_000} minutes`);
}

async function download(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Bulk result download failed: HTTP ${response.status}`);
  return response.text();
}

let recipesBlogId: string | null = null;

async function getRecipesBlogId(admin: AdminClient): Promise<string> {
  if (recipesBlogId) return recipesBlogId;
  const data = await adminQuery<{ blogs: { nodes: { id: string; handle: string }[] } }>(
    admin,
    BLOG_BY_HANDLE_QUERY,
    { query: `handle:${RECIPES_BLOG_HANDLE}` },
  );
  const blog = data.blogs.nodes.find((b) => b.handle === RECIPES_BLOG_HANDLE);
  if (!blog) throw new Error(`Blog "${RECIPES_BLOG_HANDLE}" was not found`);
  recipesBlogId = blog.id;
  return blog.id;
}

async function syncRecipes(shop: string, admin: AdminClient): Promise<SyncCounts> {
  const blogId = await getRecipesBlogId(admin);
  const query = `blog_id:${legacyIdFromGid(blogId)}`;
  const counts = emptyCounts();
  const seen = new Set<string>();
  let after: string | null = null;

  do {
    const page: {
      articles: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: AdminArticleNode[] };
    } = await adminQuery(admin, ARTICLES_PAGE_QUERY, { first: ARTICLES_PAGE_SIZE, after, query });
    for (const node of page.articles.nodes) {
      if (node.blog && node.blog.id !== blogId) continue;
      const input = mapArticleNode(node);
      seen.add(input.id);
      counts.exported++;
      counts[await snapshots.upsertRecipeSnapshot(shop, input)]++;
    }
    after = page.articles.pageInfo.hasNextPage ? page.articles.pageInfo.endCursor : null;
  } while (after);

  if (counts.exported > 0) counts.deleted = await snapshots.markMissingRecipesDeleted(shop, seen);
  return counts;
}

// ---------------------------------------------------------------------------------------------
// Incremental refresh

export type RefreshResult = 'created' | 'updated' | 'unchanged' | 'deleted';

export async function refreshProduct(
  shop: string,
  admin: AdminClient,
  productId: string,
): Promise<RefreshResult> {
  const data = await adminQuery<{ product: AdminProductNode | null }>(admin, PRODUCT_BY_ID_QUERY, {
    id: productId,
  });
  let result: RefreshResult;
  if (data.product) {
    result = await snapshots.upsertProductSnapshot(shop, mapProductNode(data.product));
  } else {
    result = (await snapshots.markProductDeleted(shop, productId)) ? 'deleted' : 'unchanged';
  }
  if (result !== 'unchanged') invalidateKnowledge(shop);
  return result;
}

export async function refreshArticle(
  shop: string,
  admin: AdminClient,
  articleId: string,
): Promise<RefreshResult> {
  const blogId = await getRecipesBlogId(admin);
  const data = await adminQuery<{ article: AdminArticleNode | null }>(admin, ARTICLE_BY_ID_QUERY, {
    id: articleId,
  });
  let result: RefreshResult;
  if (data.article && data.article.blog?.id === blogId) {
    result = await snapshots.upsertRecipeSnapshot(shop, mapArticleNode(data.article));
  } else {
    // Deleted, or not (or no longer) in the recipes blog.
    result = (await snapshots.markRecipeDeleted(shop, articleId)) ? 'deleted' : 'unchanged';
  }
  if (result !== 'unchanged') invalidateKnowledge(shop);
  return result;
}

export async function productIdForInventoryItem(
  admin: AdminClient,
  inventoryItemId: string,
): Promise<string | null> {
  const data = await adminQuery<{
    inventoryItem: { variant: { product: { id: string } | null } | null } | null;
  }>(admin, INVENTORY_ITEM_PRODUCT_QUERY, { id: inventoryItemId });
  return data.inventoryItem?.variant?.product?.id ?? null;
}

const scheduled = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Trailing refresh: bursts of webhooks for the same record (a product save can fire several)
 * collapse into one Admin API read after `delayMs`, which sees the latest state.
 */
export function scheduleRefresh(
  kind: 'product' | 'article',
  shop: string,
  admin: AdminClient,
  id: string,
  delayMs: number,
): void {
  const key = `${shop}|${kind}|${id}`;
  if (scheduled.has(key)) return;
  const timer = setTimeout(() => {
    scheduled.delete(key);
    const work = kind === 'product' ? refreshProduct(shop, admin, id) : refreshArticle(shop, admin, id);
    work.catch((error) => {
      console.error(`[beth] ${kind} refresh failed (${shop} ${id}): ${errorMessage(error)}`);
    });
  }, delayMs);
  timer.unref?.();
  scheduled.set(key, timer);
}
