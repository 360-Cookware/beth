import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from 'react-router';
import { useFetcher, useLoaderData } from 'react-router';
import { boundary } from '@shopify/shopify-app-react-router/server';
import { authenticate } from '../shopify.server';
import db from '../db.server';
import { startFullSync } from '../services/knowledge/sync.server';

interface RunCounts {
  products?: { exported?: number; created?: number; updated?: number; deleted?: number };
  recipes?: { exported?: number; created?: number; updated?: number; deleted?: number };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const [runs, settings, productCount, recipeCount] = await Promise.all([
    db.knowledgeSyncRun.findMany({ where: { shop }, orderBy: { startedAt: 'desc' }, take: 5 }),
    db.settings.findUnique({ where: { shop }, select: { widgetEnabled: true } }),
    db.productSnapshot.count({ where: { shop, current: true, deletedAt: null } }),
    db.recipeSnapshot.count({ where: { shop, deletedAt: null } }),
  ]);
  return {
    productCount,
    recipeCount,
    widgetEnabled: settings?.widgetEnabled ?? false,
    runs: runs.map((r) => ({
      id: r.id,
      kind: r.kind,
      trigger: r.trigger,
      status: r.status,
      startedAt: r.startedAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
      counts: r.counts as RunCounts,
      conflicts: r.conflicts,
      error: r.error,
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const form = await request.formData();
  if (form.get('intent') === 'sync') {
    startFullSync(session.shop, admin, 'manual');
    return { started: true };
  }
  return { started: false };
};

const formatTime = (iso: string | null) => (iso ? `${iso.slice(0, 16).replace('T', ' ')} UTC` : '—');

const formatCounts = (c?: { exported?: number; created?: number; updated?: number; deleted?: number }) =>
  c
    ? `${c.exported ?? 0} read · ${c.created ?? 0} new · ${c.updated ?? 0} changed · ${c.deleted ?? 0} removed`
    : '—';

const statusTone = (status: string) =>
  status === 'succeeded' ? 'success' : status === 'failed' ? 'critical' : 'info';

export default function Index() {
  const { productCount, recipeCount, widgetEnabled, runs } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const syncing = fetcher.state !== 'idle' || runs[0]?.status === 'running';
  const lastFailure = runs[0]?.status === 'failed' ? runs[0] : null;

  return (
    <s-page heading="Beth">
      <s-button
        slot="primary-action"
        onClick={() => fetcher.submit({ intent: 'sync' }, { method: 'post' })}
        {...(syncing ? { loading: true } : {})}
      >
        Sync knowledge now
      </s-button>

      {lastFailure && (
        <s-banner tone="critical" heading="The last knowledge sync failed">
          <s-paragraph>{lastFailure.error ?? 'Unknown error'}</s-paragraph>
        </s-banner>
      )}

      <s-section heading="Knowledge">
        <s-paragraph>
          Beth answers only from verified store data. The current snapshot has {productCount} products and{' '}
          {recipeCount} recipe articles. Products update from webhooks within about a minute. A full sync
          re-reads the whole catalog and the Recipes blog.
        </s-paragraph>
        {runs.length === 0 ? (
          <s-paragraph>No sync has run yet.</s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Started</s-table-header>
              <s-table-header>Trigger</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Products</s-table-header>
              <s-table-header>Recipes</s-table-header>
              <s-table-header>Spec conflicts</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {runs.map((run) => (
                <s-table-row key={run.id}>
                  <s-table-cell>{formatTime(run.startedAt)}</s-table-cell>
                  <s-table-cell>{run.trigger}</s-table-cell>
                  <s-table-cell>
                    <s-badge tone={statusTone(run.status)}>{run.status}</s-badge>
                  </s-table-cell>
                  <s-table-cell>{formatCounts(run.counts.products)}</s-table-cell>
                  <s-table-cell>{formatCounts(run.counts.recipes)}</s-table-cell>
                  <s-table-cell>{run.status === 'succeeded' ? run.conflicts : '—'}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      <s-section heading="Storefront launcher">
        <s-paragraph>
          The &quot;Ask Beth&quot; launcher is {widgetEnabled ? 'enabled' : 'hidden'}. It stays hidden until
          the chat backend is configured and it is enabled here, and the app embed is only switched on in the
          staging theme (Beth Updates) until go-live is approved.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
