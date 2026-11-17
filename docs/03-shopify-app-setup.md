# 03 — Shopify app setup (Beth)

How to create, configure and install the Beth app on `360cookware.myshopify.com`.
The app code and its configuration are in `apps/beth-app`. The configuration file
`apps/beth-app/shopify.app.toml` is the source of truth: you never edit scopes, webhooks or the
app proxy in the Dev Dashboard by hand.

_Last updated: 2026-11-17_

## What the configuration contains

| Item | Value | Effect on the store |
|---|---|---|
| Access scopes | `read_products`, `read_inventory`, `read_content`, `read_online_store_pages`, `read_legal_policies`, `write_app_proxy` | Read only for store data. `write_app_proxy` is required by Shopify for every app with an app proxy (it covers only the `/apps/beth` proxy route). Beth cannot change products, prices, orders or content. |
| Webhooks | `app/uninstalled`, `app/scopes_update`, `products/create`, `products/update`, `products/delete`, `inventory_levels/update`, the 3 privacy compliance topics | Shopify notifies Beth. Nothing changes in the store. |
| Events | `Article` create, update, delete (Recipes blog) | Same as above |
| App proxy | `https://www.360cookware.com/apps/beth/*` → `https://beth-lw31.onrender.com/proxy/*` | A new URL path on the storefront. Shopify signs every request. |
| Theme app extension | App embed "Beth concierge" (`beth-loader.js`, 2 KB gzipped) | Nothing until someone enables the embed in a theme **and** Beth is switched on. It renders nothing while the app-owned flag `beth.widget_enabled` is off. |
| App URL | `https://beth-lw31.onrender.com` | Render web service `beth` (staging, free plan). |

`read_orders` (order attribution) is added in the analytics phase. Adding a scope later needs one
approval in the admin.

## Why the store's own organization

Create the app in the **organization that owns 360cookware.myshopify.com** (not in a Partner
organization):

- It installs directly from the app's **Installs** card. No custom distribution link is needed.
- Shopify requires an IP allowlist for custom apps installed on stores **outside** the owning
  organization (new installs from November 20, 2026, existing installs from January 1, 2027).
  Apps created by the merchant in the Dev Dashboard and installed in their own organization are
  not affected. Shopify still recommends an allowlist, so step 8 adds one.

## Part A — Create the app and deploy the configuration (now, about 10 minutes)

Nothing in this part changes the store: the app is not installed yet.

1. **Push the local commits.** The tooling that built this repo has no GitHub credentials, so the
   commits are only in your local clone. From the repo folder:

   ```powershell
   git push origin main
   ```

2. **Install the Shopify CLI** (Node 22.12+ is already required by the repo):

   ```powershell
   npm install -g @shopify/cli@latest
   shopify version
   ```

3. **Create the app in the Dev Dashboard.**
   1. Open <https://dev.shopify.com/dashboard> (also reachable from the Shopify admin through
      **Settings → Apps → Develop apps**).
   2. Check that the organization selected at the top is the one that owns `360cookware.myshopify.com`.
   3. **Apps → Create app → Start from Dev Dashboard**. Name: `Beth`. **Create**.
   4. Copy the **Client ID**. You do not need to create a version in the dashboard: the CLI does it
      in step 5. Do not copy the client secret anywhere yet.

4. **Link the repo to the app.** Paste the Client ID in `apps/beth-app/shopify.app.toml`:

   ```toml
   client_id = "<the client ID>"
   ```

   The client ID is public. Commit and push it:

   ```powershell
   git add apps/beth-app/shopify.app.toml
   git commit -m "Link Beth app (client ID)"
   git push origin main
   ```

5. **Deploy the configuration and the theme app extension.**

   ```powershell
   npm install
   npm run deploy:shopify      # from the repo root (or `shopify app deploy` inside apps/beth-app)
   ```

   The CLI opens the browser to log in, shows the changes (scopes, webhooks, events, app proxy and
   the `beth-embed` extension) and asks to release a new version. Answer **Yes**.

   Expected result: version 1 of Beth appears under **Versions** in the Dev Dashboard. If the CLI
   reports a validation error, copy the message: it means a field must change in
   `shopify.app.toml`.

## Part B — Hosting, install and staging (at the end, with blockers B2 and B3)

6. **Hosting** (Render, as planned in the architecture and cost model):
   - PostgreSQL 16 database.
   - Web service from this repo, Node 22:
     - Build command: `npm ci --include=dev && npm run db:generate && npm run build` (`--include=dev` because `NODE_ENV=production` would skip the build tools)
     - Start command: `npm run db:migrate && npm run start -w beth-app`
     - Health check path: `/healthz`
   - Environment variables (secrets only in Render, never in the repo):

     | Variable | Value |
     |---|---|
     | `NODE_ENV` | `production` |
     | `SHOPIFY_API_KEY` | Client ID |
     | `SHOPIFY_API_SECRET` | Client secret (Dev Dashboard → Beth → Settings) |
     | `SHOPIFY_APP_URL` | `https://beth-lw31.onrender.com` |
     | `SCOPES` | `read_products,read_inventory,read_content,read_online_store_pages,read_legal_policies,write_app_proxy` |
     | `DATABASE_URL` | Render Postgres internal connection string |

   - Host: the Render subdomain `https://beth-lw31.onrender.com` (no DNS needed). To move to a custom domain later, update `application_url`, `[auth] redirect_urls`, `[app_proxy] url` and `SHOPIFY_APP_URL`, then run `npm run deploy:shopify`.

7. **Install** (needs your approval, because it is the first change on the production store):
   Dev Dashboard → Beth → **Installs** card → **Install app** → `360cookware` → review the read-only
   scopes → **Install**.

   On the first load of the app in the admin, Beth starts the initial knowledge sync (bulk export of
   the catalog plus the Recipes blog, usually 1–3 minutes). Check:
   - **Beth → Home**: the last sync shows `succeeded` with about 275 products and 274 articles.
   - **Beth → Knowledge quality**: the same conflicts and missing specs as `docs/data-quality/`.
   - `https://www.360cookware.com/apps/beth/health` returns `{"ok":true,...}`.

8. **IP allowlist (recommended):** in the Dev Dashboard, open Beth's IP allowlist settings and allow
   the Render service's outbound IP addresses (or Render's ASN plus the country where the service
   runs). Admin API calls from anywhere else are then rejected, which limits the impact of a leaked
   token.

9. **Staging theme** — use **Beth Updates** (`gid://shopify/OnlineStoreTheme/170070245465`,
   unpublished, verified 2026-11-17): Online Store → Themes → Beth Updates → **Customize → App
   embeds → Beth concierge → On** → Save. The launcher stays hidden until the widget is ready and
   switched on from the Beth admin. The live theme is never changed without your approval.

## Local development (optional)

`shopify app dev` previews the app on a **dev store** through a tunnel without touching the
released version. Create one with `shopify store create dev --name "Beth dev" --plan plus`, then:

```powershell
docker run -d --name beth-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/postgres"
npm run dev
```

A dev store has no 360 Cookware catalog. The knowledge engines are tested against the recorded
fixtures instead (`npm test`), and against real PostgreSQL when `BETH_TEST_DATABASE_URL` is set.

## Verified so far (without the app credentials)

| Check | How | Result |
|---|---|---|
| Admin GraphQL documents | Executed read-only against the live store (product by ID, articles page, recipes blog, bulk-query field selection) | ✅ Valid on API 2026-10 |
| `bulkOperationRunQuery` signature | Schema lookup: `groupObjects: Boolean!` is required in 2026-10 | ✅ Sent as `false` |
| Mapping Admin API → engine inputs | Reproduces the 2026-11-17 fixtures exactly (all 275 products and 274 articles) | ✅ |
| Full sync pipeline | Fake Admin API built from the fixtures + real PostgreSQL 16 | ✅ 275 products, 274 articles, 4 conflicts, 111 recommendable |
| Production build | `react-router build`, then `/healthz`, `/readyz`, signed and unsigned app proxy requests, unsigned webhook | ✅ 200, 200, 200/503, 400, 400 |
| Migration SQL | Applied to PostgreSQL 16 (13 tables, 30 indexes) | ✅ The Prisma drift check runs in CI (blocked in the build sandbox) |
| `shopify app deploy` | Needs your login | ⏳ Part A, step 5 |
