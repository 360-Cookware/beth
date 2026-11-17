/**
 * Admin GraphQL documents used by the knowledge sync (Admin API 2026-10).
 *
 * Everything here is read-only. The only mutation, `bulkOperationRunQuery`, starts an
 * export job; it does not change store data.
 *
 * Metafields are requested by explicit namespace/key. Some app metafields (for example
 * Yotpo review caches) are several hundred KB per product, so the metafield index only
 * selects `namespace`, `key` and `type`, never `value`.
 */
import type { ShopifyProductMetafields } from '../products/shopify-types.js';

export const ADMIN_API_VERSION = '2026-10';

/** Product metafields Beth reads, as `alias: [namespace, key]`. Verified against the 2026-11-17 export. */
export const PRODUCT_METAFIELD_ALIASES = {
  specTable: ['accentuate', 'ingredients'],
  includes: ['accentuate', 'includes'],
  shortDetails: ['accentuate', 'short_details'],
  ptabs: ['ptabs', 'tabs'],
  care: ['CW360_faq', 'care__product_guides'],
  customTitle: ['custom', 'product_title'],
  bf2026: ['custom', 'bf2026_discount'],
  rating: ['reviews', 'rating'],
  ratingCount: ['reviews', 'rating_count'],
  related: ['shopify--discovery--product_recommendation', 'related_products'],
  complementary: ['shopify--discovery--product_recommendation', 'complementary_products'],
  upgradeToSet: ['accentuate', 'product_for_upgrade_to_set'],
  setInclude: ['CW360SetInclude', 'setInclude_product'],
  bundleSet: ['CW360BundleSet', 'product'],
} as const satisfies Record<keyof ShopifyProductMetafields, readonly [string, string]>;

export type ProductMetafieldAlias = keyof typeof PRODUCT_METAFIELD_ALIASES;

export const PRODUCT_METAFIELD_ALIAS_KEYS = Object.keys(PRODUCT_METAFIELD_ALIASES) as ProductMetafieldAlias[];

const METAFIELD_SELECTIONS = PRODUCT_METAFIELD_ALIAS_KEYS.map((alias) => {
  const [namespace, key] = PRODUCT_METAFIELD_ALIASES[alias];
  return `${alias}: metafield(namespace: "${namespace}", key: "${key}") { value }`;
}).join('\n    ');

const PRODUCT_FIELDS = `id
    legacyResourceId
    handle
    title
    status
    productType
    vendor
    tags
    templateSuffix
    onlineStoreUrl
    publishedAt
    updatedAt
    totalInventory
    tracksInventory
    isGiftCard
    requiresSellingPlan
    descriptionHtml
    category { fullName }
    options { name values }
    priceRangeV2 { minVariantPrice { amount } maxVariantPrice { amount } }
    featuredMedia { preview { image { url altText width height } } }
    mediaCount { count }
    ${METAFIELD_SELECTIONS}`;

const VARIANT_FIELDS = `id
      legacyResourceId
      title
      sku
      price
      compareAtPrice
      availableForSale
      inventoryQuantity
      inventoryPolicy
      selectedOptions { name value }`;

/** One product, used by webhook-driven refreshes. Query cost is well under the 1,000-point limit. */
export const PRODUCT_BY_ID_QUERY = `#graphql
query BethProduct($id: ID!) {
  product(id: $id) {
    ${PRODUCT_FIELDS}
    collections(first: 100) { nodes { handle } }
    mfIndex: metafields(first: 100) { nodes { namespace key type } }
    variants(first: 100) { nodes { ${VARIANT_FIELDS} } }
  }
}`;

/**
 * Full catalog export for `bulkOperationRunQuery`. Nested connection nodes select `id` so the
 * JSONL lines can be re-attached to their parent by GID type (see `assembleBulkProducts`).
 */
export const PRODUCTS_BULK_QUERY = `{
  products {
    edges {
      node {
    ${PRODUCT_FIELDS}
        collections { edges { node { id handle } } }
        metafields { edges { node { id namespace key type } } }
        variants { edges { node { ${VARIANT_FIELDS} } } }
      }
    }
  }
}`;

/** `groupObjects` is required (non-null) in 2026-10. Ungrouped output is faster and is what `assembleBulkProducts` expects. */
export const BULK_RUN_QUERY_MUTATION = `#graphql
mutation BethBulkProducts($query: String!) {
  bulkOperationRunQuery(query: $query, groupObjects: false) {
    bulkOperation { id status }
    userErrors { field message }
  }
}`;

export const BULK_OPERATION_STATUS_QUERY = `#graphql
query BethBulkStatus($id: ID!) {
  node(id: $id) {
    ... on BulkOperation { id status errorCode objectCount fileSize url partialDataUrl createdAt completedAt }
  }
}`;

/** Finds the recipes blog by handle (default `recipes`). */
export const BLOG_BY_HANDLE_QUERY = `#graphql
query BethBlog($query: String!) {
  blogs(first: 5, query: $query) { nodes { id handle title } }
}`;

const ARTICLE_FIELDS = `id
      title
      handle
      publishedAt
      isPublished
      tags
      templateSuffix
      image { url altText }
      summary
      body
      author { name }
      rk: metafields(namespace: "recipekit", first: 10) { nodes { key type value } }
      featured: metafield(namespace: "custom", key: "featured_product") { value }`;

/** Articles of one blog, paginated (`query: "blog_id:<numeric id>"`). */
export const ARTICLES_PAGE_QUERY = `#graphql
query BethArticles($first: Int!, $after: String, $query: String!) {
  articles(first: $first, after: $after, query: $query) {
    pageInfo { hasNextPage endCursor }
    nodes {
      ${ARTICLE_FIELDS}
      blog { id }
    }
  }
}`;

export const ARTICLE_BY_ID_QUERY = `#graphql
query BethArticle($id: ID!) {
  article(id: $id) {
    ${ARTICLE_FIELDS}
    blog { id }
  }
}`;

/** Maps an inventory item (inventory_levels/update webhook) to its product. */
export const INVENTORY_ITEM_PRODUCT_QUERY = `#graphql
query BethInventoryItemProduct($id: ID!) {
  inventoryItem(id: $id) { id variant { id product { id } } }
}`;
