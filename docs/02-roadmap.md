# 02 — Development roadmap, risks and dependencies

Each phase ends with automated checks (`npm run check`) and an entry in [`PROJECT-STATUS.md`](PROJECT-STATUS.md). The 🔒 marker identifies steps that need the store owner's authorization or credentials.

## Phases

| Phase | Deliverable | Depends on | Acceptance criteria |
|---|---|---|---|
| **0. Audit** ✅ | `00-environment-audit.md`, data-quality reports | — | Every claim traceable to an API query, theme file or generated report |
| **1. Architecture and setup** ✅ (repo, app scaffold) / 🔒 (accounts) | `01-technical-architecture.md`, monorepo, TS, lint, tests, CI, `.env.example` | 0 | `npm run check` green locally and in CI |
| **2. Product knowledge engine** ✅ engine, ✅ sync code (tested with real PostgreSQL) / ⏳ live run after install | Normalization, verified specs, conflicts, search, promotions. Admin sync job and webhooks. | 1. Live sync needs app credentials 🔒 | Real-catalog tests pass. Conflicts reported. Sync run stores a snapshot and report. Webhook updates a product within 60 s. |
| **3. Recipe knowledge engine** ✅ engine, ✅ sync code / ⏳ live run after install | Recipe Kit parser, product links, recipe search. Article sync. | 2 | One-Pot Lasagna Soup resolves to the 4 Qt Stock Pot. Times appear only when stated. Broken links reported. |
| **4. AI backend** | `packages/ai` orchestration, prompts, tools, output validation, budgets. `apps/beth-app` chat SSE and session bootstrap. | 2, 3, OpenAI key 🔒 | Scenarios A, B, C, E, G, H pass in the evaluation harness (recorded and live). No hallucinated price, spec or ID in 200 adversarial runs. |
| **5. Chat interface** | Theme app extension (launcher) and Preact widget: panel, bubbles, typing state, error and empty states, mobile and desktop | 4 | Lighthouse: no CLS from the launcher. Loader under 10 KB gz. Axe has no serious issues. Works over Rivo, Attentive, Klaviyo and the sticky ATC. |
| **6. Recommendations and comparison** | Product cards (best match, best value, alternative), comparison table with highlighted pick, Beth's recommended card | 4, 5 | Labels backed by verified attributes. Comparison rows only for relevant attributes. Unknown values shown as "Not stated". |
| **7. Shopify cart** | Selection sheet (variant, quantity), add to cart through the Ajax API, drawer and bubble sync, `_beth_cid` attribution | 5, 6, staging theme ✅ (`Beth Updates`, 170070245465) | Scenario D: Shopify 200 confirmed. Drawer count updates. BF2026 still auto-applies. 422 errors surfaced. |
| **8. Voice** | GPT-Live broker and sideband, client delegation into the same engine, voice states, fallback to text | 4, 5, OpenAI voice access 🔒 | Scenario F: same cards as text. Interruption works. No key in the browser. Session caps enforced. |
| **9. Analytics** | Event pipeline, consent gating, order attribution webhook, admin dashboard, cost ledger | 4, 7 | Dashboard answers the 9 questions in the brief. Revenue attribution only from orders carrying `_beth_cid`. |
| **10. QA and CRO** | E2E (Playwright) on staging, accessibility, performance, security review, A/B plan | 1–9 | All scenarios A–H green on staging. p95 first token under 2.5 s (text). Security checklist signed off. |
| **11. Deployment** | Render production, monitoring, runbooks, staged rollout (10% → 50% → 100%) 🔒 | 10 | Rollback tested. Alerts firing in a drill. Go-live approval recorded. |

## First implementation task (done in this phase)

**Task:** bootstrap the monorepo and implement the product and recipe knowledge engines against the real catalog. This came first because accuracy is the foundation of every later feature, and it needed no credentials.

- Files: `packages/core/src/**`, `packages/core/test/**`, `fixtures/shopify/*.json`, `scripts/knowledge-report.ts`
- Commands: `npm install`, `npm run check`, `npm run report:knowledge`
- Result: 35 tests over the real 275-product and 274-article export. Conflict and coverage reports in `docs/data-quality/`.

## Done in this step (2026-11-17)

- `apps/beth-app` scaffolded from the official Shopify React Router template: PostgreSQL schema and initial migration (architecture §7 plus `WebhookDelivery`), `shopify.app.toml` (read-only scopes, webhooks, Article events, app proxy), theme app extension `beth-embed` (app embed + loader).
- Live knowledge sync (`syncProducts` via bulk operation, `syncRecipes`, webhook and Events handlers with idempotency and trailing refresh), `KnowledgeSyncRun` rows, admin **Home** and **Knowledge quality** pages, app proxy `/apps/beth/health`, `/healthz`, `/readyz`, privacy compliance webhooks.
- App creation and install steps: `docs/03-shopify-app-setup.md`.

## Next implementation task

**Phase 4: AI backend (`packages/ai`), built and tested before the OpenAI key exists.**

1. Provider adapter interface with a deterministic **fake provider** (recorded tool-call scripts), so the tool loop, validation and SSE are tested without a key. The OpenAI Responses adapter plugs in when blocker B2 is resolved.
2. Controlled tools from §5 over `@beth/core` (search, details, compare, recipes, policy, `prepare_cart_action`), with Zod schemas and the `trust="data"` wrapping.
3. Output validator: rejects unknown product IDs, prices that differ from the snapshot, non-allowlisted URLs and discount codes.
4. Session bootstrap (`POST /apps/beth/session` via app proxy, signed JWT) and `POST /api/v1/chat` (SSE), budgets and rate limits.
5. Evaluation harness with scenarios A, B, C, E, G and H on the fake provider; the live run waits for the key.

## Merchant data tasks (run in parallel, no code)

| # | Task | Owner | Why |
|---|---|---|---|
| 1 | Resolve the 4 material-grade conflicts (T-304 vs T-316) | Product team | Beth refuses to state conflicting facts |
| 2 | Clear or update the legacy `ptabs.tabs` metafield on 40 products | Product team | Stale data that contradicts the live page |
| 3 | Fill missing capacity, cooking surface, induction and cover facts in the spec table | Product team | Enables filters ("induction", "for 6 people") |
| 4 | Fix 9 broken recipe→product links | Content team | Recipe-to-product recommendations |
| 5 | Approve Beth's voice and tone guide and the promotion wording | Marketing | Brand consistency |
| 6 | Decide transcript retention (default: 30 days for messages, 90 for conversations) | Legal | Privacy policy alignment |

## Risk register

| # | Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|---|
| R1 | Wrong or conflicting product facts | High (found 4 conflicts and 40 stale records) | High | Verified-only facts, conflict refusal (implemented), data tasks 1–3 | Eng + Product |
| R2 | Price shown differs from the PDP (markets, BF2026) | Medium | High | Live localized price, mirrored promotion logic (tested), re-check before add to cart | Eng |
| R3 | Launcher collides with floating apps or sticky ATC | High | Medium | Configurable position and offset per page type. Hide on cart and checkout-adjacent views. Visual regression tests. | Eng + Design |
| R4 | Storefront performance regression | Medium | High | Loader under 10 KB, import on interaction, no work before idle, performance budget in CI | Eng |
| R5 | Prompt injection via catalog, recipe or user text | Medium | High | Data wrapping, read-only tools, output validator, red-team evaluation set | Eng |
| R6 | GPT-Live availability, limits or behavior change (new API) | Medium | Medium | Realtime-mini fallback, text fallback, feature flag | Eng |
| R7 | Cost overrun (bots, long voice sessions, peak season) | Low–Medium | Medium | Budgets, per-session caps, bot heuristics, alerts, daily cost report | Eng + Finance |
| R8 | Privacy or consent non-compliance | Low | High | Anonymous sessions, PII scrubbing, consent gating, retention jobs, GDPR webhooks | Eng + Legal |
| R9 | Theme branch changes break the cart integration | Medium | Medium | Integration through Dawn public APIs only. Feature detection with a fallback to `/cart`. E2E on every theme release branch. | Eng |
| R10 | Shopify API version changes (2026-10 → 2027-01) | Medium | Low | Pinned API version, quarterly upgrade task, typed queries validated in CI | Eng |
| R11 | Commercial: shoppers distrust AI answers | Medium | Medium | Cite sources ("from the product page"), honest "I can't verify", easy human handoff to customer care | Product |
| R12 | Dependency on recipe app data format (Recipe Kit JSON) | Low | Medium | Parser tolerant to both known formats (tested), reconciliation alerts on parse failures | Eng |
