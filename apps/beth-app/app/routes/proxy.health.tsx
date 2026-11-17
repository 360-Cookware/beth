import type { LoaderFunctionArgs } from 'react-router';
import { authenticate } from '../shopify.server';
import db from '../db.server';

/**
 * GET https://www.360cookware.com/apps/beth/health (app proxy, signed by Shopify).
 * Diagnostics only: the storefront loader does not call it on page load.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  const headers = { 'Cache-Control': 'no-store' };
  if (!session) return Response.json({ ok: false, reason: 'not_installed' }, { status: 503, headers });

  const settings = await db.settings.findUnique({
    where: { shop: session.shop },
    select: { widgetEnabled: true },
  });
  const lastSync = await db.knowledgeSyncRun.findFirst({
    where: { shop: session.shop, kind: 'full', status: 'succeeded' },
    orderBy: { startedAt: 'desc' },
    select: { finishedAt: true },
  });
  return Response.json(
    {
      ok: true,
      widget: settings?.widgetEnabled ? 'enabled' : 'disabled',
      knowledge: lastSync ? 'ready' : 'pending',
    },
    { headers },
  );
};
