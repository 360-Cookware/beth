# 00 — Environment audit (Phase 0)

**Project:** Beth, AI Kitchen Concierge for 360 Cookware
**Audit date:** 2026-11-17
**Method:** Read-only inspection. Nothing in Shopify, the theme or any app was changed.

| Source inspected | How |
|---|---|
| Shopify store `360cookware.myshopify.com` | Admin GraphQL API 2026-10 (read-only queries) |
| Live theme and the unpublished "Beth" themes | Theme file inspection (read-only), storefront screenshot |
| Catalog (275 products) and the Recipes blog (274 articles) | Full export to `fixtures/shopify/` and analysis with `packages/core` |
| Traffic, conversion and AOV | ShopifyQL analytics (Nov 2025 – Nov 2026) |
| Public storefront | www.360cookware.com product and recipe pages |
| Repository and local environment | `C:\projects\360 Cookware\beth` → `github.com/360-Cookware/beth` |
| Provider pricing and APIs | Official OpenAI, Shopify and Render documentation and pricing pages (see `08-cost-model.md`) |

Generated data-quality reports: [`data-quality/product-knowledge.md`](data-quality/product-knowledge.md) and [`data-quality/recipe-knowledge.md`](data-quality/recipe-knowledge.md). They are produced by code (`npm run report:knowledge`), so the numbers below can be reproduced.

---

## 1. Store configuration

| Item | Finding |
|---|---|
| Plan | Shopify Plus (`plan.shopifyPlus = true`) |
| Primary domain | https://www.360cookware.com |
| Shop currency | USD. Presentment currencies: AUD, BRL, DKK, EUR, GBP, MXN, PLN, USD |
| Markets (active) | United States, EU, United Kingdom, Ireland, Australia, Mexico, South America, All B2B, B2B in EU. Canada and International are drafts. |
| Customer accounts | **Classic** customer accounts; login not required at checkout |
| Timezone | America/New_York |
| Languages | Langify and Translate & Adapt are installed. Several fields carry `{en, es}` JSON. |
| Policies | Refund, shipping, privacy and terms exist as Shopify policies (refund updated 2026-11-16) |

**Implications for Beth**

- International markets mean a shopper can see non-USD prices. Beth must show the price in the shopper's currency (resolved at request time with the Storefront API `@inContext(country)` and re-checked in the browser before add to cart), never a hard-coded USD price.
- Classic accounts: `logged_in_customer_id` is available through the app proxy, but Beth v1 does not need customer identity. It is anonymous by design.

## 2. Theme

| Item | Finding |
|---|---|
| Live theme | `360cookware-live-store/feat/BFCM-2026-Launch` (`gid://shopify/OnlineStoreTheme/169808986201`), published 2026-11-10 |
| Base | **Dawn 10.0.0**, heavily customized: 228 sections, 172 snippets, 238 assets, 86 templates, 52 locales |
| Source control | Theme names follow `360cookware-live-store/<branch>`, i.e. the GitHub theme integration with a `360cookware-live-store` repository |
| JavaScript | Vanilla JS and Dawn custom elements (`cart-drawer`, `product-form`), Dawn pub/sub (`PUB_SUB_EVENTS.cartUpdate`), jQuery, Swiper. **No React** in the theme. |
| Cart | `cart_type = drawer`. Dawn `CartDrawer.renderContents(response)` re-renders `#CartDrawer` and `cart-icon-bubble` from the Section Rendering API and opens the drawer. `product-form.js` posts to `routes.cart_add_url`. |
| BF2026 promotion | `snippets/price.liquid` shows a **visual** sale price from metafield `custom.bf2026_discount` (percent). `snippets/bf2026-auto-apply.liquid` wraps `window.fetch` and `XMLHttpRequest` and auto-applies code `BF2026` after any `/cart/add`. Product prices themselves are not changed. |
| Consent | `snippets/consent-gated-trackers.liquid` (added 2026-11-10) loads GTM/GA4, Clarity, TikTok and others only after Customer Privacy API consent. Justuno, SalesReps and Awin scripts are stripped from `content_for_header`. |
| Other storefront behavior | Predictive search on, quick-view modal, mobile sticky add-to-cart, PDP image zoom, Replo pages, "Build Your Own Set" bundle builder, many per-type product templates (`saute-pan`, `stock-pot`, `fry-pan`, …) |
| Layout files | `theme.liquid`, `checkout.liquid` (legacy), `landing-page.liquid`, `hello-fresh20.liquid`, `password.liquid` |
| Unpublished "Beth" themes | `360cookware-live-store/feat/beth-theme-update` and `Beth Updates` (both edited 2026-11-16). **They contain no Beth code**: identical file names to the live theme, identical `layout/` and `config/`. Only existing sections, snippets and templates differ, consistent with branch drift. |

**Implications for Beth**

- A **theme app extension (app embed block)** is the right integration. It needs no edits to theme files, can be toggled in the theme editor, and survives theme branch merges.
- The widget can reuse the theme cart: Ajax Cart API calls on the same origin, then `cart-drawer.renderContents()` with Section Rendering output. That keeps the drawer, the bubble count, Rebuy and the BF2026 auto-apply working, because the BF2026 wrapper also sees Beth's `/cart/add.js` request.
- Beth must mirror the BF2026 visual price exactly (same metafield, same `floor` arithmetic) or shoppers will see different prices in Beth and on the product page. This is implemented and tested in `packages/core/src/pricing/promotions.ts`.

## 3. Apps and integrations

**Theme app embeds enabled on the live theme:** langify, Klaviyo onsite, Attentive, Yotpo (settings), Videowise, Preorder Now Wolf, MNTN pixel, Patrol, Rivo loyalty. Yotpo "reviews tab" is disabled.

**Scripts in `theme.liquid`:** Rebuy (`rebuy.js`), Replo, Sezzle widget, Klaviyo subscribe, GTM/GA4, Clarity, TikTok (consent-gated).

**Installed apps relevant to Beth** (from `appInstallations`, about 60 apps in total):

| App | Relevance |
|---|---|
| Recipe Kit (Bolle Apps) | Stores structured recipes in article metafields. **Primary recipe source.** |
| Accentuate | Product metafields used by the PDP: spec table (`accentuate.ingredients`), "What's included" (`accentuate.includes`), intro (`accentuate.short_details`). **Primary spec source.** |
| Yotpo Product Reviews | Syncs `reviews.rating` and `reviews.rating_count`. Real social proof for cards. |
| Search & Discovery | Defines related and complementary product metafields (barely used: 1 product) |
| Preorder Now Wolf | Pre-order behaviour for "coming soon" items |
| Klaviyo, Attentive, Rivo, Justuno, Hextom shipping bar | Pop-ups, floating launchers and bars that compete for screen space with the Ask Beth launcher |
| Rebuy, Bundler | Cart and upsell logic on top of the theme cart |
| Langify, Translate & Adapt | Multilingual storefront |
| Flow, Klaviyo, Lodestar, Hawke AI (read-only), Metricos | Existing automation and analytics |

**Analytics already in place:** Shopify Analytics, GTM/GA4, Microsoft Clarity, TikTok, MNTN, Klaviyo, Attentive, Yotpo, Awin and SalesReps (stripped). Beth adds her own first-party events and pushes a small set of `dataLayer` events only when consent allows.

## 4. Catalog audit

Full numbers: [`data-quality/product-knowledge.md`](data-quality/product-knowledge.md).

| Metric | Value |
|---|---|
| Products in Shopify | 275 (145 active, 125 draft, 5 unlisted) |
| Active and on the Online Store | 139 |
| Recommendable now (active, online, purchasable, not a part or gift card, not "coming soon") | 111 |
| Online products by kind | Flatware 54, cookware 31, bakeware 14, sets 13, accessories 11, Epicurean boards and utensils 8, slow cookers 4, gift card 1, other 3 |
| Vendors (online) | Americraft Cookware 62, Liberty Tabletop 54, 360 Cookware 15, Epicurean 8 |
| Variants | 138 of 139 online products have a single variant. The gift card has 9. |
| Price range (online, excluding flatware) | $5.99 – $2,795.95, median $169.95 |
| "Coming soon" | 6 products tagged `coming_soon`, 5 of them sold as pre-order (`inventoryPolicy = CONTINUE`, 0 stock) |
| Condition lines | Factory Seconds, Factory Refurbished and Certified Pre-owned collections exist |
| Ratings | Yotpo-synced rating on 52 of 85 non-flatware online products |

**Where product facts live today** (and whether shoppers can see them):

| Source | Shopper-visible | Content | Coverage (online, non-flatware) |
|---|---|---|---|
| `descriptionHtml` | Yes | Marketing copy plus a "Product Features" list (diameter, oven safe, induction, gauge, grade, made in USA) | All |
| `accentuate.ingredients` | Yes (PDP "Full product details") | **Structured spec table**: diameters, height, gauge, material, oven safe, handle, cooktop, manufacturing | 63 / 85 |
| `accentuate.includes` | Yes (PDP "What's included") | Box contents (pan, cover, care guide, certificate) | 55 / 85 |
| `CW360_faq.care__product_guides` | Yes (PDP "Care & Product Guides") | Care: hand wash recommended, dishwasher not recommended | 66 / 85 |
| Title, tags (`Category_`, `Size_`, `Measure_`) | Title yes, tags no | Capacity ("3.5 Quart"), nominal size, category | All |
| `ptabs.tabs` | **No** (not rendered by the live theme) | Legacy "Product Features / In the Box" | 46 / 85, often **stale** |

No structured spec metafields (capacity, oven temperature, induction…) exist yet: `metafieldDefinitions` for products only contain review, Google Shopping, discovery and a few custom fields.

**Data-quality findings** (these block accurate answers; Beth refuses to state conflicting facts):

1. **Material grade conflicts visible to shoppers on 4 products.** For example, the 8.5 Inch Fry Pan spec table says T-316 while its description says T-304. Three sets say "T-316 and T-304" in the table but "T-304" in the description.
2. **Legacy `ptabs.tabs` contradicts the live page on 40 products.** It says "T-304" where the live page says T-316, and "Dishwasher Safe" where the care guide says dishwasher use is not recommended. It is not rendered, so Beth ignores it, but it should be cleaned up.
3. **Gaps:** capacity is stated for 26 of 62 core products, cooking diameter or dimensions for 38, induction for 38, cover included for 22. Many of these are inferable by a human but not stated, so Beth will not claim them until they are entered.
4. **Copy issues** that Beth must not repeat: some descriptions are templated ("Perfect Dinner Recipe" on every new recipe) and some titles have stray spaces ("8.5 Inch Stainless Steel  Fry Pan").

**Attributes Beth needs and where they come from** (canonical schema in `packages/core/src/products/spec-schema.ts`):

| Attribute | Available now | Gap and fix |
|---|---|---|
| Name, URL, image, price, variant, availability | Shopify product and variant fields | None. Price and availability are read live at request time. |
| Category and type | `productType`, `Category_` tags, taxonomy | Normalized into `kind` |
| Capacity, size, dimensions | Title, `Measure_` tags, spec table | Missing on many products. Add `beth.capacity_qt` etc. (see §8). |
| Cooking surface | Spec table "Inside Cooking Diameter / Dimensions" | Missing on 24 core products |
| Material and construction | Spec table and description | Fix the 4 conflicts |
| Induction | Spec table "Cooktop Compatibility", description | Missing on 24 core products |
| Oven-safe temperature | Spec table and description | Good coverage (53 / 62) |
| Cover included | Title "with Cover", includes | Partial |
| Handle configuration | Spec table, description, title ("Short Handles") | Partial |
| Cooking applications and recommended uses | Free copy only | Add a short "best for" list per product (merchant-written) |
| Compatibility with other cookware | Free copy only (e.g. Roasting Pan fits atop several pots) | Add a structured product-reference list |
| Related accessories | Search & Discovery fields almost unused, `CW360SetInclude` on 15 sets | Use set membership. Accessories can be curated in Beth settings. |

## 5. Recipe audit

Full numbers: [`data-quality/recipe-knowledge.md`](data-quality/recipe-knowledge.md).

| Metric | Value |
|---|---|
| Blogs | `recipes` (274 articles), `360-cookware-blog` (103), `press` (20) |
| Published recipe-blog articles | 259 |
| Structured recipes (Recipe Kit ingredients and directions) | 243 |
| Articles in the Recipes blog that are not recipes | 16 (e.g. "Can Stainless Steel Go in the Oven?") |
| Recipes linking to at least one active product | 210 (86%) |
| Distinct products linked | 44 |
| Recipes with prep time / cook time / servings | 29 / 28 / 43 (≈12–18%) |
| Broken or inactive product links | 9 handles (e.g. `4-quart-mixing-bowl`, `3-piece-mixing-bowl-set`: products deleted) |

**Structure.** Recipe Kit stores one JSON per article in metafield `recipekit.<articleId>` (newer recipes) or `recipekit.recipe_data` (12 older ones). The JSON holds the title, author, description HTML (usually "Products used: <link>"), ingredients, directions, ISO-8601 times, servings, category and tags. Article `body` is empty for recipes, so the HTML page is not the right source. A `custom.featured_product` reference exists on 15 articles.

**Most reliable sync.** Read the Recipe Kit metafields through the Admin API (no HTML scraping). Recipe→product links come from the "Products used" anchors, resolved against the live catalog by handle. Times and servings are shown only when present. Changes are picked up by Shopify event subscriptions on `Article` and its metafields where the API version supports them, plus a scheduled reconciliation (see `01-technical-architecture.md`).

## 6. Knowledge base, policies and promotions

- **Shopify knowledge-base metaobjects** (`shopify--knowledge-base-fact`, 20 entries): published entries point to the official refund, shipping, privacy and terms policies. Brand descriptions exist only as unpublished *suggestions*. Beth uses the published policies and official pages (Use & Care Guide, Lifetime Warranty) as her policy sources, never unpublished suggestions.
- **Discounts:** 40+ active code discounts, including influencer, affiliate, ID.me and VIP codes. **Beth never reveals or invents discount codes.** Only merchant-configured public promotions (currently BF2026) appear in Beth, through configuration.

## 7. Traffic and commercial baseline

From ShopifyQL, validating the proposal's figures:

| Metric | Value |
|---|---|
| Sessions per month (Nov 2025 – Oct 2026) | Average **136,658**, low 115,612, peak **177,932** (Dec 2025) |
| Device mix (12 months) | **72.5% mobile**, 25.6% desktop, 1.6% tablet |
| Conversion rate by month | 0.47% – 2.33% (mobile 0.74%, desktop 1.29%) |
| Average order value | ≈ $326 (monthly $299 – $356) |
| Orders per month | 758 – 2,843 |

The proposal's assumptions (≈137k sessions per month, ≈178k in December) are confirmed. The mobile-heavy, low-conversion profile supports a mobile-first, voice-capable assistant.

## 8. Existing infrastructure

| Item | Finding |
|---|---|
| Beth repository | `github.com/360-Cookware/beth`, one commit ("first commit") with a UTF-16 `README.md`. No code yet. |
| Theme repository | `360cookware-live-store` (GitHub-connected themes). Not needed for Beth if the theme app extension is used. |
| Existing Beth app, backend or hosting | **None found.** No Beth app installation, app proxy, metafield namespace or webhook exists. |
| Local development environment | Node 22.23, npm 10.9, git. The Shopify CLI is not installed in the project. |
| Credentials available to the build | None yet. Store data was read through an authorized admin connector for this audit only. |

## 9. Summary

### 9.1 What exists today

Shopify Plus store with Dawn-based theme and drawer cart. Structured specs in Accentuate metafields for about 74% of core products. Structured recipes in Recipe Kit for 243 recipes, 86% of them linked to products. Yotpo ratings. Consent-gated analytics. BF2026 promotion logic in the theme. Multi-market pricing.

### 9.2 What can be reused

- Ajax Cart API, Dawn cart drawer and Section Rendering (no new cart).
- Accentuate spec table, includes and care guide as verified product facts.
- Recipe Kit JSON as the recipe source, and "Products used" links as recipe→product mapping.
- Yotpo ratings for cards.
- Customer Privacy API consent signals.
- Shopify policies and official pages for policy answers.
- Existing GA4/GTM for top-level funnel events.

### 9.3 What needs modification (each needs merchant authorization before it is changed in production)

- Fix the 4 material conflicts and clean up `ptabs.tabs` (40 products).
- Add missing specs and new `beth.*` metafields (capacity, cooking surface, induction, cover, "best for", compatible products) with merchant review.
- Fix 9 broken recipe→product links.
- Enable the Beth app embed on the live theme (after staging tests).

### 9.4 What must be developed

The Shopify app (custom distribution) with app proxy, webhooks and admin dashboard. The knowledge engines and sync (engines done, sync pending credentials). The AI orchestration layer and controlled tools. The storefront widget (theme app extension and lazy UI bundle). Voice through GPT-Live. Analytics and attribution. Cost controls, tests and deployment.

### 9.5 Missing information and access (blockers)

| Needed | Why | Who |
|---|---|---|
| Shopify Partner / Dev Dashboard access to create the **Beth app** (custom distribution to 360cookware) | App proxy, theme app extension, webhooks and API credentials | 360 Cookware (store owner) |
| **OpenAI API project and key** with budget limits | Text and voice | 360 Cookware |
| **Render** (or chosen host) account and a production domain such as `beth-api.360cookware.com` | Backend hosting, Postgres, DNS | 360 Cookware |
| A development or staging store (or the unpublished theme on production) | End-to-end tests without touching the live theme | 360 Cookware |
| Merchant decisions | Brand voice approval, promotion wording, product "best for" copy, retention period for transcripts | Marketing and legal |

### 9.6 Risks

See `02-roadmap.md` §Risks for the full register. The main ones:

- **Data accuracy:** conflicting or missing specs lead to wrong answers. Mitigated by verified-only facts and conflict refusal, which is implemented.
- **Price mismatch:** markets and the BF2026 visual price. Mitigated by live localized prices and the mirrored promotion logic.
- **Screen real estate:** many floating widgets (Rivo, Klaviyo, Attentive, Hextom, sticky add-to-cart). The launcher position must be configurable and tested per page.
- **Performance:** the theme already loads many third-party scripts. Beth's loader stays under 10 KB and the UI is imported on interaction.
- **Prompt injection through catalog or recipe text:** treated as data only, and the model has no write tools.
- **Voice API maturity:** GPT-Live is new. A fallback to the Realtime API and to text is designed in.
- **Cost overrun:** budgets, per-session caps and alerts.

### 9.7 Recommended architecture

See [`01-technical-architecture.md`](01-technical-architecture.md). In short: a Shopify app (React Router template, TypeScript) on Render with Postgres and Prisma, exposing an app proxy plus a streaming API. A theme app extension provides the launcher, which lazy-loads a Preact widget. `packages/core` holds the knowledge engines and the controlled tools. OpenAI Responses runs text and GPT-Live runs voice, both through the same Beth engine via client delegation.
