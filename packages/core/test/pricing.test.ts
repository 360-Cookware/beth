import { describe, expect, it } from 'vitest';
import { normalizeProduct } from '../src/products/normalize.js';
import { applyVisualPromotion, formatMoney, isPromotionActive } from '../src/pricing/promotions.js';
import { productByHandle } from './fixtures.js';

describe('visual promotion (mirrors snippets/price.liquid BF2026)', () => {
  it('matches the live product page for the 3.5 Qt Sauté Pan ($232.36, save $47.59)', () => {
    const p = normalizeProduct(productByHandle('stainless-steel-3-5-quart-saute-pan-with-cover'));
    expect(p.promotion).toEqual({ code: 'BF2026', percent: 17 });
    const price = applyVisualPromotion(p.minPriceCents, p.promotion);
    expect(price).toEqual({
      code: 'BF2026',
      percent: 17,
      originalCents: 27995,
      saveCents: 4759,
      finalCents: 23236,
    });
    expect(formatMoney(price!.finalCents)).toBe('$232.36');
    expect(formatMoney(price!.saveCents)).toBe('$47.59');
  });

  it('floors the saving like Liquid `floor`', () => {
    expect(applyVisualPromotion(9995, { code: 'X', percent: 21 })?.saveCents).toBe(2098);
  });

  it('respects the merchant switch and date window', () => {
    const now = new Date('2026-11-20T12:00:00Z');
    expect(isPromotionActive({ enabled: false, code: 'BF2026' }, now)).toBe(false);
    expect(isPromotionActive({ enabled: true, code: 'BF2026', endsAt: '2026-11-19T00:00:00Z' }, now)).toBe(
      false,
    );
    expect(isPromotionActive({ enabled: true, code: 'BF2026', startsAt: '2026-11-01T00:00:00Z' }, now)).toBe(
      true,
    );
  });
});
