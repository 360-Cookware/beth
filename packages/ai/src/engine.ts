import type { Block } from './blocks.js';
import { CatalogProvider } from './catalog-provider.js';
import type { ChatInput, ChatProvider } from './provider.js';
import type { KnowledgeView } from './tools.js';

export const MAX_MESSAGE_CHARS = 2000;
const ALLOWED_URL = /^https:\/\/(www\.360cookware\.com|cdn\.shopify\.com)\//;

/**
 * Output validation: every product, variant and URL in a reply must exist in the verified
 * snapshot or the allowlist. Anything else is removed, never shown.
 */
export function validateBlocks(blocks: Block[], k: KnowledgeView): Block[] {
  const out: Block[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case 'product_cards': {
        const products = block.products.filter((card) => {
          const p = k.catalog.byHandle.get(card.handle);
          if (!p || !p.recommendable) return false;
          const known = new Set(p.variants.map((v) => v.legacyId));
          return card.variants.every((v) => known.has(v.id)) && card.priceCents === p.minPriceCents;
        });
        if (products.length) out.push({ ...block, products });
        break;
      }
      case 'recipe_cards': {
        const recipes = block.recipes.filter((r) => k.library.byHandle.has(r.handle));
        if (recipes.length) out.push({ ...block, recipes });
        break;
      }
      case 'comparison': {
        if (block.columns.every((c) => k.catalog.byHandle.has(c.handle))) out.push(block);
        break;
      }
      case 'text':
      case 'notice': {
        const text = block.text.replace(/https?:\/\/\S+/g, (url) =>
          ALLOWED_URL.test(url) ? url : '[link removed]',
        );
        out.push({ ...block, text });
        break;
      }
      case 'quick_replies':
        out.push({ ...block, options: block.options.slice(0, 4).map((o) => o.slice(0, 60)) });
        break;
    }
  }
  return out;
}

export interface ChatTurnResult {
  blocks: Block[];
  provider: string;
  latencyMs: number;
  fallback: boolean;
}

/**
 * Runs one turn. If the primary provider fails, the offline catalog provider answers instead,
 * so the shopper always gets verified data or an honest notice.
 */
export async function runChatTurn(
  input: ChatInput,
  knowledge: KnowledgeView,
  provider: ChatProvider = new CatalogProvider(),
): Promise<ChatTurnResult> {
  const started = Date.now();
  const message = input.message.slice(0, MAX_MESSAGE_CHARS);
  const safeInput: ChatInput = { ...input, message, history: input.history.slice(-12) };
  let blocks: Block[];
  let used = provider.name;
  let fallback = false;
  try {
    blocks = await provider.respond(safeInput, knowledge);
  } catch {
    const backup = new CatalogProvider();
    blocks = await backup.respond(safeInput, knowledge);
    used = backup.name;
    fallback = true;
  }
  const validated = validateBlocks(blocks, knowledge);
  if (validated.length === 0) {
    validated.push({
      type: 'notice',
      tone: 'warning',
      text: "Sorry, I couldn't answer that reliably. Please try rephrasing, or contact 360 Cookware customer care.",
    });
  }
  return { blocks: validated, provider: used, latencyMs: Date.now() - started, fallback };
}
