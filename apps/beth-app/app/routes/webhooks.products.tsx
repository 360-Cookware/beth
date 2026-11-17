import type { ActionFunctionArgs } from 'react-router';
import { authenticate } from '../shopify.server';
import { isFirstDelivery } from '../services/webhook-deliveries.server';
import { scheduleRefresh } from '../services/knowledge/sync.server';

/** products/create, products/update, products/delete → re-read the product from the Admin API. */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload, webhookId, admin } = await authenticate.webhook(request);
  if (!admin) return new Response(); // App uninstalled: nothing to refresh.
  if (!(await isFirstDelivery(webhookId, shop, String(topic)))) return new Response();

  const productId =
    typeof payload.admin_graphql_api_id === 'string'
      ? payload.admin_graphql_api_id
      : payload.id != null
        ? `gid://shopify/Product/${payload.id}`
        : null;
  if (productId) {
    const isDelete = String(topic).toLowerCase().includes('delete');
    scheduleRefresh('product', shop, admin, productId, isDelete ? 0 : 10_000);
  }
  return new Response();
};
