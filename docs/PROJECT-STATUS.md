# Project status

_Last updated: 2026-11-17_

## Summary

| Phase | Status |
|---|---|
| 0 — Environment audit | ✅ Complete |
| 1 — Architecture and project setup | ✅ Architecture and repo tooling complete · 🔒 accounts pending (Shopify app, OpenAI, Render) |
| 2 — Product knowledge engine | ✅ Engine complete and tested on the real catalog · ⏳ live sync (needs app credentials) |
| 3 — Recipe knowledge engine | ✅ Engine complete and tested on the real recipes · ⏳ live sync (needs app credentials) |
| 4 — AI backend | ⏭️ Next |
| 5–11 | Not started |

**Current phase:** transition from 2/3 (engines) to app scaffold, live sync and the AI backend.

## Completed

### Phase 0 — Audit

- Read-only audit of the store, live theme, apps, catalog (275 products), Recipes blog (274 articles), discounts, markets and traffic.
- Found: 4 shopper-visible material-grade conflicts, 40 products with stale legacy `ptabs.tabs` data, sparse capacity, induction and cover facts, 9 broken recipe→product links, and the BF2026 visual price logic that Beth must mirror.
- Docs: `docs/00-environment-audit.md`, `docs/data-quality/*.md`.

### Phase 1 — Architecture and setup

- Architecture decided and documented (`docs/01-technical-architecture.md`). Roadmap and risks in `docs/02-roadmap.md`. Cost model in `docs/08-cost-model.md`.
- Monorepo: npm workspaces, TypeScript 5.9 strict, Vitest 5, ESLint 10 + typescript-eslint, Prettier, CI workflow.

### Phases 2 and 3 — Knowledge engines (`packages/core`)

- Product normalization with a canonical spec schema, multi-source extraction (spec table, description, title, tags, includes, care guide, legacy tabs), **verified vs conflict** merge with provenance, eligibility rules (coming soon, pre-order, condition, parts, gift card), Yotpo ratings.
- BF2026 visual price mirrored from `snippets/price.liquid` (matches the live PDP: $279.95 → $232.36, save $47.59).
- Recipe Kit parser (both JSON formats), recipe→product link resolution, unlinked equipment detection, "never estimate times".
- In-memory BM25 search for products (verified-spec filters only) and recipes (by query or by owned product).
- Data-quality report generator.

## Files created

```
.editorconfig .gitattributes .gitignore .nvmrc .prettierrc.json .env.example
package.json package-lock.json tsconfig.base.json vitest.config.ts eslint.config.js
README.md
tools/ci/ci.yml            (GitHub Actions workflow; move to .github/workflows/ci.yml — see note below)
docs/00-environment-audit.md docs/01-technical-architecture.md docs/02-roadmap.md
docs/08-cost-model.md docs/PROJECT-STATUS.md
docs/data-quality/product-knowledge.md docs/data-quality/recipe-knowledge.md
fixtures/shopify/catalog.2026-11-17.json fixtures/shopify/recipes.2026-11-17.json
packages/core/{package.json,tsconfig.json}
packages/core/src/index.ts
packages/core/src/text/html.ts
packages/core/src/products/{shopify-types,spec-schema,parse-values,extract,merge,normalize,quality-report}.ts
packages/core/src/pricing/promotions.ts
packages/core/src/recipes/{recipes,recipe-quality-report}.ts
packages/core/src/search/{bm25,product-search,recipe-search}.ts
packages/core/test/{fixtures,html,product-knowledge,pricing,recipe-knowledge,product-search}.test.ts
scripts/knowledge-report.ts
```

## Decisions made

| Decision | Choice | Reason |
|---|---|---|
| Storefront integration | Theme app extension (app embed) | No theme edits, toggleable, survives theme branches |
| Backend | Shopify React Router app on Render, Node 22 | Official template, long-lived sockets for voice, managed Postgres |
| Database | Postgres + Prisma, no vector DB in v1 | Small corpus, in-memory search is faster and free |
| AI | OpenAI Responses (`gpt-6.1-terra` default) behind a provider adapter | Accuracy first, one vendor for text and voice, swappable |
| Voice | GPT-Live-1 with client delegation into the same engine | One brain for text and voice, no key in the browser |
| Widget | Preact + TS, under 10 KB loader, import on interaction | Performance on a script-heavy theme |
| Facts policy | Only shopper-visible sources verify a fact. Conflicts are never stated. Legacy data never becomes a fact. | "Never guess" requirement |
| Prices | Live, localized, BF2026 mirrored | Match the PDP exactly |
| Cart | Ajax Cart API + Dawn drawer, `_beth_cid` hidden property | Reuse the theme, exact attribution |

## Tests performed

| Check | Result |
|---|---|
| `npm run typecheck` | ✅ |
| `npm run lint` | ✅ |
| `npm test` | ✅ 35 tests, 5 files (real catalog and recipe fixtures) |
| `npm run report:knowledge` | ✅ Reports regenerated |

## Outstanding issues and blockers

| # | Item | Blocks | Owner |
|---|---|---|---|
| B1 | Create the Beth app (Dev Dashboard, custom distribution) and share Client ID and secret through a secret manager | App proxy, webhooks, live sync, theme extension | 360 Cookware |
| B2 | OpenAI API project, key, budget limits and GPT-Live access | Phases 4 and 8 | 360 Cookware |
| B3 | Render account (or alternative) and a DNS record such as `beth-api.360cookware.com` | Staging and production | 360 Cookware |
| B4 | Staging theme to install the app embed on (e.g. duplicate the live theme) | E2E tests | 360 Cookware |
| D1–D6 | Merchant data tasks (conflicts, legacy tabs, missing specs, broken recipe links, tone guide, retention) | Answer quality | Product, content, legal |

Nothing has been changed in the Shopify store or theme.

**Note on CI:** the remote tooling cannot write into `.github/`, so the workflow was saved as `tools/ci/ci.yml`. To enable CI, copy it to `.github/workflows/ci.yml` and commit.

## Next implementation task

Scaffold `apps/beth-app` (Shopify React Router template) with Prisma and Postgres. Implement the live product and recipe sync jobs and webhook handlers using the existing `@beth/core` engines. Add an admin "Knowledge quality" page. See `docs/02-roadmap.md` → "Next implementation task".
