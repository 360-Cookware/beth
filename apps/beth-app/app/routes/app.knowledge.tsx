import type { HeadersFunction, LoaderFunctionArgs } from 'react-router';
import { useLoaderData } from 'react-router';
import { boundary } from '@shopify/shopify-app-react-router/server';
import { SOURCE_LABELS, SPEC_DEFINITIONS, summarizeProductQuality, summarizeRecipeQuality } from '@beth/core';
import { authenticate } from '../shopify.server';
import { loadKnowledge } from '../services/knowledge/store.server';

/** Same checks as docs/data-quality/*.md, computed from the live snapshot. */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const knowledge = await loadKnowledge(session.shop);
  const { catalog, library } = knowledge;
  if (catalog.products.length === 0) return { empty: true as const };

  const products = summarizeProductQuality(catalog);
  const recipes = summarizeRecipeQuality(library, catalog);
  const conflicts = catalog.products
    .filter((p) => p.quality.conflicts.length > 0)
    .map((p) => ({
      title: p.title,
      handle: p.handle,
      url: p.url,
      items: p.quality.conflicts.map((c) => ({
        label: SPEC_DEFINITIONS[c.key].label,
        values: c.variants.map((v) => `${v.display} — ${v.sources.map((s) => SOURCE_LABELS[s]).join(', ')}`),
      })),
    }));
  const missing = Object.entries(products.missingByKey)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([key, count]) => ({
      label: SPEC_DEFINITIONS[key as keyof typeof SPEC_DEFINITIONS]?.label ?? key,
      count,
    }));

  return {
    empty: false as const,
    loadedAt: knowledge.loadedAt.toISOString(),
    summary: {
      total: products.totalProducts,
      onlineActive: products.onlineActive,
      recommendable: products.recommendable,
      withSpecTable: products.withSpecTable,
      withConflicts: products.withConflicts,
      withLegacyDisagreements: products.withLegacyDisagreements,
    },
    conflicts,
    missing,
    recipes: {
      published: recipes.publishedArticles,
      structured: recipes.structuredRecipes,
      withActiveProductLink: recipes.withActiveProductLink,
      brokenLinks: recipes.brokenLinks,
    },
  };
};

export default function KnowledgeQuality() {
  const data = useLoaderData<typeof loader>();
  if (data.empty) {
    return (
      <s-page heading="Knowledge quality">
        <s-section>
          <s-paragraph>No snapshot yet. Run a knowledge sync from the Beth home page.</s-paragraph>
        </s-section>
      </s-page>
    );
  }
  const { summary, conflicts, missing, recipes } = data;
  return (
    <s-page heading="Knowledge quality">
      <s-section heading="Products">
        <s-unordered-list>
          <s-list-item>
            {summary.total} products, {summary.onlineActive} active on the Online Store
          </s-list-item>
          <s-list-item>{summary.recommendable} can be recommended by Beth</s-list-item>
          <s-list-item>{summary.withSpecTable} have the structured spec table</s-list-item>
          <s-list-item>
            {summary.withConflicts} have conflicting specs (Beth will not state those values)
          </s-list-item>
          <s-list-item>
            {summary.withLegacyDisagreements} have stale legacy tabs (ptabs.tabs) that disagree with the live
            page
          </s-list-item>
        </s-unordered-list>
      </s-section>

      <s-section heading="Spec conflicts to fix">
        {conflicts.length === 0 ? (
          <s-paragraph>None.</s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Product</s-table-header>
              <s-table-header>Attribute</s-table-header>
              <s-table-header>Values and sources</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {conflicts.flatMap((p) =>
                p.items.map((item) => (
                  <s-table-row key={`${p.handle}-${item.label}`}>
                    <s-table-cell>{p.title}</s-table-cell>
                    <s-table-cell>{item.label}</s-table-cell>
                    <s-table-cell>{item.values.join(' | ')}</s-table-cell>
                  </s-table-row>
                )),
              )}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      <s-section heading="Most common missing specs (recommendable products)">
        <s-unordered-list>
          {missing.map((m) => (
            <s-list-item key={m.label}>
              {m.label}: {m.count}
            </s-list-item>
          ))}
        </s-unordered-list>
      </s-section>

      <s-section heading="Recipes">
        <s-paragraph>
          {recipes.published} published articles, {recipes.structured} structured recipes,{' '}
          {recipes.withActiveProductLink} link to an active product.
        </s-paragraph>
        {recipes.brokenLinks.length > 0 && (
          <s-table>
            <s-table-header-row>
              <s-table-header>Linked handle</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Recipes</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {recipes.brokenLinks.map((b) => (
                <s-table-row key={b.handle}>
                  <s-table-cell>{b.handle}</s-table-cell>
                  <s-table-cell>{b.status}</s-table-cell>
                  <s-table-cell>{b.recipes}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
