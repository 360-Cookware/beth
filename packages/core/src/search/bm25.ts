import { normalizeForMatch } from '../text/html.js';

/**
 * Small in-memory BM25 index. The catalog (~140 online products) and recipe
 * library (~260 published articles) are small enough to search in memory on every
 * request with sub-millisecond latency, so no external search service is needed.
 */

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'i',
  'in',
  'is',
  'it',
  'its',
  'me',
  'my',
  'of',
  'on',
  'or',
  'our',
  'so',
  'that',
  'the',
  'this',
  'to',
  'up',
  'us',
  'we',
  'what',
  'with',
  'you',
  'your',
  'need',
  'want',
  'looking',
  'something',
  'some',
  'can',
  'do',
  'does',
  'show',
  'give',
  'make',
  'get',
  'have',
]);

const SYNONYMS: Record<string, string[]> = {
  skillet: ['fry', 'pan'],
  frying: ['fry'],
  saute: ['saute', 'sauté'],
  pot: ['pot', 'stockpot', 'stock'],
  stockpot: ['stock', 'pot'],
  lid: ['cover'],
  sheet: ['sheet', 'cookie'],
  tray: ['sheet', 'jelly', 'roll'],
  casserole: ['casserole', 'bake', 'roast'],
  roasting: ['roast'],
  baking: ['bake', 'bakeware'],
  soup: ['soup', 'stock', 'pot'],
  pasta: ['pasta', 'stock', 'pot'],
  eggs: ['egg', 'fry'],
};

export function tokenize(text: string): string[] {
  const norm = normalizeForMatch(text).replace(/\./g, ' ');
  const tokens: string[] = [];
  for (const raw of norm.split(' ')) {
    if (!raw || STOPWORDS.has(raw)) continue;
    const t = raw.length > 4 && raw.endsWith('s') && !raw.endsWith('ss') ? raw.slice(0, -1) : raw;
    tokens.push(t);
  }
  return tokens;
}

export function expandQuery(tokens: string[]): string[] {
  const out = new Set(tokens);
  for (const t of tokens) for (const s of SYNONYMS[t] ?? []) out.add(s);
  return [...out];
}

export interface BM25Doc {
  id: string;
  /** Weighted fields: text repeated `weight` times. */
  fields: { text: string; weight: number }[];
}

export class BM25Index {
  private readonly docs: { id: string; tf: Map<string, number>; length: number }[] = [];
  private readonly df = new Map<string, number>();
  private avgLength = 0;

  constructor(
    docs: BM25Doc[],
    private readonly k1 = 1.2,
    private readonly b = 0.75,
  ) {
    let total = 0;
    for (const d of docs) {
      const tf = new Map<string, number>();
      let length = 0;
      for (const f of d.fields) {
        for (const tok of tokenize(f.text)) {
          tf.set(tok, (tf.get(tok) ?? 0) + f.weight);
          length += f.weight;
        }
      }
      for (const tok of tf.keys()) this.df.set(tok, (this.df.get(tok) ?? 0) + 1);
      this.docs.push({ id: d.id, tf, length });
      total += length;
    }
    this.avgLength = this.docs.length ? total / this.docs.length : 0;
  }

  search(query: string, limit = 20): { id: string; score: number }[] {
    const terms = expandQuery(tokenize(query));
    if (terms.length === 0) return [];
    const n = this.docs.length;
    const scored: { id: string; score: number }[] = [];
    for (const d of this.docs) {
      let score = 0;
      for (const term of terms) {
        const f = d.tf.get(term);
        if (!f) continue;
        const df = this.df.get(term) ?? 0;
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
        score +=
          (idf * (f * (this.k1 + 1))) /
          (f + this.k1 * (1 - this.b + (this.b * d.length) / (this.avgLength || 1)));
      }
      if (score > 0) scored.push({ id: d.id, score });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}
