import type { ActionFunctionArgs } from 'react-router';
import { authenticate } from '../shopify.server';
import { isFirstDelivery } from '../services/webhook-deliveries.server';
import { productIdForInventoryItem, scheduleRefresh } from '../services/knowledge/sync.server';

/** inventory_levels/update → coalesced availability refresh of the product (60 s trailing window). */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload, webhookId, admin } = await authenticate.webhook(request);
  if (!admin) return new Response();
  if (!(await isFirstDelivery(webhookId, shop, String(topic)))) return new Response();

  const inventoryItemId =
    payload.inventory_item_id != null ? `gid://shopify/InventoryItem/${payload.inventory_item_id}` : null;
  if (inventoryItemId) {
    void productIdForInventoryItem(admin, inventoryItemId)
      .then((productId) => {
        if (productId) scheduleRefresh('product', shop, admin, productId, 60_000);
      })
      .catch((error) => console.error(`[beth] inventory lookup failed (${shop}):`, error));
  }
  return new Response();
};
