import type { ActionFunctionArgs } from 'react-router';
import type { Prisma } from '@prisma/client';
import { runChatTurn, MAX_MESSAGE_CHARS } from '@beth/ai';
import { authenticate } from '../shopify.server';
import db from '../db.server';
import { loadKnowledge } from '../services/knowledge/store.server';
import { scrubPii } from '../services/privacy.server';
import { allowRequest } from '../services/rate-limit.server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HANDLE = /^[a-z0-9][a-z0-9-]{0,254}$/;
const headers = { 'Cache-Control': 'no-store' };

interface ChatBody {
  conversationId?: unknown;
  message?: unknown;
  context?: { productHandle?: unknown; pageType?: unknown; recentProductHandles?: unknown };
}

/**
 * POST https://www.360cookware.com/apps/beth/chat (app proxy, signed by Shopify).
 * Body: { conversationId?, message, context? } → { conversationId, blocks, provider }.
 * The shopper stays anonymous: Shopify's logged_in_customer_id is never read or stored.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  if (!session) return Response.json({ error: 'not_installed' }, { status: 503, headers });
  const shop = session.shop;

  const settings = await db.settings.findUnique({ where: { shop }, select: { widgetEnabled: true } });
  if (!settings?.widgetEnabled) return Response.json({ error: 'disabled' }, { status: 403, headers });

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!allowRequest(`chat:${ip}`, 30, 60_000)) {
    return Response.json({ error: 'rate_limited' }, { status: 429, headers });
  }

  let body: ChatBody;
  try {
    body = (await request.json()) as ChatBody;
  } catch {
    return Response.json({ error: 'bad_request' }, { status: 400, headers });
  }
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, MAX_MESSAGE_CHARS) : '';
  const ctx = body.context ?? {};
  const productHandle =
    typeof ctx.productHandle === 'string' && HANDLE.test(ctx.productHandle) ? ctx.productHandle : null;
  const pageType = typeof ctx.pageType === 'string' ? ctx.pageType.slice(0, 40) : null;
  const recentProductHandles = Array.isArray(ctx.recentProductHandles)
    ? ctx.recentProductHandles.filter((h): h is string => typeof h === 'string' && HANDLE.test(h)).slice(0, 3)
    : [];

  let conversationId =
    typeof body.conversationId === 'string' && UUID.test(body.conversationId) ? body.conversationId : null;
  const existing = conversationId
    ? await db.conversation.findFirst({ where: { id: conversationId, shop }, select: { id: true } })
    : null;
  if (!existing) {
    const created = await db.conversation.create({ data: { shop, channel: 'text' }, select: { id: true } });
    conversationId = created.id;
  }

  const knowledge = await loadKnowledge(shop);
  const history = (
    await db.message.findMany({
      where: { conversationId: conversationId! },
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: { role: true, text: true },
    })
  )
    .reverse()
    .map((m) => ({ role: m.role === 'user' ? ('user' as const) : ('assistant' as const), text: m.text }));

  const result = await runChatTurn(
    { message, history, context: { productHandle, pageType, recentProductHandles } },
    knowledge,
  );

  const assistantText = result.blocks
    .filter((b): b is Extract<typeof b, { text: string }> => 'text' in b)
    .map((b) => b.text)
    .join('\n');
  await db.$transaction([
    db.message.create({ data: { conversationId: conversationId!, role: 'user', text: scrubPii(message) } }),
    db.message.create({
      data: {
        conversationId: conversationId!,
        role: 'assistant',
        text: assistantText,
        blocks: result.blocks as unknown as Prisma.InputJsonValue,
        model: result.provider,
      },
    }),
    db.conversation.update({
      where: { id: conversationId! },
      data: { lastActiveAt: new Date(), messageCount: { increment: 2 } },
    }),
  ]);

  return Response.json({ conversationId, blocks: result.blocks, provider: result.provider }, { headers });
};

export const loader = () => Response.json({ error: 'method_not_allowed' }, { status: 405, headers });
