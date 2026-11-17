/**
 * UI block protocol (architecture §6). The widget renders these deterministically.
 * Providers never send HTML: only these typed blocks, built from verified store data.
 */

export interface ProductCardVariant {
  /** Numeric variant ID, as used by the Ajax Cart API. */
  id: string;
  title: string;
  available: boolean;
}

export interface ProductCard {
  handle: string;
  title: string;
  url: string;
  image: { url: string; alt: string | null } | null;
  /** Snapshot price in the shop currency. The widget refreshes it live in the shopper's currency. */
  priceCents: number;
  maxPriceCents: number;
  currency: string;
  rating: { average: number; count: number } | null;
  /** Verified spec facts only, e.g. "Capacity: 4 qt". */
  highlights: string[];
  variants: ProductCardVariant[];
  available: boolean;
  /** Optional role label, e.g. "Best match". */
  label?: string;
}

export interface ComparisonColumn {
  handle: string;
  title: string;
  url: string;
}

export interface ComparisonRow {
  label: string;
  /** One value per column. null means "Not stated" (unknown or conflicting data). */
  values: (string | null)[];
}

export interface RecipeCard {
  handle: string;
  title: string;
  url: string;
  image: { url: string; alt: string | null } | null;
  totalMinutes: number | null;
  servings: string | null;
  /** Active 360 Cookware products the recipe links to. */
  products: { handle: string; title: string; url: string }[];
}

export type Block =
  | { type: 'text'; text: string }
  | { type: 'product_cards'; products: ProductCard[] }
  | { type: 'comparison'; columns: ComparisonColumn[]; rows: ComparisonRow[] }
  | { type: 'recipe_cards'; recipes: RecipeCard[] }
  | { type: 'notice'; tone: 'info' | 'warning'; text: string }
  | { type: 'quick_replies'; options: string[] };

export type BlockType = Block['type'];
