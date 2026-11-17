import type { ActionFunctionArgs } from 'react-router';
import { authenticate } from '../shopify.server';
import { isFirstDelivery } from '../services/webhook-deliveries.server';
import { scheduleRefresh } from '../services/knowledge/sync.server';

/** Events API, topic Article (create, update, delete) → re-read the article from the Admin API. */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, webhookId, eventId, admin } = await authenticate.webhook(request);
  if (!admin) return new Response();
  if (!(await isFirstDelivery(eventId ?? webhookId, shop, 'events/Article'))) return new Response();

  const variables = payload.query_variables as { articleId?: unknown } | undefined;
  const data = payload.data as { article?: { id?: unknown } | null } | undefined;
  const articleId =
    typeof variables?.articleId === 'string'
      ? variables.articleId
      : typeof data?.article?.id === 'string'
        ? data.article.id
        : null;
  if (articleId) scheduleRefresh('article', shop, admin, articleId, 5_000);
  return new Response();
};
