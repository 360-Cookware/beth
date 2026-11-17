/**
 * Maps raw Admin GraphQL nodes (from the queries in `admin-queries.ts`) to the input
 * shapes the knowledge engines consume. Pure functions, no I/O.
 *
 * The mapping reproduces the recorded fixtures exactly (see test/admin-mapping.test.ts),
 * so live sync and fixture-based tests run through the same engines.
 */
import type {
  ShopifyProductInput,
  ShopifyProductMetafields,
  ShopifyVariantInput,
} from '../products/shopify-types.js';
import type { ShopifyArticleInput } from '../recipes/recipes.js';
import { PRODUCT_METAFIELD_ALIAS_KEYS } from './admin-queries.js';

type ValueNode = { value: string | null } | null | undefined;
type Nodes<T> = { nodes: T[] } | null | undefined;

type ProductScalarFields = Omit<
  ShopifyProductInput,
  'collections' | 'metafieldKeys' | 'metafields' | 'variants'
>;

/** Product node as returned by `PRODUCT_BY_ID_QUERY` (or re-assembled from bulk JSONL). */
export type AdminProductNode = ProductScalarFields & {
  collections?: Nodes<{ handle: string }>;
  mfIndex?: Nodes<{ namespace: string; key: string; type?: string }>;
  variants?: Nodes<ShopifyVariantInput>;
} & { [K in keyof ShopifyProductMetafields]?: ValueNode };

/** Article node as returned by `ARTICLES_PAGE_QUERY` / `ARTICLE_BY_ID_QUERY`. */
export interface AdminArticleNode {
  id: string;
  title: string;
  handle: string;
  publishedAt: string | null;
  isPublished: boolean;
  tags: string[];
  templateSuffix: string | null;
  image: { url: string; altText: string | null } | null;
  summary: string | null;
  body: string | null;
  author?: { name: string | null } | null;
  rk?: Nodes<{ key: string; type: string; value: string }>;
  featured?: ValueNode;
  blog?: { id: string } | null;
}

function mapVariant(v: ShopifyVariantInput): ShopifyVariantInput {
  return {
    id: v.id,
    legacyResourceId: v.legacyResourceId,
    title: v.title,
    sku: v.sku,
    price: v.price,
    compareAtPrice: v.compareAtPrice,
    availableForSale: v.availableForSale,
    inventoryQuantity: v.inventoryQuantity,
    inventoryPolicy: v.inventoryPolicy,
    selectedOptions: v.selectedOptions.map((o) => ({ name: o.name, value: o.value })),
  };
}

export function mapProductNode(node: AdminProductNode): ShopifyProductInput {
  const metafields = {} as ShopifyProductMetafields;
  for (const alias of PRODUCT_METAFIELD_ALIAS_KEYS) {
    metafields[alias] = node[alias]?.value ?? null;
  }
  const keys = new Set((node.mfIndex?.nodes ?? []).map((m) => `${m.namespace}.${m.key}`));

  return {
    id: node.id,
    legacyResourceId: node.legacyResourceId,
    handle: node.handle,
    title: node.title,
    status: node.status,
    productType: node.productType,
    vendor: node.vendor,
    tags: [...node.tags],
    templateSuffix: node.templateSuffix,
    onlineStoreUrl: node.onlineStoreUrl,
    publishedAt: node.publishedAt,
    updatedAt: node.updatedAt,
    totalInventory: node.totalInventory,
    tracksInventory: node.tracksInventory,
    isGiftCard: node.isGiftCard,
    requiresSellingPlan: node.requiresSellingPlan,
    descriptionHtml: node.descriptionHtml,
    category: node.category,
    options: node.options,
    priceRangeV2: node.priceRangeV2,
    featuredMedia: node.featuredMedia,
    mediaCount: node.mediaCount,
    collections: (node.collections?.nodes ?? []).map((c) => c.handle),
    metafieldKeys: [...keys].sort(),
    metafields,
    variants: (node.variants?.nodes ?? []).map(mapVariant),
  };
}

export function mapArticleNode(node: AdminArticleNode): ShopifyArticleInput {
  return {
    id: node.id,
    title: node.title,
    handle: node.handle,
    publishedAt: node.publishedAt,
    isPublished: node.isPublished,
    tags: [...node.tags],
    templateSuffix: node.templateSuffix,
    image: node.image,
    summary: node.summary,
    body: node.body,
    author: node.author?.name ?? null,
    recipekitMetafields: (node.rk?.nodes ?? []).map((m) => ({ key: m.key, type: m.type, value: m.value })),
    featuredProduct: node.featured?.value ?? null,
  };
}

const GID_PREFIX = {
  variant: 'gid://shopify/ProductVariant/',
  collection: 'gid://shopify/Collection/',
  metafield: 'gid://shopify/Metafield/',
} as const;

export interface BulkAssemblyResult {
  products: AdminProductNode[];
  /** Child lines whose parent was not found, or whose type is unknown. Should be 0. */
  orphanLines: number;
}

/**
 * Re-assembles the JSONL output of `PRODUCTS_BULK_QUERY`. Bulk operations flatten nested
 * connections into separate lines that carry `__parentId`, so children are attached to their
 * product by GID type. Order of children is preserved.
 */
export function assembleBulkProducts(jsonl: string): BulkAssemblyResult {
  const products: AdminProductNode[] = [];
  const byId = new Map<string, AdminProductNode>();
  const children: Record<string, unknown>[] = [];

  for (const line of jsonl.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const obj = JSON.parse(trimmed) as Record<string, unknown>;
    if (typeof obj['__parentId'] === 'string') {
      children.push(obj);
      continue;
    }
    const node = {
      ...(obj as unknown as AdminProductNode),
      collections: { nodes: [] },
      mfIndex: { nodes: [] },
      variants: { nodes: [] },
    } as AdminProductNode;
    products.push(node);
    byId.set(node.id, node);
  }

  let orphanLines = 0;
  for (const child of children) {
    const parent = byId.get(child['__parentId'] as string);
    const id = typeof child['id'] === 'string' ? child['id'] : '';
    if (!parent) {
      orphanLines++;
      continue;
    }
    if (id.startsWith(GID_PREFIX.variant)) {
      const { __parentId: _p, ...variant } = child;
      parent.variants!.nodes.push(variant as unknown as ShopifyVariantInput);
    } else if (id.startsWith(GID_PREFIX.collection)) {
      parent.collections!.nodes.push({ handle: String(child['handle']) });
    } else if (id.startsWith(GID_PREFIX.metafield)) {
      parent.mfIndex!.nodes.push({
        namespace: String(child['namespace']),
        key: String(child['key']),
        type: typeof child['type'] === 'string' ? child['type'] : undefined,
      });
    } else {
      orphanLines++;
    }
  }
  return { products, orphanLines };
}

/** Numeric ID from a Shopify GID (`gid://shopify/Blog/6989819` → `6989819`). */
export function legacyIdFromGid(gid: string): string {
  const id = gid.split('/').pop() ?? '';
  return id.split('?')[0] ?? '';
}
