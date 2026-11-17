/**
 * Generates the product and recipe data-quality reports from a Shopify export.
 *
 *   npm run report:knowledge                          # uses the committed fixtures
 *   npm run report:knowledge -- <catalog.json> <recipes.json>
 *
 * Output: docs/data-quality/product-knowledge.md and docs/data-quality/recipe-knowledge.md
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildCatalog,
  buildRecipeLibrary,
  renderProductQualityReport,
  renderRecipeQualityReport,
  summarizeProductQuality,
  summarizeRecipeQuality,
  type ShopifyArticleInput,
  type ShopifyProductInput,
} from '../packages/core/src/index.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = resolve(root, process.argv[2] ?? 'fixtures/shopify/catalog.2026-11-17.json');
const recipesPath = resolve(root, process.argv[3] ?? 'fixtures/shopify/recipes.2026-11-17.json');

const products = (JSON.parse(readFileSync(catalogPath, 'utf8')) as { products: ShopifyProductInput[] })
  .products;
const articles = (JSON.parse(readFileSync(recipesPath, 'utf8')) as { articles: ShopifyArticleInput[] })
  .articles;

const catalog = buildCatalog(products);
const library = buildRecipeLibrary(articles, catalog);

const outDir = resolve(root, 'docs/data-quality');
mkdirSync(outDir, { recursive: true });
writeFileSync(
  resolve(outDir, 'product-knowledge.md'),
  renderProductQualityReport(catalog, relative(root, catalogPath).replace(/\\/g, '/')),
);
writeFileSync(
  resolve(outDir, 'recipe-knowledge.md'),
  renderRecipeQualityReport(library, catalog, relative(root, recipesPath).replace(/\\/g, '/')),
);

const p = summarizeProductQuality(catalog);
const r = summarizeRecipeQuality(library, catalog);
console.log(
  JSON.stringify(
    {
      products: {
        total: p.totalProducts,
        onlineActive: p.onlineActive,
        recommendable: p.recommendable,
        withConflicts: p.withConflicts,
        conflictsByKey: p.conflictsByKey,
        withLegacyDisagreements: p.withLegacyDisagreements,
      },
      recipes: {
        published: r.publishedArticles,
        structured: r.structuredRecipes,
        withActiveProductLink: r.withActiveProductLink,
        brokenLinkHandles: r.brokenLinks.length,
      },
    },
    null,
    2,
  ),
);
