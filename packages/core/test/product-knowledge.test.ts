import { describe, expect, it } from 'vitest';
import { extractFromDescription, extractFromSpecTable, extractFromTitle } from '../src/products/extract.js';
import { mergeObservations } from '../src/products/merge.js';
import { buildCatalog, normalizeProduct } from '../src/products/normalize.js';
import {
  parseFahrenheit,
  parseInches,
  parseInduction,
  parseMaterial,
  parseQuarts,
} from '../src/products/parse-values.js';
import { summarizeProductQuality } from '../src/products/quality-report.js';
import { loadCatalogFixture, productByHandle } from './fixtures.js';

describe('value parsers', () => {
  it('parses inches, quarts, temperatures, materials, induction', () => {
    expect(parseInches('12.17"')).toBe(12.17);
    expect(parseInches('2-3/4"')).toBe(2.75);
    expect(parseQuarts('3.5 Quart Sauté Pan')).toBe(3.5);
    expect(parseFahrenheit('Up to 500°F')).toBe(500);
    expect(parseMaterial('T-316 Surgical Grade Stainless Steel').grades).toEqual([316]);
    expect(parseMaterial('T-316 T-304 and Surgical Grade Stainless Steel').grades).toEqual([304, 316]);
    expect(parseInduction('All, including induction')).toBe(true);
    expect(parseInduction('Not compatible with induction')).toBe(false);
    expect(parseInduction('Gas and electric')).toBeNull();
  });
});

describe('source extractors', () => {
  it('reads the PDP spec table', () => {
    const p = productByHandle('stainless-steel-3-5-quart-saute-pan-with-cover');
    const { observations, other } = extractFromSpecTable(p.metafields.specTable);
    const byKey = Object.fromEntries(observations.map((o) => [o.key, o.value]));
    expect(byKey.cookingDiameterIn).toBe(10.5);
    expect(byKey.rimDiameterIn).toBe(12.17);
    expect(byKey.insideHeightIn).toBe(2.5);
    expect(byKey.ovenSafeMaxF).toBe(500);
    expect(byKey.inductionCompatible).toBe(true);
    expect(byKey.material).toMatchObject({ grades: [316] });
    expect(other).toEqual([]);
  });

  it('reads explicit statements from the description', () => {
    const p = productByHandle('stainless-steel-3-5-quart-saute-pan-with-cover');
    const keys = extractFromDescription(p.descriptionHtml).map((o) => o.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'cookingDiameterIn',
        'ovenSafeMaxF',
        'inductionCompatible',
        'material',
        'madeIn',
      ]),
    );
  });

  it('reads capacity, size and cover from titles', () => {
    expect(extractFromTitle('3.5 Quart Sauté Pan with Cover').map((o) => [o.key, o.value])).toEqual([
      ['capacityQt', 3.5],
      ['coverIncluded', true],
    ]);
    expect(extractFromTitle('10 Inch Fry Pan').map((o) => [o.key, o.value])).toEqual([['nominalSizeIn', 10]]);
    expect(extractFromTitle('9" x 13" Bake & Roast Pan with Handles')[0]).toMatchObject({
      key: 'nominalDimensionsIn',
      value: { a: 9, b: 13 },
    });
  });

  it('never lets legacy-only data become a fact', () => {
    const merged = mergeObservations([
      { key: 'dishwasherRecommended', value: true, raw: 'Dishwasher Safe', source: 'legacy_tabs' },
    ]);
    expect(merged.specs.dishwasherRecommended).toBeUndefined();
  });

  it('marks shopper-visible disagreements as conflicts with no value', () => {
    const merged = mergeObservations([
      { key: 'material', value: parseMaterial('T-316 Surgical Grade'), raw: 'T-316', source: 'spec_table' },
      { key: 'material', value: parseMaterial('T-304 Surgical Grade'), raw: 'T-304', source: 'description' },
    ]);
    expect(merged.specs.material).toMatchObject({ status: 'conflict', value: null });
    expect(merged.conflicts).toHaveLength(1);
  });
});

describe('normalizeProduct on the real catalog', () => {
  it('3.5 Quart Sauté Pan with Cover: verified specs, legacy data flagged', () => {
    const p = normalizeProduct(productByHandle('stainless-steel-3-5-quart-saute-pan-with-cover'));
    expect(p.kind).toBe('cookware');
    expect(p.recommendable).toBe(true);
    expect(p.minPriceCents).toBe(27995);
    expect(p.specs.capacityQt).toMatchObject({ status: 'verified', value: 3.5 });
    expect(p.specs.cookingDiameterIn).toMatchObject({ status: 'verified', value: 10.5 });
    expect(p.specs.ovenSafeMaxF).toMatchObject({ status: 'verified', value: 500 });
    expect(p.specs.inductionCompatible).toMatchObject({ status: 'verified', value: true });
    expect(p.specs.coverIncluded).toMatchObject({ status: 'verified', value: true });
    expect(p.specs.material).toMatchObject({ status: 'verified', value: { grades: [316] } });
    // Care guide: "We do not recommend dishwasher use"
    expect(p.specs.dishwasherRecommended).toMatchObject({ status: 'verified', value: false });
    // Legacy ptabs says T-304 and "Dishwasher Safe" — flagged, not used.
    const legacyKeys = p.quality.legacyDisagreements.map((d) => d.key);
    expect(legacyKeys).toEqual(expect.arrayContaining(['material', 'dishwasherRecommended']));
    expect(p.includes).toEqual(
      expect.arrayContaining(['Stainless Steel Cover', 'Certificate of Authenticity']),
    );
  });

  it('8.5 Inch Fry Pan: description (T-304) contradicts spec table (T-316) → conflict', () => {
    const p = normalizeProduct(productByHandle('stainless-steel-8-5-inch-fry-pan'));
    expect(p.specs.material?.status).toBe('conflict');
    expect(p.specs.material?.value).toBeNull();
    expect(p.quality.conflicts.find((c) => c.key === 'material')?.variants).toHaveLength(2);
  });

  it('a less specific handle statement does not create a conflict', () => {
    const p = normalizeProduct(productByHandle('stainless-steel-10-inch-fry-pan'));
    expect(p.specs.handleStyle).toMatchObject({ status: 'verified', display: 'Stay Cool Long Handle' });
  });

  it('per-piece dimensions in a set table are kept for display, not merged', () => {
    const p = normalizeProduct(productByHandle('fathers-day-limited-edition-grilling-set'));
    expect(p.kind).toBe('set');
    expect(p.quality.conflicts).toEqual([]);
    expect(p.specs.rimDiameterIn).toBeUndefined();
    expect(p.otherSpecs.length).toBeGreaterThan(0);
  });

  it('coming-soon products are not recommendable', () => {
    const p = normalizeProduct(productByHandle('4-quart-stock-pot-with-cover-fat-free-rack'));
    expect(p.comingSoon).toBe(true);
    expect(p.recommendable).toBe(false);
    expect(p.notRecommendableReasons.join(' ')).toMatch(/coming soon/);
  });

  it('reads Yotpo-synced ratings', () => {
    const p = normalizeProduct(productByHandle('stainless-steel-3-5-quart-saute-pan-with-cover'));
    expect(p.rating?.average).toBeGreaterThan(4);
    expect(p.rating?.count).toBeGreaterThan(0);
  });

  it('catalog summary matches the audit', () => {
    const catalog = buildCatalog(loadCatalogFixture());
    const s = summarizeProductQuality(catalog);
    expect(s.totalProducts).toBe(275);
    expect(s.onlineActive).toBe(139);
    expect(s.byKind.flatware).toBe(54);
    expect(s.withConflicts).toBeGreaterThan(0);
    expect(s.withLegacyDisagreements).toBeGreaterThan(20);
  });
});
