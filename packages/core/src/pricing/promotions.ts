/**
 * Visual promotion pricing.
 *
 * The live theme (snippets/price.liquid, "BF2026") shows a *visual* sale price
 * computed from the product metafield `custom.bf2026_discount` (a percent), while
 * the real discount is applied at checkout by the code BF2026 (auto-applied by
 * snippets/bf2026-auto-apply.liquid). Product prices are not changed in Shopify.
 *
 * Beth must show exactly what the product page shows, so this module mirrors the
 * theme's Liquid arithmetic:
 *
 *   bf_save = price_cents × pct ÷ 100.0, floored  (Liquid: times | divided_by: 100.0 | floor)
 *   price   = price_cents − bf_save
 *
 * Whether a promotion is active is configuration (merchant controlled), never
 * inferred by the model.
 */
export interface VisualPromotion {
  /** Promotion identifier, e.g. the discount code the checkout applies. */
  code: string;
  percent: number;
}

export interface PromotionPrice {
  code: string;
  percent: number;
  originalCents: number;
  saveCents: number;
  finalCents: number;
}

export function visualPromotionFromPercent(code: string, percent: number): VisualPromotion | null {
  if (!Number.isFinite(percent) || percent <= 0 || percent >= 100) return null;
  return { code, percent };
}

export function applyVisualPromotion(
  priceCents: number,
  promo: VisualPromotion | null,
): PromotionPrice | null {
  if (!promo || priceCents <= 0) return null;
  const saveCents = Math.floor((priceCents * promo.percent) / 100);
  return {
    code: promo.code,
    percent: promo.percent,
    originalCents: priceCents,
    saveCents,
    finalCents: priceCents - saveCents,
  };
}

/** Formats cents as a currency string, e.g. 27995 → "$279.95". */
export function formatMoney(cents: number, currency = 'USD', locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
}

export interface PromotionConfig {
  /** Master switch, controlled by the merchant in Beth settings. */
  enabled: boolean;
  code: string;
  /** Optional ISO window. Outside it, the promotion is ignored even if enabled. */
  startsAt?: string;
  endsAt?: string;
}

export function isPromotionActive(config: PromotionConfig, now: Date = new Date()): boolean {
  if (!config.enabled) return false;
  if (config.startsAt && now < new Date(config.startsAt)) return false;
  if (config.endsAt && now > new Date(config.endsAt)) return false;
  return true;
}
