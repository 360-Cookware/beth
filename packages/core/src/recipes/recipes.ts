import { extractAnchors, htmlToInlineText, htmlToText, normalizeForMatch } from '../text/html.js';
import type { BethProduct, CatalogIndex } from '../products/normalize.js';

/** An article from the "recipes" blog as exported from the Admin API. */
export interface ShopifyArticleInput {
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
  author: string | null;
  /** Metafields in the `recipekit` namespace (Recipe Kit app). */
  recipekitMetafields: { key: string; type: string; value: string }[];
  /** custom.featured_product (product GID) when set. */
  featuredProduct: string | null;
}

/** Recipe Kit JSON (both the legacy `recipe_data` and the per-article `<articleId>` formats). */
interface RecipeKitData {
  recipe_title?: string | null;
  recipe_author?: string | null;
  recipe_description?: string | null;
  recipe_category?: string | null;
  recipe_cuisine?: string | null;
  recipe_ingredients?: { ingredient?: string | null; type?: string | null }[] | null;
  recipe_directions?: { direction?: string | null; type?: string | null }[] | null;
  recipe_instructions?:
    { instruction?: string | null; direction?: string | null; type?: string | null }[] | null;
  recipe_equipment?: unknown[] | null;
  serving_size?: string | null;
  prep_time?: string | null;
  cook_time?: string | null;
  iso_prep_time?: string | null;
  iso_cook_time?: string | null;
  iso_total_time?: string | null;
  recipe_image?: string | null;
  recipe_image_alt_text?: string | null;
  recipe_tags?: unknown[] | null;
  recipe_note?: string | null;
}

export type RecipeProductLinkSource =
  'recipe_description' | 'ingredients' | 'directions' | 'body' | 'featured_product';

export interface RecipeProductLink {
  handle: string;
  source: RecipeProductLinkSource;
  /** Anchor text or matched text, as written in the recipe. */
  text: string | null;
  /** Resolution against the live catalog. */
  status: 'active' | 'inactive' | 'missing' | 'unresolved';
  productId: string | null;
}

export interface RecipeListItem {
  kind: 'item' | 'heading';
  text: string;
}

export interface BethRecipe {
  id: string;
  handle: string;
  title: string;
  url: string;
  published: boolean;
  publishedAt: string | null;
  kind: 'recipe' | 'article';
  image: { url: string; alt: string | null } | null;
  author: string | null;
  description: string | null;
  ingredients: RecipeListItem[];
  directions: RecipeListItem[];
  /** Only set when the recipe states it. Never estimated. */
  prepMinutes: number | null;
  cookMinutes: number | null;
  totalMinutes: number | null;
  servings: string | null;
  category: string | null;
  cuisine: string | null;
  tags: string[];
  notes: string | null;
  productLinks: RecipeProductLink[];
  /** Product names written in "products used" lists without a link (kept for review). */
  unlinkedEquipmentMentions: string[];
  quality: { hasStructuredData: boolean; brokenProductLinks: number };
}

const RECIPE_BLOG_URL = 'https://www.360cookware.com/blogs/recipes/';

/** Parses ISO-8601 durations like PT1H30M / P0D into minutes. Zero or invalid → null. */
export function isoDurationToMinutes(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(iso.trim());
  if (!m) return null;
  const minutes =
    Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) + Number(m[4] ?? 0) / 60;
  return minutes > 0 ? Math.round(minutes) : null;
}

function readRecipeKit(article: ShopifyArticleInput): RecipeKitData | null {
  const numericId = article.id.split('/').pop() ?? '';
  const preferred =
    article.recipekitMetafields.find((m) => m.key === numericId) ??
    article.recipekitMetafields.find((m) => m.key === 'recipe_data') ??
    article.recipekitMetafields[0];
  if (!preferred?.value) return null;
  try {
    const parsed: unknown = JSON.parse(preferred.value);
    return parsed && typeof parsed === 'object' ? (parsed as RecipeKitData) : null;
  } catch {
    return null;
  }
}

function listItems(
  entries: { type?: string | null; [k: string]: unknown }[] | null | undefined,
  field: string[],
): RecipeListItem[] {
  if (!Array.isArray(entries)) return [];
  const out: RecipeListItem[] = [];
  for (const e of entries) {
    const raw = field.map((f) => e[f]).find((v) => typeof v === 'string' && v.trim().length > 0) as
      string | undefined;
    if (!raw) continue;
    const text = htmlToInlineText(raw);
    if (!text) continue;
    out.push({ kind: e.type === 'heading' ? 'heading' : 'item', text });
  }
  return out;
}

const PRODUCT_PATH = /\/products\/([a-z0-9][a-z0-9-]*)/i;

function linksFromHtml(
  html: string | null | undefined,
  source: RecipeProductLinkSource,
): RecipeProductLink[] {
  const out: RecipeProductLink[] = [];
  for (const a of extractAnchors(html)) {
    const m = PRODUCT_PATH.exec(a.href);
    if (m?.[1]) {
      out.push({
        handle: m[1].toLowerCase(),
        source,
        text: a.text || null,
        status: 'unresolved',
        productId: null,
      });
    }
  }
  return out;
}

/** Items listed under a "products/items/cookware used" heading that have no link. */
function unlinkedMentions(descriptionHtml: string | null | undefined): string[] {
  if (!descriptionHtml || !/(products?|items?|cookware|bakeware)[^<]{0,40}used/i.test(descriptionHtml))
    return [];
  const mentions: string[] = [];
  const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let m: RegExpExecArray | null;
  while ((m = liRe.exec(descriptionHtml)) !== null) {
    const inner = m[1] ?? '';
    if (/<a\b/i.test(inner)) continue;
    const text = htmlToInlineText(inner);
    if (text) mentions.push(text);
  }
  return mentions;
}

export function parseRecipeArticle(article: ShopifyArticleInput): BethRecipe {
  const rk = readRecipeKit(article);
  const ingredients = listItems(rk?.recipe_ingredients, ['ingredient']);
  const directions = listItems(rk?.recipe_directions ?? rk?.recipe_instructions, [
    'direction',
    'instruction',
  ]);
  const hasStructuredData = Boolean(rk && (ingredients.length > 0 || directions.length > 0));

  const links: RecipeProductLink[] = [
    ...linksFromHtml(rk?.recipe_description, 'recipe_description'),
    ...linksFromHtml((rk?.recipe_ingredients ?? []).map((i) => i.ingredient ?? '').join(' '), 'ingredients'),
    ...linksFromHtml((rk?.recipe_directions ?? []).map((d) => d.direction ?? '').join(' '), 'directions'),
    ...linksFromHtml(article.body, 'body'),
  ];
  // De-duplicate by handle, keeping the most specific source (description first).
  const seen = new Set<string>();
  const productLinks = links.filter((l) => (seen.has(l.handle) ? false : (seen.add(l.handle), true)));

  const descriptionText = rk?.recipe_description ? htmlToText(rk.recipe_description) : null;
  const description =
    descriptionText
      ?.split('\n')
      .filter((line) => !/^(products?|items?|cookware|bakeware)[^:]{0,40}used/i.test(line))
      .join(' ')
      .trim() || null;

  const prep = isoDurationToMinutes(rk?.iso_prep_time);
  const cook = isoDurationToMinutes(rk?.iso_cook_time);
  const total = isoDurationToMinutes(rk?.iso_total_time);
  const tags = [
    ...article.tags,
    ...((rk?.recipe_tags ?? []).filter((t): t is string => typeof t === 'string') as string[]),
  ];

  return {
    id: article.id,
    handle: article.handle,
    title: (rk?.recipe_title && htmlToInlineText(rk.recipe_title)) || article.title,
    url: `${RECIPE_BLOG_URL}${article.handle}`,
    published: article.isPublished,
    publishedAt: article.publishedAt,
    kind: hasStructuredData ? 'recipe' : 'article',
    image: rk?.recipe_image
      ? { url: rk.recipe_image, alt: rk.recipe_image_alt_text ?? null }
      : article.image
        ? { url: article.image.url, alt: article.image.altText }
        : null,
    author: rk?.recipe_author ? htmlToInlineText(rk.recipe_author) || null : article.author,
    description,
    ingredients,
    directions,
    prepMinutes: prep,
    cookMinutes: cook,
    totalMinutes: total ?? (prep !== null && cook !== null ? prep + cook : null),
    servings: rk?.serving_size?.trim() || null,
    category: rk?.recipe_category?.trim() || null,
    cuisine: rk?.recipe_cuisine?.trim() || null,
    tags: [...new Set(tags.map((t) => t.trim()).filter(Boolean))],
    notes: rk?.recipe_note ? htmlToInlineText(rk.recipe_note) || null : null,
    productLinks,
    unlinkedEquipmentMentions: unlinkedMentions(rk?.recipe_description),
    quality: { hasStructuredData, brokenProductLinks: 0 },
  };
}

/**
 * Resolves recipe → product links against the catalog. Links to products that are
 * missing, drafts, or not on the Online Store are kept (for the data-quality report)
 * but marked so Beth never recommends them.
 */
export function resolveRecipeProducts(
  recipe: BethRecipe,
  catalog: CatalogIndex,
  featuredProductId?: string | null,
): BethRecipe {
  const links = recipe.productLinks.map((l): RecipeProductLink => {
    const p = catalog.byHandle.get(l.handle);
    if (!p) return { ...l, status: 'missing', productId: null };
    return { ...l, status: isActive(p) ? 'active' : 'inactive', productId: p.id };
  });
  if (featuredProductId && !links.some((l) => l.productId === featuredProductId)) {
    const p = catalog.byId.get(featuredProductId);
    links.push({
      handle: p?.handle ?? featuredProductId,
      source: 'featured_product',
      text: p?.title ?? null,
      status: p ? (isActive(p) ? 'active' : 'inactive') : 'missing',
      productId: p?.id ?? null,
    });
  }
  return {
    ...recipe,
    productLinks: links,
    quality: { ...recipe.quality, brokenProductLinks: links.filter((l) => l.status !== 'active').length },
  };
}

function isActive(p: BethProduct): boolean {
  return p.status === 'ACTIVE' && Boolean(p.url);
}

export interface RecipeLibrary {
  recipes: BethRecipe[];
  byHandle: Map<string, BethRecipe>;
  /** Product id → recipes that link to it (active links only). */
  byProductId: Map<string, BethRecipe[]>;
}

export function buildRecipeLibrary(articles: ShopifyArticleInput[], catalog: CatalogIndex): RecipeLibrary {
  const recipes = articles
    .filter((a) => a.isPublished)
    .map((a) => resolveRecipeProducts(parseRecipeArticle(a), catalog, a.featuredProduct));
  const byProductId = new Map<string, BethRecipe[]>();
  for (const r of recipes) {
    for (const l of r.productLinks) {
      if (l.status !== 'active' || !l.productId) continue;
      const list = byProductId.get(l.productId) ?? [];
      if (!list.includes(r)) list.push(r);
      byProductId.set(l.productId, list);
    }
  }
  return { recipes, byHandle: new Map(recipes.map((r) => [r.handle, r])), byProductId };
}

/** Normalized product title used to match unlinked "products used" mentions in reports. */
export function matchMentionToProduct(mention: string, catalog: CatalogIndex): BethProduct | null {
  const target = normalizeForMatch(mention);
  if (target.length < 4) return null;
  let best: BethProduct | null = null;
  for (const p of catalog.products) {
    if (!isActive(p)) continue;
    const t = normalizeForMatch(p.title);
    if (t === target) return p;
    if (!best && (t.startsWith(target) || target.startsWith(t))) best = p;
  }
  return best;
}
