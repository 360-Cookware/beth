import type { Block } from './blocks.js';
import type { KnowledgeView } from './tools.js';

export interface ChatHistoryItem {
  role: 'user' | 'assistant';
  text: string;
}

export interface ChatInput {
  message: string;
  history: ChatHistoryItem[];
  context: {
    /** Handle of the product page the shopper is on, if any. */
    productHandle?: string | null;
    pageType?: string | null;
    /** Handles of the product cards shown in the previous reply (for "compare these"). */
    recentProductHandles?: string[];
  };
}

/** A conversation brain. The OpenAI Responses adapter implements the same interface. */
export interface ChatProvider {
  readonly name: string;
  respond(input: ChatInput, knowledge: KnowledgeView): Promise<Block[]>;
}
