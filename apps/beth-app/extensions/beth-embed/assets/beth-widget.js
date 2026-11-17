/*
 * Beth chat UI (theme app extension asset). Loaded on demand by beth-loader.js as a classic
 * script (no CORS requirements on the CDN), then started with window.BethWidget.mount(...).
 *
 * - Renders only typed blocks from the Beth API (text, notice, product_cards, comparison,
 *   recipe_cards, quick_replies). All text is inserted with textContent: no HTML from the server.
 * - Prices are re-read live from /products/<handle>.js, so they match the product page in the
 *   shopper's currency.
 * - Add to cart needs two explicit taps and reports success only after Shopify answers 200.
 * - Stores only the anonymous conversation ID and the visible transcript in sessionStorage.
 */

(function () {
  'use strict';
  const STORE_KEY = 'beth:v1';
  const SAME_SITE = /^https:\/\/www\.360cookware\.com(\/[^\s]*)?$/;

  const STYLES = `
:host{all:initial}
*{box-sizing:border-box}
.panel{position:fixed;z-index:2147483001;right:16px;bottom:16px;width:400px;max-width:calc(100vw - 32px);
  height:min(640px,calc(100vh - 32px));display:flex;flex-direction:column;background:#fff;color:#1a1a1a;
  border-radius:16px;box-shadow:0 18px 60px rgba(0,0,0,.25);font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;overflow:hidden}
.panel[hidden]{display:none}
.panel.left{right:auto;left:16px}
@media (max-width:749px){.panel,.panel.left{left:0;right:0;bottom:0;width:100%;max-width:100%;height:92vh;border-radius:16px 16px 0 0}}
header{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid #eee}
header .title{font-weight:700;font-size:16px}
header .sub{font-size:12px;color:#666}
header .close{margin-left:auto;border:0;background:none;font-size:22px;line-height:1;cursor:pointer;color:#333;padding:6px;border-radius:8px}
header .close:focus-visible,button:focus-visible,a:focus-visible,select:focus-visible,input:focus-visible{outline:3px solid #2c6ecb;outline-offset:2px}
.log>*{flex-shrink:0}
.log{flex:1;min-height:0;overflow-y:auto;padding:14px 14px 4px;display:flex;flex-direction:column;gap:10px;scroll-behavior:smooth}
.bubble{max-width:88%;padding:10px 12px;border-radius:14px;white-space:pre-wrap;word-wrap:break-word}
.bubble.beth{background:#f3f3f1;align-self:flex-start;border-bottom-left-radius:4px}
.bubble.user{background:#111;color:#fff;align-self:flex-end;border-bottom-right-radius:4px}
.notice{font-size:13px;padding:8px 10px;border-radius:10px;background:#eef4fb;color:#1d3d63}
.notice.warning{background:#fff4e5;color:#6b3d00}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{border:1px solid #ccc;background:#fff;border-radius:999px;padding:6px 12px;font:inherit;font-size:13px;cursor:pointer}
.chip:hover{border-color:#111}
.cards{display:flex;gap:10px;overflow-x:auto;padding-bottom:4px;scroll-snap-type:x mandatory}
.card{flex:0 0 230px;scroll-snap-align:start;border:1px solid #e6e6e6;border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:6px;background:#fff}
.card img{width:100%;aspect-ratio:1;object-fit:contain;background:#fafafa;border-radius:8px}
.card .label{align-self:flex-start;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;background:#111;color:#fff;border-radius:6px;padding:2px 6px}
.card a.name{color:#111;font-weight:600;text-decoration:none}
.card a.name:hover{text-decoration:underline}
.card .price{font-weight:700}
.card .rating{font-size:12px;color:#555}
.card ul{margin:0;padding-left:16px;font-size:12px;color:#444}
.card select{font:inherit;font-size:13px;padding:6px;border-radius:8px;border:1px solid #ccc}
.btn{border:0;border-radius:10px;background:#111;color:#fff;font:inherit;font-weight:600;padding:9px 12px;cursor:pointer}
.btn.confirm{background:#1f7a3a}
.btn[disabled]{opacity:.6;cursor:progress}
.status{font-size:12px}
.status.ok{color:#1f7a3a}.status.err{color:#a1261b}
.status a{color:inherit}
.table-wrap{overflow-x:auto;border:1px solid #e6e6e6;border-radius:12px}
table{border-collapse:collapse;font-size:12px;min-width:100%}
th,td{padding:7px 8px;border-bottom:1px solid #eee;text-align:left;vertical-align:top}
th[scope=row]{position:sticky;left:0;background:#fafafa;font-weight:600;white-space:nowrap}
thead th{font-weight:700;background:#fafafa}
td.na{color:#999;font-style:italic}
.recipe{display:flex;gap:10px;border:1px solid #e6e6e6;border-radius:12px;padding:8px}
.recipe img{width:72px;height:72px;object-fit:cover;border-radius:8px;flex:none}
.recipe a{color:#111;font-weight:600}
.recipe .meta{font-size:12px;color:#555}
.typing{align-self:flex-start;color:#777;font-size:13px}
form{display:flex;gap:8px;padding:10px 12px;border-top:1px solid #eee}
form input{flex:1;font:inherit;padding:10px 12px;border:1px solid #ccc;border-radius:10px}
.foot{font-size:11px;color:#888;text-align:center;padding:0 12px 8px}
@media (prefers-reduced-motion:reduce){.log{scroll-behavior:auto}}
`;

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : String(v));
    }
    for (const child of [].concat(children || [])) if (child) node.append(child);
    return node;
  }

  /** Same-site links become relative, so the shopper keeps their market and locale. */
  function safeHref(url) {
    if (typeof url !== 'string') return null;
    if (url.startsWith('/')) return url;
    const m = url.match(SAME_SITE);
    return m ? m[1] || '/' : null;
  }

  function load() {
    try {
      return JSON.parse(sessionStorage.getItem(STORE_KEY) || 'null') || { cid: null, log: [] };
    } catch {
      return { cid: null, log: [] };
    }
  }

  function save(state) {
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify({ cid: state.cid, log: state.log.slice(-40) }));
    } catch {
      /* storage unavailable: the chat still works for this page view */
    }
  }

  function mount({ config, launcher }) {
    const state = load();
    let recentHandles = [];
    let busy = false;
    const productCache = new Map();
    const money = (cents, currency) => {
      try {
        return new Intl.NumberFormat(config.locale || 'en-US', { style: 'currency', currency }).format(
          cents / 100,
        );
      } catch {
        return `${(cents / 100).toFixed(2)} ${currency}`;
      }
    };

    const host = el('div', { id: 'beth-chat', 'data-beth': true });
    const root = host.attachShadow({ mode: 'open' });
    const log = el('div', {
      class: 'log',
      role: 'log',
      'aria-live': 'polite',
      'aria-label': 'Conversation with Beth',
    });
    const input = el('input', {
      type: 'text',
      maxlength: 2000,
      placeholder: 'Ask about cookware or recipes\u2026',
      'aria-label': 'Message Beth',
      autocomplete: 'off',
    });
    const send = el('button', { class: 'btn', type: 'submit', text: 'Send' });
    const form = el(
      'form',
      {
        onsubmit: (e) => {
          e.preventDefault();
          ask(input.value);
        },
      },
      [input, send],
    );
    const close = el('button', {
      class: 'close',
      type: 'button',
      'aria-label': 'Close chat',
      text: '\u00d7',
      onclick: hide,
    });
    const panel = el(
      'div',
      {
        class: `panel${config.position === 'bottom-left' ? ' left' : ''}`,
        role: 'dialog',
        'aria-label': 'Beth, 360 Cookware kitchen concierge',
        hidden: true,
      },
      [
        el('header', {}, [
          el('div', {}, [
            el('div', { class: 'title', text: 'Beth' }),
            el('div', { class: 'sub', text: '360 Cookware kitchen concierge' }),
          ]),
          close,
        ]),
        log,
        form,
        el('div', {
          class: 'foot',
          text: 'Answers use 360 Cookware product information. Prices are confirmed at checkout.',
        }),
      ],
    );
    root.append(el('style', { text: STYLES }), panel);
    document.body.appendChild(host);
    panel.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hide();
    });

    function scroll() {
      log.scrollTop = log.scrollHeight;
    }

    function livePrice(card, priceEl) {
      const fallback = () => {
        if ((config.currency || 'USD') === card.currency) {
          priceEl.textContent =
            card.maxPriceCents > card.priceCents
              ? `From ${money(card.priceCents, card.currency)}`
              : money(card.priceCents, card.currency);
        }
      };
      let p = productCache.get(card.handle);
      if (!p) {
        p = fetch(`/products/${encodeURIComponent(card.handle)}.js`, { credentials: 'same-origin' })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);
        productCache.set(card.handle, p);
      }
      p.then((data) => {
        if (!data || typeof data.price !== 'number') return fallback();
        const cur = config.currency || card.currency;
        priceEl.textContent = data.price_varies
          ? `From ${money(data.price_min, cur)}`
          : money(data.price, cur);
      });
    }

    async function refreshCartBubble() {
      try {
        const res = await fetch('/?sections=cart-icon-bubble', { credentials: 'same-origin' });
        const json = await res.json();
        const html = json && json['cart-icon-bubble'];
        const target = document.getElementById('cart-icon-bubble');
        if (!html || !target) return;
        const parsed = new DOMParser().parseFromString(html, 'text/html');
        const inner = parsed.querySelector('.shopify-section') || parsed.body;
        target.innerHTML = inner.innerHTML;
      } catch {
        /* the cart page still shows the right count */
      }
    }

    function cartControls(card) {
      const wrap = el('div', {}, []);
      const available = card.variants.filter((v) => v.available);
      if (!card.available || available.length === 0) {
        wrap.append(el('div', { class: 'status', text: 'Currently unavailable' }));
        return wrap;
      }
      let select = null;
      if (card.variants.length > 1) {
        select = el(
          'select',
          { 'aria-label': `Option for ${card.title}` },
          card.variants.map((v) =>
            el('option', {
              value: v.id,
              disabled: !v.available,
              text: v.title + (v.available ? '' : ' (sold out)'),
            }),
          ),
        );
        select.value = available[0].id;
        wrap.append(select);
      }
      const status = el('div', { class: 'status', role: 'status' });
      let armed = false;
      const btn = el('button', { class: 'btn', type: 'button', text: 'Add to cart' });
      btn.addEventListener('click', async () => {
        if (!armed) {
          armed = true;
          btn.classList.add('confirm');
          btn.textContent = 'Confirm: add 1 to cart';
          return;
        }
        btn.disabled = true;
        status.className = 'status';
        status.textContent = 'Adding\u2026';
        const variantId = select ? select.value : available[0].id;
        try {
          const res = await fetch('/cart/add.js', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
              items: [{ id: Number(variantId), quantity: 1, properties: { _beth_cid: state.cid || '' } }],
            }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok)
            throw new Error(body.description || body.message || 'Shopify could not add this item.');
          status.className = 'status ok';
          status.textContent = '';
          status.append('Added to your cart. ', el('a', { href: '/cart', text: 'View cart' }));
          refreshCartBubble();
        } catch (error) {
          status.className = 'status err';
          status.textContent = String(error.message || error);
        } finally {
          armed = false;
          btn.disabled = false;
          btn.classList.remove('confirm');
          btn.textContent = 'Add to cart';
        }
      });
      wrap.append(btn, status);
      return wrap;
    }

    function renderBlock(block) {
      switch (block.type) {
        case 'text':
          return el('div', { class: 'bubble beth', text: block.text });
        case 'notice':
          return el('div', {
            class: `notice${block.tone === 'warning' ? ' warning' : ''}`,
            text: block.text,
          });
        case 'quick_replies':
          return el(
            'div',
            { class: 'chips' },
            block.options.map((o) =>
              el('button', { class: 'chip', type: 'button', text: o, onclick: () => ask(o) }),
            ),
          );
        case 'product_cards': {
          recentHandles = block.products.map((c) => c.handle);
          return el(
            'div',
            { class: 'cards' },
            block.products.map((card) => {
              const priceEl = el('div', { class: 'price', text: '' });
              livePrice(card, priceEl);
              const href = safeHref(card.url);
              return el('div', { class: 'card' }, [
                card.label ? el('span', { class: 'label', text: card.label }) : null,
                card.image
                  ? el('img', {
                      src: card.image.url.includes('?')
                        ? `${card.image.url}&width=400`
                        : `${card.image.url}?width=400`,
                      alt: card.image.alt || card.title,
                      loading: 'lazy',
                    })
                  : null,
                href
                  ? el('a', { class: 'name', href, text: card.title })
                  : el('div', { class: 'name', text: card.title }),
                priceEl,
                card.rating
                  ? el('div', {
                      class: 'rating',
                      text: `${card.rating.average.toFixed(1)} \u2605 (${card.rating.count} reviews)`,
                    })
                  : null,
                card.highlights.length
                  ? el(
                      'ul',
                      {},
                      card.highlights.map((h) => el('li', { text: h })),
                    )
                  : null,
                cartControls(card),
              ]);
            }),
          );
        }
        case 'comparison':
          return el(
            'div',
            { class: 'table-wrap' },
            el('table', {}, [
              el(
                'thead',
                {},
                el(
                  'tr',
                  {},
                  [el('th', { scope: 'col', text: '' })].concat(
                    block.columns.map((c) =>
                      el(
                        'th',
                        { scope: 'col' },
                        safeHref(c.url) ? el('a', { href: safeHref(c.url), text: c.title }) : c.title,
                      ),
                    ),
                  ),
                ),
              ),
              el(
                'tbody',
                {},
                block.rows.map((r) =>
                  el(
                    'tr',
                    {},
                    [el('th', { scope: 'row', text: r.label })].concat(
                      r.values.map((v) =>
                        el('td', { class: v == null ? 'na' : null, text: v == null ? 'Not stated' : v }),
                      ),
                    ),
                  ),
                ),
              ),
            ]),
          );
        case 'recipe_cards':
          return el(
            'div',
            { class: 'chips', style: 'flex-direction:column' },
            block.recipes.map((r) => {
              const meta = [
                r.totalMinutes ? `${r.totalMinutes} min` : null,
                r.servings ? `Serves ${r.servings}` : null,
              ]
                .filter(Boolean)
                .join(' \u00b7 ');
              const uses = r.products.length ? `Uses: ${r.products.map((p) => p.title).join(', ')}` : '';
              return el('div', { class: 'recipe' }, [
                r.image ? el('img', { src: r.image.url, alt: r.image.alt || '', loading: 'lazy' }) : null,
                el('div', {}, [
                  safeHref(r.url)
                    ? el('a', { href: safeHref(r.url), text: r.title })
                    : el('div', { text: r.title }),
                  meta ? el('div', { class: 'meta', text: meta }) : null,
                  uses ? el('div', { class: 'meta', text: uses }) : null,
                ]),
              ]);
            }),
          );
        default:
          return null;
      }
    }

    function append(entry) {
      if (entry.role === 'user') log.append(el('div', { class: 'bubble user', text: entry.text }));
      else
        for (const b of entry.blocks || []) {
          const n = renderBlock(b);
          if (n) log.append(n);
        }
      scroll();
    }

    async function ask(text) {
      const message = String(text || '').trim();
      if (busy) return;
      if (message) {
        const entry = { role: 'user', text: message.slice(0, 2000) };
        state.log.push(entry);
        append(entry);
      }
      input.value = '';
      busy = true;
      send.disabled = true;
      const typing = el('div', { class: 'typing', text: 'Beth is typing\u2026' });
      log.append(typing);
      scroll();
      try {
        const res = await fetch(`${config.proxy || '/apps/beth'}/chat`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            conversationId: state.cid,
            message,
            context: {
              productHandle: config.product || null,
              pageType: config.pageType || null,
              recentProductHandles: recentHandles,
            },
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok)
          throw new Error(
            res.status === 429
              ? 'You are sending messages quickly. Please wait a moment.'
              : 'Beth is unavailable right now. Please try again shortly.',
          );
        state.cid = body.conversationId || state.cid;
        const entry = { role: 'beth', blocks: Array.isArray(body.blocks) ? body.blocks : [] };
        state.log.push(entry);
        typing.remove();
        append(entry);
      } catch (error) {
        typing.remove();
        append({
          role: 'beth',
          blocks: [{ type: 'notice', tone: 'warning', text: String(error.message || error) }],
        });
      } finally {
        busy = false;
        send.disabled = false;
        save(state);
        input.focus();
      }
    }

    function show() {
      panel.hidden = false;
      launcher.setAttribute('aria-expanded', 'true');
      if (!log.childElementCount) {
        if (state.log.length) state.log.forEach(append);
        else ask('');
      }
      input.focus();
    }

    function hide() {
      panel.hidden = true;
      launcher.setAttribute('aria-expanded', 'false');
      launcher.focus();
    }

    show();
    return { open: () => (panel.hidden ? show() : hide()) };
  }

  window.BethWidget = { mount };
})();
