import type { SpecObservation } from './extract.js';
import {
  formatSpecValue,
  NON_AUTHORITATIVE_SOURCES,
  SOURCE_PRECEDENCE,
  specValuesAgree,
  type SpecKey,
  type SpecSource,
  type SpecValue,
} from './spec-schema.js';

/**
 * A spec as Beth may use it.
 *
 * - `verified`: at least one shopper-visible source states it and no other
 *   shopper-visible source contradicts it. Beth may state it (and cite the source).
 * - `conflict`: shopper-visible sources disagree. `value` is null; Beth must say she
 *   cannot verify it and point to the product page / customer care instead of guessing.
 */
export interface SpecField {
  key: SpecKey;
  status: 'verified' | 'conflict';
  value: SpecValue | null;
  display: string | null;
  /** Sources that agree with `value` (empty for conflicts). */
  sources: SpecSource[];
  observations: SpecObservation[];
}

export interface SpecConflict {
  key: SpecKey;
  /** Distinct values with the sources that state them. */
  variants: { display: string; sources: SpecSource[]; raw: string[] }[];
}

/** A shopper-visible value that disagrees only with stale, non-rendered legacy data. */
export interface LegacyDisagreement {
  key: SpecKey;
  verifiedDisplay: string;
  legacyDisplay: string;
  legacyRaw: string;
}

export interface MergeResult {
  specs: Partial<Record<SpecKey, SpecField>>;
  conflicts: SpecConflict[];
  legacyDisagreements: LegacyDisagreement[];
}

function rank(source: SpecSource): number {
  const i = SOURCE_PRECEDENCE.indexOf(source);
  return i === -1 ? SOURCE_PRECEDENCE.length : i;
}

interface Cluster {
  value: SpecValue;
  observations: SpecObservation[];
}

function clusterObservations(key: SpecKey, list: SpecObservation[]): Cluster[] {
  const clusters: Cluster[] = [];
  for (const o of [...list].sort((a, b) => rank(a.source) - rank(b.source))) {
    const hit = clusters.find((c) => specValuesAgree(key, c.value, o.value));
    if (hit) {
      hit.observations.push(o);
      // Prefer the most specific text (e.g. "Stay Cool Long Handle" over "Stay Cool Handle").
      if (typeof hit.value === 'string' && typeof o.value === 'string' && o.value.length > hit.value.length) {
        hit.value = o.value;
      }
      // Prefer the most specific material statement (one that names grades).
      if (
        typeof hit.value === 'object' &&
        hit.value !== null &&
        'grades' in hit.value &&
        typeof o.value === 'object' &&
        'grades' in o.value &&
        hit.value.grades.length === 0 &&
        o.value.grades.length > 0
      ) {
        hit.value = o.value;
      }
    } else {
      clusters.push({ value: o.value, observations: [o] });
    }
  }
  return clusters;
}

export function mergeObservations(observations: SpecObservation[]): MergeResult {
  const byKey = new Map<SpecKey, SpecObservation[]>();
  for (const o of observations) {
    const list = byKey.get(o.key) ?? [];
    list.push(o);
    byKey.set(o.key, list);
  }

  const result: MergeResult = { specs: {}, conflicts: [], legacyDisagreements: [] };

  for (const [key, list] of byKey) {
    const authoritative = list.filter((o) => !NON_AUTHORITATIVE_SOURCES.has(o.source));
    const legacy = list.filter((o) => NON_AUTHORITATIVE_SOURCES.has(o.source));
    if (authoritative.length === 0) continue; // legacy-only data never becomes a fact

    const clusters = clusterObservations(key, authoritative);
    if (clusters.length === 1) {
      const c = clusters[0]!;
      const display = formatSpecValue(key, c.value);
      result.specs[key] = {
        key,
        status: 'verified',
        value: c.value,
        display,
        sources: [...new Set(c.observations.map((o) => o.source))],
        observations: list,
      };
      for (const l of legacy) {
        if (!specValuesAgree(key, c.value, l.value)) {
          result.legacyDisagreements.push({
            key,
            verifiedDisplay: display,
            legacyDisplay: formatSpecValue(key, l.value),
            legacyRaw: l.raw,
          });
        }
      }
    } else {
      result.specs[key] = {
        key,
        status: 'conflict',
        value: null,
        display: null,
        sources: [],
        observations: list,
      };
      result.conflicts.push({
        key,
        variants: clusters.map((c) => ({
          display: formatSpecValue(key, c.value),
          sources: [...new Set(c.observations.map((o) => o.source))],
          raw: c.observations.map((o) => o.raw),
        })),
      });
    }
  }
  return result;
}
