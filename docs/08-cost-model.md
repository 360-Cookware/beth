# 08 — Cost model

> **Everything in this document is an ESTIMATE.** No measured costs exist yet, because Beth has not served a real conversation. From Phase 4 on, the `CostLedger` table records **measured** cost per conversation, feature and model, and this document gets a "Measured" section that replaces the estimates.

Prices were checked on **2026-11-16/17** on the providers' official pages (sources at the end). Prices change, so re-check before committing a budget.

## 1. Traffic baseline (validated, Shopify Analytics)

| Metric | Value |
|---|---|
| Average sessions per month (Nov 2025 – Oct 2026) | **136,658** |
| Peak month (Dec 2025) | **177,932** |
| Mobile share | 72.5% |
| AOV | ≈ $326 |

The proposal's figures (≈137k and ≈178k) are confirmed.

## 2. Unit prices used

| Item | Price | Source |
|---|---|---|
| OpenAI `gpt-6.1-terra` (default reasoning model) | $1.00 / 1M input, $0.05 / 1M cached input, $5.00 / 1M output | OpenAI pricing, standard tier |
| OpenAI `gpt-6-luna` (utility tasks) | $0.10 / $0.01 / $0.50 per 1M | OpenAI pricing |
| OpenAI `gpt-6.1-sol` (escalation option) | $2.00 / $0.10 / $10.00 per 1M | OpenAI pricing |
| OpenAI GPT-Live-1 voice layer | **$0.05 per session minute**, billed per second. The backend model is billed separately. | OpenAI GPT-Live-1 model page |
| Fallback voice: `gpt-realtime-2.1-mini` | Audio $10 / 1M input, $20 / 1M output | OpenAI pricing |
| Render web service 1 CPU / 2 GB | $25 / month each | Render pricing |
| Render web service 0.5 CPU / 512 MB | $7 / month | Render pricing |
| Render Postgres 0.5 CPU / 1 GB | $19 / month (+ $0.30 / GB storage) | Render pricing |
| Render Postgres 0.1 CPU / 256 MB | $6 / month | Render pricing |
| Render Pro workspace | $25 / month (25 GB bandwidth, 7-day PITR) | Render pricing |
| Shopify app (custom distribution), Admin and Storefront API, app proxy, webhooks | $0 | Included with Shopify Plus |
| Product and recipe search | $0 (in-memory BM25 in `@beth/core`, no search service, no embeddings) | — |

## 3. Usage assumptions

| Assumption | Value | Basis |
|---|---|---|
| Adoption (sessions that start a conversation) | 1% / 3% / 6% | Industry: about 1% of visitors touch AI chat (Alhena 2026, 329 brands, vendor data). Proactive assistants see up to 5.5× more. Smartsupp 2024: 0.84% of visits start a chat. |
| Turns per conversation | 4 (≈ 6 model calls including tool calls) | Parnidia 2026 (16,908 chats): median 2 shopper messages, mean ≈ 2.7. Beth's guided flow (profile → question → picks → compare → choose) is longer. |
| Average conversation duration | ≈ 1.5 min text, **2.5 min voice** (4 min in the high scenario) | Parnidia: median chat ≈ 1.5 min. Voice is slower. |
| Tokens per model call | 10,000 cached (system, rules, tools, catalog digest) + 2,500 uncached (history, tool results) + 300 output | Design budget for `packages/ai`. Verified in Phase 4. |
| **Tokens per conversation** | **≈ 78,000 cached + 19,500 uncached input + 2,340 output** (includes a 30% safety margin) | Derived |
| Voice share of conversations | 20% / 30% / 50% | Assumption. 72.5% mobile traffic makes voice plausible. |

## 4. Cost per conversation (estimate)

| Component | Cost |
|---|---|
| Text, default `gpt-6.1-terra` | **$0.035** |
| Text, all-`gpt-6-luna` (if evaluations allow) | $0.004 |
| Text, escalation `gpt-6.1-sol` | $0.070 |
| Voice layer (GPT-Live, 2.5 min) | **$0.125**, on top of the text engine cost |
| A voice conversation in total (terra + GPT-Live) | ≈ $0.16 |

## 5. Monthly scenarios

AI = text engine for all conversations plus GPT-Live minutes for voice conversations. Infrastructure is a flat $114 per month: production web ×2 ($50), worker ($7), production Postgres ($19), staging web and DB ($13), Pro workspace ($25).

| Scenario | Month | Conversations | Text | Voice | **AI total** | Infra | **Total** | Per conversation |
|---|---|---|---|---|---|---|---|---|
| Conservative (1%, 20% voice) | Average | 1,367 | $48 | $34 | **$82** | $114 | **$196** | $0.14 |
| | December | 1,779 | $62 | $44 | $107 | $114 | $221 | $0.12 |
| **Expected (3%, 30% voice)** | Average | **4,100** | $144 | $154 | **$298** | $114 | **$412** | $0.10 |
| | December | 5,338 | $187 | $200 | $388 | $114 | $502 | $0.09 |
| High (6%, 50% voice, 4-min voice) | Average | 8,199 | $288 | $820 | **$1,108** | $114 | **$1,222** | $0.15 |
| | December | 10,676 | $375 | $1,068 | $1,442 | $114 | $1,556 | $0.15 |

**Reading the table:** voice minutes, not text, drive cost at high adoption. That is why voice gets its own caps in §6.

**Perspective:** the expected total (≈ $412 per month) is about 1.3 average orders ($326). The high December case (≈ $1,556) is about 4.8 orders, in a month that had 2,731 orders last year.

*Note: the cost range shared in Slack on 2026-11-16 covered AI usage only (≈ $300 per month expected). This model adds hosting (+ $114 per month) and uses the chosen architecture (terra default, GPT-Live voice).*

## 6. Controls built into the design

| Control | Default (configurable in Beth settings) |
|---|---|
| Global monthly AI budget | $600 (alert at 50%, 80% and 100%) |
| Daily budget | $40 (alert at 80%). At 100%, voice is disabled and text continues. |
| Per-conversation cap | 20 turns, 150k input tokens |
| Per voice session | 8 minutes, then a polite switch to text |
| Voice minutes per day | 600 |
| Rate limits | 20 messages per minute per session, 60 per IP. Bot heuristics block automated traffic. |
| Model routing | terra by default. luna for utility tasks. sol only if evaluations show a measurable accuracy gain. |
| Cost tracking | `CostLedger` per conversation, feature (chat, voice, sync) and model. Daily cost report in the admin dashboard. |

Accuracy comes before cost. Routing to a cheaper model happens only after the evaluation suite (Phase 4) shows no regression on Scenarios A–H and on the hallucination test set.

## 7. What is not included

Engineering time. Shopify Plus subscription (already paid). Optional error-tracking SaaS (a free tier is enough at this volume). Taxes.

## Sources

- OpenAI API pricing — https://developers.openai.com/api/docs/pricing
- OpenAI GPT-Live-1 model — https://developers.openai.com/api/docs/models/gpt-live-1
- Render pricing — https://render.com/pricing
- Alhena AI, *AI in Ecommerce Statistics 2026* (vendor) — https://alhena.ai/blog/state-of-ai-commerce/
- Smartsupp, *Analysing 5 billion website visits* (vendor) — https://www.smartsupp.com/blog/analysing-5-billion-website-visits-how-ecommerce-customers-use-chat/
- Parnidia, *E-commerce Chatbot Statistics 2026* — https://www.parnidia.com/blog/ecommerce-chatbot-statistics
- Shopify Analytics (ShopifyQL), 360cookware.myshopify.com, queried 2026-11-16/17
