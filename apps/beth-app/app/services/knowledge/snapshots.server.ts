import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { ShopifyArticleInput, ShopifyProductInput } from '@beth/core';
import prisma from '../../db.server';

/** Current version plus the previous 7 (architecture §7). */
export const PRODUCT_VERSIONS_KEPT = 8;

export type UpsertResult = 'created' | 'updated' | 'unchanged';

export function contentHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export async function upsertProductSnapshot(shop: string, input: ShopifyProductInput): Promise<UpsertResult> {
  const hash = contentHash(input);
  const current = await prisma.productSnapshot.findFirst({
    where: { shop, productId: input.id, current: true },
    select: { hash: true, deletedAt: true },
  });
  if (current && current.hash === hash && !current.deletedAt) return 'unchanged';

  const latest = await prisma.productSnapshot.findFirst({
    where: { shop, productId: input.id },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  const version = (latest?.version ?? 0) + 1;

  await prisma.$transaction([
    prisma.productSnapshot.updateMany({
      where: { shop, productId: input.id, current: true },
      data: { current: false },
    }),
    prisma.productSnapshot.create({
      data: {
        shop,
        productId: input.id,
        handle: input.handle,
        version,
        current: true,
        hash,
        source: asJson(input),
        shopifyUpdatedAt: new Date(input.updatedAt),
      },
    }),
    prisma.productSnapshot.deleteMany({
      where: { shop, productId: input.id, version: { lte: version - PRODUCT_VERSIONS_KEPT } },
    }),
  ]);
  return current ? 'updated' : 'created';
}

export async function markProductDeleted(shop: string, productId: string): Promise<boolean> {
  const { count } = await prisma.productSnapshot.updateMany({
    where: { shop, productId, current: true, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return count > 0;
}

/** After a complete export: products no longer returned by Shopify are marked deleted. */
export async function markMissingProductsDeleted(shop: string, seen: Set<string>): Promise<number> {
  const rows = await prisma.productSnapshot.findMany({
    where: { shop, current: true, deletedAt: null },
    select: { productId: true },
  });
  const missing = rows.map((r) => r.productId).filter((id) => !seen.has(id));
  if (missing.length === 0) return 0;
  const { count } = await prisma.productSnapshot.updateMany({
    where: { shop, current: true, productId: { in: missing } },
    data: { deletedAt: new Date() },
  });
  return count;
}

export async function upsertRecipeSnapshot(shop: string, input: ShopifyArticleInput): Promise<UpsertResult> {
  const hash = contentHash(input);
  const key = { shop_articleId: { shop, articleId: input.id } };
  const existing = await prisma.recipeSnapshot.findUnique({
    where: key,
    select: { hash: true, deletedAt: true },
  });
  if (existing && existing.hash === hash && !existing.deletedAt) return 'unchanged';
  await prisma.recipeSnapshot.upsert({
    where: key,
    create: { shop, articleId: input.id, handle: input.handle, hash, source: asJson(input) },
    update: { handle: input.handle, hash, source: asJson(input), deletedAt: null },
  });
  return existing ? 'updated' : 'created';
}

export async function markRecipeDeleted(shop: string, articleId: string): Promise<boolean> {
  const { count } = await prisma.recipeSnapshot.updateMany({
    where: { shop, articleId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return count > 0;
}

export async function markMissingRecipesDeleted(shop: string, seen: Set<string>): Promise<number> {
  const rows = await prisma.recipeSnapshot.findMany({
    where: { shop, deletedAt: null },
    select: { articleId: true },
  });
  const missing = rows.map((r) => r.articleId).filter((id) => !seen.has(id));
  if (missing.length === 0) return 0;
  const { count } = await prisma.recipeSnapshot.updateMany({
    where: { shop, articleId: { in: missing } },
    data: { deletedAt: new Date() },
  });
  return count;
}

export async function loadCurrentProducts(shop: string): Promise<ShopifyProductInput[]> {
  const rows = await prisma.productSnapshot.findMany({
    where: { shop, current: true, deletedAt: null },
    select: { source: true },
  });
  return rows.map((r) => r.source as unknown as ShopifyProductInput);
}

export async function loadCurrentRecipes(shop: string): Promise<ShopifyArticleInput[]> {
  const rows = await prisma.recipeSnapshot.findMany({
    where: { shop, deletedAt: null },
    select: { source: true },
  });
  return rows.map((r) => r.source as unknown as ShopifyArticleInput);
}

/** Removes every Beth row for a shop (shop/redact compliance webhook). Sessions are removed by the caller. */
export async function deleteShopData(shop: string): Promise<void> {
  await prisma.$transaction([
    prisma.productSnapshot.deleteMany({ where: { shop } }),
    prisma.recipeSnapshot.deleteMany({ where: { shop } }),
    prisma.knowledgeSyncRun.deleteMany({ where: { shop } }),
    prisma.webhookDelivery.deleteMany({ where: { shop } }),
    prisma.conversation.deleteMany({ where: { shop } }),
    prisma.event.deleteMany({ where: { shop } }),
    prisma.costLedger.deleteMany({ where: { shop } }),
    prisma.budgetCounter.deleteMany({ where: { shop } }),
    prisma.orderAttribution.deleteMany({ where: { shop } }),
    prisma.settings.deleteMany({ where: { shop } }),
  ]);
}
