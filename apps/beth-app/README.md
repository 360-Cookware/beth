# beth-app

Shopify app for Beth, built from the official
[Shopify React Router app template](https://github.com/Shopify/shopify-app-template-react-router)
(MIT, see `TEMPLATE-LICENSE.md`).

| Path | Purpose |
|---|---|
| `shopify.app.toml` | App configuration: scopes, webhooks, events, app proxy. Apply with `npm run deploy:shopify` from the repo root. |
| `prisma/` | PostgreSQL schema and migrations |
| `app/routes/app*.tsx` | Embedded admin: Home (sync status) and Knowledge quality |
| `app/routes/proxy.*.tsx` | App proxy routes (`https://www.360cookware.com/apps/beth/*`) |
| `app/routes/webhooks.*.tsx` | Webhooks and Events (idempotent, payload never trusted as data) |
| `app/services/knowledge/` | Live knowledge sync into `@beth/core` |
| `extensions/beth-embed/` | Theme app extension: app embed and launcher loader |
| `test/` | Integration tests (need `BETH_TEST_DATABASE_URL`) |

Setup, hosting variables and install steps: [`docs/03-shopify-app-setup.md`](../../docs/03-shopify-app-setup.md).
