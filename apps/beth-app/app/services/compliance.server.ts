import type { ActionFunctionArgs } from 'react-router';
import { authenticate } from '../shopify.server';
import db from '../db.server';
import { deleteShopData } from './knowledge/snapshots.server';

/**
 * Mandatory privacy webhooks. Beth stores no customer identifiers: conversations are anonymous
 * and transcripts are PII-scrubbed, so customer data requests and redactions have nothing to
 * return or erase. shop/redact (48 hours after uninstall) erases every row for the shop.
 */
export async function handleComplianceWebhook({ request }: ActionFunctionArgs): Promise<Response> {
  const { shop, topic } = await authenticate.webhook(request);
  const name = String(topic).toLowerCase().replace('_', '/');
  console.log(`[beth] compliance webhook ${name} for ${shop}`);
  if (name.startsWith('shop/redact')) {
    await deleteShopData(shop);
    await db.session.deleteMany({ where: { shop } });
  }
  return new Response();
}
