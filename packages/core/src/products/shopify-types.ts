/**
 * Shape of a product as exported by the Admin GraphQL catalog query used by the
 * knowledge sync (see docs/01-technical-architecture.md, "Product knowledge layer").
 *
 * Only fields Beth needs are included. Metafields are fetched by explicit
 * namespace/key so the payload stays small (some app metafields, such as Yotpo
 * review caches, are several hundred KB per product and are intentionally
 * excluded).
 */
export interface ShopifyMoney {
  amount: string;
}

export interface ShopifyImage {
  url: string;
  altText: string | null;
  width: number | null;
  height: number | null;
}

export interface ShopifyVariantInput {
  id: string;
  legacyResourceId: string;
  title: string;
  sku: string | null;
  price: string;
  compareAtPrice: string | null;
  availableForSale: boolean;
  inventoryQuantity: number | null;
  inventoryPolicy: 'DENY' | 'CONTINUE' | string;
  selectedOptions: { name: string; value: string }[];
}

/** Product metafields Beth reads, keyed by the alias used in the export query. */
export interface ShopifyProductMetafields {
  /** accentuate.ingredients — the "Full product details" spec table rendered on the PDP. */
  specTable: string | null;
  /** accentuate.includes — "What's included", rendered on the PDP. */
  includes: string | null;
  /** accentuate.short_details — PDP intro copy (JSON array of HTML strings). */
  shortDetails: string | null;
  /** ptabs.tabs — legacy Product Tabs content. NOT rendered by the live theme. */
  ptabs: string | null;
  /** CW360_faq.care__product_guides — "Care & Product Guides" (JSON {en, es}). */
  care: string | null;
  /** custom.product_title */
  customTitle: string | null;
  /** custom.bf2026_discount — percent used by the BF2026 visual price in the theme. */
  bf2026: string | null;
  /** reviews.rating — JSON {value, scale_min, scale_max}. */
  rating: string | null;
  /** reviews.rating_count */
  ratingCount: string | null;
  related: string | null;
  complementary: string | null;
  upgradeToSet: string | null;
  setInclude: string | null;
  bundleSet: string | null;
}

export interface ShopifyProductInput {
  id: string;
  legacyResourceId: string;
  handle: string;
  title: string;
  status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED' | 'UNLISTED' | string;
  productType: string;
  vendor: string;
  tags: string[];
  templateSuffix: string | null;
  onlineStoreUrl: string | null;
  publishedAt: string | null;
  updatedAt: string;
  totalInventory: number | null;
  tracksInventory: boolean;
  isGiftCard: boolean;
  requiresSellingPlan?: boolean;
  descriptionHtml: string | null;
  category: { fullName: string } | null;
  options: { name: string; values: string[] }[];
  priceRangeV2: { minVariantPrice: ShopifyMoney; maxVariantPrice: ShopifyMoney };
  featuredMedia: { preview: { image: ShopifyImage | null } | null } | null;
  mediaCount?: { count: number };
  collections: string[];
  metafieldKeys?: string[];
  metafields: ShopifyProductMetafields;
  variants: ShopifyVariantInput[];
}
