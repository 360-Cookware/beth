# Project status

_Last updated: 2026-11-17_

## Summary

| Phase | Status |
|---|---|
| 0 — Environment audit | ✅ Complete |
| 1 — Architecture and project setup | ✅ Architecture, repo tooling and Shopify app scaffold · ⏳ app creation (your login, `docs/03-shopify-app-setup.md` Part A) · ⏸️ OpenAI and Render deferred to the end (your decision) |
| 2 — Product knowledge engine | ✅ Engine · ✅ live sync code, tested with a fake Admin API and real PostgreSQL · ⏳ first live run after install |
| 3 — Recipe knowledge engine | ✅ Engine · ✅ live sync code · ⏳ first live run after install |
| 4 — AI backend | ⏭️ Next (built against a fake provider until the OpenAI key exists) |
| 5–11 | Not started |

**Working agreements (2026-11-17):** commits go directly to `main` for now. The staging theme is
**Beth Updates** (`gid://shopify/OnlineStoreTheme/170070245465`, unpublished, verified). OpenAI
(B2) and hosting plus DNS (B3) are handled at the end.

## Completed

### Phase 0 — Audit

- Read-only audit of the store, live theme, apps, catalog (275 products), Recipes blog (274 articles), discounts, markets and traffic.
- Found: 4 shopper-visible material-grade conflicts, 40 products with stale legacy `ptabs.tabs` data, sparse capacity, induction and cover facts, 9 broken recipe→product links, and the BF2026 visual price logic that Beth must mirror.
- Docs: `docs/00-environment-audit.md`, `docs/data-quality/*.md`.

### Phase 1 — Architecture and setup

- Architecture, roadmap, risks and cost model documented.
- Monorepo: npm workspaces (`packages/*`, `apps/*`), TypeScript 5.9 strict, Vitest 5, ESLint 10 + typescript-eslint, Prettier, CI workflow (`.github/workflows/ci.yml`, with a PostgreSQL service and a Prisma drift check).
- **Shopify app `apps/beth-app`** from the official React Router template (MIT, notice kept in `TEMPLATE-LICENSE.md`):
  - `shopify.app.toml`: read-only scopes, webhooks, `Article` Events, app proxy `/apps/beth`, compliance topics. Planned host `beth-api.360cookware.com` (no DNS yet, so nothing is sent anywhere).
  - PostgreSQL schema and initial migration: 13 tables (architecture §7 plus `WebhookDelivery`). Rust-free Prisma Client with the `pg` adapter.
  - Admin pages: **Home** (sync status, "Sync knowledge now") and **Knowledge quality** (conflicts, missing specs, broken recipe links, from live data).
  - Routes: `/proxy/health` (app proxy, signature verified), `/healthz`, `/readyz`, webhooks for products, inventory, articles, uninstall, scopes and privacy compliance.
  - Theme app extension `beth-embed`: app embed "Beth concierge" plus `beth-loader.js` (4.8 KB, 2.1 KB gzipped). It renders nothing until the app-owned flag `beth.widget_enabled` is on, and makes no request on page load.
- Step-by-step app creation, deploy and install guide: `docs/03-shopify-app-setup.md`.

### Phases 2 and 3 — Knowledge engines and live sync

- `packages/core`: product normalization with verified-vs-conflict provenance, BF2026 visual price, Recipe Kit parsing and product links, BM25 search, quality reports.
- `packages/core/src/shopify`: Admin GraphQL documents and the mapping from Admin API nodes to engine inputs, including bulk JSONL re-assembly. The mapping reproduces the recorded fixtures exactly (275/275 products, 274/274 articles).
- `apps/beth-app/app/services/knowledge`: full sync (bulk operation for products, paginated articles for recipes), versioned snapshots with hashes, single-flight runs, idempotent webhook handling with trailing refresh, in-memory engines rebuilt on change.

## Files created or changed in this step

```
package.json package-lock.json eslint.config.js vitest.config.ts .gitignore README.md
.github/workflows/ci.yml (moved from tools/ci/ci.yml: CI is now enabled)
docs/03-shopify-app-setup.md (new) · docs/01-technical-architecture.md · docs/02-roadmap.md · docs/PROJECT-STATUS.md
fixtures/shopify/admin-raw-sample.2026-11-17.json
packages/core/src/shopify/{admin-queries,admin-mapping}.ts · packages/core/src/index.ts
packages/core/test/admin-mapping.test.ts
apps/beth-app/{package.json,shopify.app.toml,shopify.web.toml,tsconfig.json,vite.config.ts,env.d.ts,TEMPLATE-LICENSE.md,README.md}
apps/beth-app/prisma/schema.prisma · prisma/migrations/{migration_lock.toml,20261117120000_init/migration.sql}
apps/beth-app/app/{db.server.ts,shopify.server.ts,entry.server.tsx,root.tsx,routes.ts,globals.d.ts}
apps/beth-app/app/routes/{_index,auth.$,auth.login,app,app._index,app.knowledge,healthz,readyz,proxy.health}
apps/beth-app/app/routes/webhooks.{app.uninstalled,app.scopes_update,products,inventory,articles,customers.data_request,customers.redact,shop.redact}.tsx
apps/beth-app/app/services/{webhook-deliveries,compliance}.server.ts
apps/beth-app/app/services/shopify/admin-graphql.server.ts
apps/beth-app/app/services/knowledge/{sync,snapshots,store}.server.ts
apps/beth-app/extensions/beth-embed/{shopify.extension.toml,blocks/beth-embed.liquid,assets/beth-loader.js}
apps/beth-app/test/knowledge-sync.test.ts
```

## Decisions made

| Decision | Choice | Reason |
|---|---|---|
| Storefront integration | Theme app extension (app embed) | No theme edits, toggleable, survives theme branches |
| Backend | Shopify React Router app on Render, Node 22 | Official template, long-lived sockets for voice, managed Postgres |
| Database | Postgres + Prisma (Rust-free client, `pg` adapter), no vector DB in v1 | Small corpus, in-memory search; no native engine to ship |
| App ownership | Created in the store's own organization, installed from the Installs card | No custom distribution link; not subject to the Nov 20, 2026 IP-allowlist rule for out-of-org installs (allowlist still added as good practice) |
| Scopes | Read-only (`read_products`, `read_inventory`, `read_content`, `read_online_store_pages`, `read_legal_policies`) | Least privilege; `read_orders` waits for the analytics phase |
| Product sync | Bulk operation + webhooks with trailing refresh; payloads never trusted as data | No query-cost limit; bursts collapse into one read |
| Recipe sync | Paginated articles + `Article` Events (2026-10) | Recipes blog only, about 274 articles |
| Launcher visibility | App-owned metafield `beth.widget_enabled` + page-type settings; no request on page load | Zero cost and zero impact until Beth is switched on |
| AI | OpenAI Responses (`gpt-6.1-terra` default) behind a provider adapter | Accuracy first, one vendor for text and voice, swappable |
| Voice | GPT-Live-1 with client delegation into the same engine | One brain for text and voice, no key in the browser |
| Widget | Preact + TS, small loader, import on interaction | Performance on a script-heavy theme |
| Facts policy | Only shopper-visible sources verify a fact. Conflicts are never stated. Legacy data never becomes a fact. | "Never guess" requirement |
| Prices | Live, localized, BF2026 mirrored | Match the PDP exactly |
| Cart | Ajax Cart API + Dawn drawer, `_beth_cid` hidden property | Reuse the theme, exact attribution |

## Tests performed

| Check | Result |
|---|---|
| `npm run typecheck` (core + app, Prisma client generated) | ✅ |
| `npm run lint` | ✅ 0 problems |
| `npm test` | ✅ 47 tests, 7 files (35 engine tests, 6 mapping tests, 6 sync integration tests) |
| Sync integration test (`BETH_TEST_DATABASE_URL`, PostgreSQL 16) | ✅ 275 products, 274 articles, 4 conflicts, 111 recommendable, 139 online, 259 published recipes, 210 with an active product link; re-sync unchanged; 8 versions kept; deletes and blog moves handled; deliveries de-duplicated |
| Admin GraphQL documents run read-only against the live store | ✅ Valid on 2026-10 (`groupObjects` required on bulk queries, handled) |
| Migration SQL on PostgreSQL 16 | ✅ 13 tables, 30 indexes. Prisma drift check runs in CI (Prisma engine downloads are blocked in the build sandbox) |
| `react-router build` + production server smoke test | ✅ `/healthz` 200, `/readyz` 200, signed app proxy 503 (not installed) / 200 (installed), unsigned proxy 400, unsigned webhook 400 |
| Staging theme | ✅ `Beth Updates` exists, role UNPUBLISHED |
| `shopify app deploy`, install, live sync | ⏳ Needs your Shopify login (setup guide Part A) and hosting (Part B) |

## Outstanding issues and blockers

| # | Item | Blocks | Owner | Status |
|---|---|---|---|---|
| B1 | Create the Beth app in the Dev Dashboard, paste the client ID, `npm run deploy:shopify` | Deploying config and extension | Juan | ⏳ Steps in `docs/03-shopify-app-setup.md` Part A |
| B2 | OpenAI API project, key, budget limits and GPT-Live access | Live AI runs (code proceeds with a fake provider) | 360 Cookware | ⏸️ Deferred to the end |
| B3 | Render account, PostgreSQL, DNS `beth-api.360cookware.com` | Install, live sync, staging E2E | 360 Cookware | ⏸️ Deferred to the end |
| B4 | Staging theme | E2E tests | — | ✅ `Beth Updates` (170070245465) |
| P1 | Push to GitHub | Remote backup and CI | Juan | ⏳ `git push origin main` (the build tooling has no GitHub credentials) |
| D1–D6 | Merchant data tasks (conflicts, legacy tabs, missing specs, broken recipe links, tone guide, retention) | Answer quality | Product, content, legal | Open |

Nothing has been changed in the Shopify store or any theme.

**CI:** `.github/workflows/ci.yml` runs on every push to `main`: migrations, Prisma drift check, typecheck, lint, tests (including the PostgreSQL integration tests) and build. The first run happens after you push.

## Next implementation task

Phase 4 — AI backend (`packages/ai`): provider adapter with a deterministic fake provider, the controlled tools over `@beth/core`, output validation, session bootstrap through the app proxy, chat SSE endpoint, budgets, and the evaluation harness. See `docs/02-roadmap.md` → "Next implementation task".
