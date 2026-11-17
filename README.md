# Beth — AI Kitchen Concierge for 360 Cookware

Beth is a voice-first shopping assistant for [360cookware.com](https://www.360cookware.com) (Shopify Plus). She helps shoppers find, compare and buy the right cookware, and helps owners cook with it, using **only verified store data**.

> Status: audit, knowledge engines, Shopify app scaffold and live knowledge sync are done. Next: the AI backend. See [`docs/PROJECT-STATUS.md`](docs/PROJECT-STATUS.md).

## Documentation

| Doc | What it covers |
|---|---|
| [`docs/00-environment-audit.md`](docs/00-environment-audit.md) | What exists in the store, theme, apps, catalog and recipes; gaps; blockers |
| [`docs/01-technical-architecture.md`](docs/01-technical-architecture.md) | Architecture, decisions and trade-offs, APIs, tools, data model, security |
| [`docs/02-roadmap.md`](docs/02-roadmap.md) | Phases, acceptance criteria, next task, risk register |
| [`docs/03-shopify-app-setup.md`](docs/03-shopify-app-setup.md) | Create, deploy and install the Shopify app, hosting variables, staging theme |
| [`docs/08-cost-model.md`](docs/08-cost-model.md) | Operating cost estimates, scenarios and controls |
| [`docs/data-quality/`](docs/data-quality) | Generated product and recipe data-quality reports |
| [`docs/PROJECT-STATUS.md`](docs/PROJECT-STATUS.md) | Progress log, decisions, tests, blockers |

## Requirements

- Node.js **22.12+** (see `.nvmrc`)
- npm 10+

## Quick start

```bash
npm install
npm run check            # typecheck (core + app) + lint + tests
npm run report:knowledge # regenerate docs/data-quality from the fixtures
```

Expected result: 47 tests pass. The 6 sync integration tests run only when `BETH_TEST_DATABASE_URL`
points to a disposable PostgreSQL database with the migrations applied (`npm run db:migrate`);
otherwise they are skipped.

Shopify app (create, deploy, install): see [`docs/03-shopify-app-setup.md`](docs/03-shopify-app-setup.md).

## Repository layout

```
apps/beth-app      Shopify app (React Router): admin, app proxy, webhooks, knowledge sync, theme app extension
packages/core      Product & recipe knowledge engines, search, pricing, Admin API mapping (pure TypeScript, no I/O)
fixtures/shopify   Read-only snapshots of the catalog and Recipes blog (2026-11-17) used by tests
scripts            Maintenance scripts (knowledge report)
.github/workflows  CI: migrations drift check, typecheck, lint, tests (with PostgreSQL), build
docs               Audit, architecture, roadmap, app setup, cost model, status, data-quality reports
```

Planned (see the architecture doc): `packages/ai` (orchestration and tools) and `packages/widget` (storefront UI).

## Principles

1. **Never guess.** A fact is used only when a shopper-visible Shopify source states it and no other shopper-visible source contradicts it.
2. **Live prices.** Prices and availability come from Shopify at request time, in the shopper's currency, matching the product page.
3. **The model has no write access.** Add to cart runs in the shopper's browser after an explicit confirmation, with a backend-validated variant.
4. **No production changes without authorization.**
