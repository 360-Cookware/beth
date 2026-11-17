import { Prisma } from '@prisma/client';
import prisma from '../db.server';

/**
 * Records a webhook or Events delivery. Returns false when the same delivery was already
 * processed (Shopify retries, duplicate deliveries), so handlers stay idempotent.
 */
export async function isFirstDelivery(
  deliveryId: string | undefined,
  shop: string,
  topic: string,
): Promise<boolean> {
  if (!deliveryId) return true;
  try {
    await prisma.webhookDelivery.create({ data: { id: deliveryId, shop, topic } });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return false;
    throw error;
  }
}

export async function pruneWebhookDeliveries(olderThanDays = 7): Promise<number> {
  const { count } = await prisma.webhookDelivery.deleteMany({
    where: { receivedAt: { lt: new Date(Date.now() - olderThanDays * 86_400_000) } },
  });
  return count;
}
