/**
 * Offline provider: answers straight from the verified catalog and recipes with deterministic
 * rules, no language model. It powers the preview until the OpenAI key exists (blocker B2), and
 * stays as the fallback when the model is down or the budget is spent.
 */
import type { BethProduct, ProductKind, ProductSearchFilters } from '@beth/core';
import type { Block } from './blocks.js';
import type { ChatInput, ChatProvider } from './provider.js';
import {
  compareProducts,
  getProduct,
  productCard,
  recipeCard,
  searchProducts,
  searchRecipes,
  verifiedSpec,
  type KnowledgeView,
} from './tools.js';

export const DEFAULT_QUICK_REPLIES = [
  'Help me choose a pan',
  'Show me cookware sets',
  'Recipes for a stock pot',
  'Compare saucepans',
];

const GREETING = /^(hi|hello|hey|hola|good (morning|afternoon|evening)|help|start)\b[!. ]*$/i;
const RECIPE = /\b(recipes?|cook(ing)?|make|dinner|lunch|breakfast|dessert|meal|recetas?|cocinar)\b/i;
const COMPARE = /\b(compare|comparison|vs\.?|versus|difference|differences|compara[r]?)\b/i;

/** Questions about the product the shopper is looking at, answered from verified specs only. */
const SPEC_QUESTIONS: { pattern: RegExp; keys: Parameters<typeof verifiedSpec>[1][]; label: string }[] = [
  {
    pattern: /induction/i,
    keys: ['inductionCompatible', 'cooktopCompatibility'],
    label: 'induction compatibility',
  },
  { pattern: /oven/i, keys: ['ovenSafeMaxF'], label: 'oven-safe temperature' },
  { pattern: /dishwasher/i, keys: ['dishwasherRecommended'], label: 'dishwasher use' },
  { pattern: /\b(weigh|weight|heavy)\b/i, keys: ['weight'], label: 'weight' },
  {
    pattern: /\b(capacity|how big|quarts?|size)\b/i,
    keys: ['capacityQt', 'nominalSizeIn', 'rimDiameterIn', 'nominalDimensionsIn'],
    label: 'size',
  },
  {
    pattern: /\b(material|steel|t-?304|t-?316|made of)\b/i,
    keys: ['material', 'gauge', 'construction'],
    label: 'material',
  },
  { pattern: /\b(made in|where.*made|manufactur)/i, keys: ['madeIn'], label: 'where it is made' },
  { pattern: /\b(cover|lid)\b/i, keys: ['coverIncluded'], label: 'cover' },
  { pattern: /\bhandle/i, keys: ['handleStyle'], label: 'handles' },
];

export function parseFilters(message: string): { filters: ProductSearchFilters; described: string[] } {
  const filters: ProductSearchFilters = {};
  const described: string[] = [];
  const budget = message.match(
    /(?:under|below|less than|max(?:imum)?|up to|menos de|hasta)\s*\$?\s*(\d+(?:\.\d+)?)/i,
  );
  if (budget?.[1]) {
    filters.maxPriceCents = Math.round(Number(budget[1]) * 100);
    described.push(`under $${budget[1]}`);
  }
  const qt = message.match(/(\d+(?:\.\d+)?)\s*(?:-\s*)?(?:qt|quarts?|cuartos?)\b/i);
  if (qt?.[1]) {
    const v = Number(qt[1]);
    filters.minCapacityQt = v * 0.9;
    filters.maxCapacityQt = v * 1.1;
    described.push(`about ${v} qt`);
  }
  if (/induction|inducci[oó]n/i.test(message)) {
    filters.inductionCompatible = true;
    described.push('induction compatible');
  }
  const oven = message.match(/oven[- ]safe (?:to|up to)?\s*(\d{3})/i);
  if (oven?.[1]) {
    filters.minOvenSafeF = Number(oven[1]);
    described.push(`oven safe to ${oven[1]}°F`);
  }
  const kinds: ProductKind[] = [];
  if (/\bsets?\b|juego/i.test(message)) kinds.push('set');
  if (/\b(bake|baking|bakeware|cookie|cake|loaf|pie pan|roast)/i.test(message)) kinds.push('bakeware');
  if (/slow cooker/i.test(message)) kinds.push('slow_cooker');
  if (kinds.length) filters.kinds = kinds;
  return { filters, described };
}

/** Slow-cooker pieces only lead when the shopper asks for a slow cooker. Keeps the top 3. */
function rank(products: BethProduct[], message: string): BethProduct[] {
  const wantsSlow = /slow/i.test(message);
  return products
    .map((p, i) => ({
      p,
      i,
      penalty: !wantsSlow && (p.kind === 'slow_cooker' || /slow cooker/i.test(p.title)) ? 1 : 0,
    }))
    .sort((a, b) => a.penalty - b.penalty || a.i - b.i)
    .slice(0, 3)
    .map((x) => x.p);
}

function productAnswer(product: BethProduct, message: string): Block[] | null {
  const question = SPEC_QUESTIONS.find((q) => q.pattern.test(message));
  if (!question) return null;
  const facts = question.keys.map((key) => verifiedSpec(product, key)).filter((v): v is string => v !== null);
  const text = facts.length
    ? `${product.title} — ${question.label}: ${facts.join(' · ')}.`
    : `I can't verify the ${question.label} of the ${product.title} from the product information, so I won't guess. The product page or 360 Cookware customer care can confirm it.`;
  return [
    { type: 'text', text },
    { type: 'product_cards', products: [productCard(product)] },
  ];
}

export class CatalogProvider implements ChatProvider {
  readonly name = 'catalog';

  async respond(input: ChatInput, k: KnowledgeView): Promise<Block[]> {
    const message = input.message.trim();
    const current = input.context.productHandle ? getProduct(k, input.context.productHandle) : null;

    if (!message || GREETING.test(message)) {
      return [
        {
          type: 'text',
          text: "Hi, I'm Beth, the 360 Cookware kitchen concierge. I can help you choose cookware, compare pieces and find recipes.",
        },
        {
          type: 'notice',
          tone: 'info',
          text: 'Preview: answers come directly from the 360 Cookware catalog and recipes.',
        },
        { type: 'quick_replies', options: DEFAULT_QUICK_REPLIES },
      ];
    }

    const recent = (input.context.recentProductHandles ?? [])
      .map((h) => getProduct(k, h))
      .filter((p): p is BethProduct => Boolean(p));
    const aboutRecent = recent.length > 0 && /\b(these|them|those|estos|estas)\b/i.test(message);

    if (aboutRecent && COMPARE.test(message)) {
      const comparison = compareProducts(
        k,
        recent.map((p) => p.handle),
      );
      if (comparison) {
        return [
          {
            type: 'text',
            text: 'Here they are side by side. "Not stated" means the product information doesn\'t confirm it.',
          },
          { type: 'comparison', ...comparison },
        ];
      }
    }

    if (aboutRecent && RECIPE.test(message)) {
      const recipes = recent.flatMap((p) => searchRecipes(k, '', p.id, 2));
      const unique = [...new Map(recipes.map((r) => [r.handle, r])).values()].slice(0, 3);
      if (unique.length) {
        return [
          { type: 'text', text: 'Recipes that use these pieces:' },
          { type: 'recipe_cards', recipes: unique.map((r) => recipeCard(k, r)) },
        ];
      }
    }

    if (RECIPE.test(message)) {
      const aboutCurrent = current && /\b(this|it|esta|este)\b/i.test(message);
      const recipes = searchRecipes(k, aboutCurrent ? '' : message, aboutCurrent ? current.id : undefined);
      if (recipes.length === 0) {
        return [
          { type: 'text', text: "I couldn't find a recipe for that in the 360 Cookware recipe collection." },
          { type: 'quick_replies', options: ['Recipes for a stock pot', 'Easy dinner recipes'] },
        ];
      }
      return [
        { type: 'text', text: 'Here are recipes from the 360 Cookware kitchen:' },
        { type: 'recipe_cards', recipes: recipes.map((r) => recipeCard(k, r)) },
      ];
    }

    const aboutCurrentProduct =
      /\b(it|this|this one|esta|este)\b/i.test(message) ||
      !/\b(fry|saut[eé]|sauce|stock|wok|griddle|roast|casserole|skillet|sets?|bak\w*|slow|pan|pot)\b/i.test(
        message,
      );
    if (current && aboutCurrentProduct) {
      const answer = productAnswer(current, message);
      if (answer) return answer;
    }

    const { filters, described } = parseFilters(message);

    // Vague request ("help me choose a pan"): ask one clarifying question instead of guessing.
    const vague = /\b(help me choose|help me pick|recommend|which (one|pan|pot))\b/i.test(message);
    const specific = /\b(fry|saut[eé]|sauce|stock|wok|griddle|roast|casserole|skillet|set|bak|slow|\d)/i.test(
      message,
    );
    if (vague && !specific && described.length === 0) {
      return [
        { type: 'text', text: 'Happy to help. What will you cook in it most often?' },
        {
          type: 'quick_replies',
          options: [
            'Eggs and searing (fry pan)',
            'Sauces and grains (saucepan)',
            'Soups and pasta (stock pot)',
            'One-pan meals (sauté pan)',
          ],
        },
      ];
    }

    if (COMPARE.test(message)) {
      const candidates = searchProducts(k, message, filters, 3);
      const comparison = compareProducts(
        k,
        candidates.map((p) => p.handle),
      );
      if (comparison) {
        return [
          {
            type: 'text',
            text: `Here is a side-by-side comparison. "Not stated" means the product information doesn't confirm it.`,
          },
          { type: 'comparison', ...comparison },
          { type: 'product_cards', products: candidates.map((p) => productCard(p)) },
        ];
      }
    }

    let products = rank(searchProducts(k, message, filters, 8), message);
    let relaxed = false;
    if (products.length === 0 && described.length > 0) {
      products = rank(searchProducts(k, message, {}, 8), message);
      relaxed = products.length > 0;
    }
    if (products.length === 0) {
      return [
        {
          type: 'text',
          text: "I couldn't find a 360 Cookware product that matches that. Tell me what you'd like to cook, or the size you need.",
        },
        { type: 'quick_replies', options: DEFAULT_QUICK_REPLIES },
      ];
    }
    const blocks: Block[] = [];
    if (relaxed) {
      blocks.push({
        type: 'notice',
        tone: 'warning',
        text: `Nothing matches all of: ${described.join(', ')}. These are the closest options.`,
      });
    } else {
      blocks.push({
        type: 'text',
        text: described.length
          ? `Here are the best matches (${described.join(', ')}):`
          : 'Here are the best matches:',
      });
    }
    blocks.push({
      type: 'product_cards',
      products: products.map((p, i) => productCard(p, i === 0 ? 'Best match' : undefined)),
    });
    if (products.length >= 2) {
      blocks.push({ type: 'quick_replies', options: ['Compare these', 'Recipes for these'] });
    }
    return blocks;
  }
}
