/*
 * Beth launcher loader (theme app extension asset, loaded deferred by the app embed).
 *
 * - Does nothing unless the embed rendered #beth-config (Beth enabled and page type allowed).
 * - Renders only the "Ask Beth" button, inside a Shadow DOM so theme CSS cannot leak in or out.
 * - Makes no network request on page load. On hover or focus it preloads the chat UI module;
 *   on click it imports beth-widget.js (a sibling asset on the Shopify CDN) and mounts it.
 * - No cookies, no storage, no customer data.
 */
(function () {
  'use strict';
  if (window.__bethLoader) return;
  window.__bethLoader = true;

  var script = document.currentScript;
  var configEl = document.getElementById('beth-config');
  if (!configEl) return;

  var config;
  try {
    config = JSON.parse(configEl.textContent || '{}');
  } catch {
    return;
  }

  var src = script && script.src ? script.src : '';
  var widgetUrl = src ? src.replace(/beth-loader\.js(\?.*)?$/, 'beth-widget.js') : '';
  var defaultLabel =
    typeof config.label === 'string' && config.label.trim() ? config.label.trim() : 'Ask Beth';
  var left = config.position === 'bottom-left';

  var host = document.createElement('div');
  host.id = 'beth-launcher';
  host.setAttribute('data-beth', '');
  var root = host.attachShadow({ mode: 'open' });
  root.innerHTML =
    '<style>' +
    ':host{all:initial;position:fixed;z-index:2147483000;' +
    (left ? 'left' : 'right') +
    ':16px;' +
    'bottom:calc(var(--beth-offset,24px) + env(safe-area-inset-bottom,0px));}' +
    'button{display:inline-flex;align-items:center;gap:8px;min-height:48px;padding:0 18px 0 14px;' +
    'border:0;border-radius:999px;background:var(--beth-bg,#111);color:var(--beth-fg,#fff);' +
    'font:600 15px/1.2 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;letter-spacing:.01em;' +
    'box-shadow:0 6px 24px rgba(0,0,0,.18);cursor:pointer;transition:transform .15s ease,box-shadow .15s ease;}' +
    'button:hover{transform:translateY(-1px);box-shadow:0 10px 28px rgba(0,0,0,.22);}' +
    'button:focus-visible{outline:3px solid #fff;box-shadow:0 0 0 6px var(--beth-bg,#111);}' +
    'button[aria-busy="true"]{cursor:progress;opacity:.85;}' +
    'button[data-state="error"]{background:#5c1a1a;}' +
    '.dot{width:10px;height:10px;border-radius:50%;background:#7fd18b;box-shadow:0 0 0 3px rgba(127,209,139,.25);}' +
    '@media (prefers-reduced-motion:reduce){button{transition:none}button:hover{transform:none}}' +
    '@media print{:host{display:none}}' +
    '</style>' +
    '<button type="button" part="launcher" aria-haspopup="dialog" aria-expanded="false">' +
    '<span class="dot" aria-hidden="true"></span><span class="label"></span></button>';

  var button = root.querySelector('button');
  var label = root.querySelector('.label');
  label.textContent = defaultLabel;

  var mobile = window.matchMedia ? window.matchMedia('(max-width: 749px)') : null;
  function applyOffset() {
    var px = mobile && mobile.matches ? config.offsetMobile : config.offset;
    host.style.setProperty('--beth-offset', (Number(px) >= 0 ? Number(px) : 24) + 'px');
  }
  applyOffset();
  if (mobile && mobile.addEventListener) mobile.addEventListener('change', applyOffset);

  var preloaded = false;
  function preload() {
    if (preloaded || !widgetUrl) return;
    preloaded = true;
    var link = document.createElement('link');
    link.rel = 'modulepreload';
    link.href = widgetUrl;
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  }

  var loading = null;
  var widget = null;
  function open() {
    if (widget && typeof widget.open === 'function') {
      widget.open();
      return;
    }
    if (!widgetUrl || loading) return;
    button.setAttribute('aria-busy', 'true');
    loading = import(widgetUrl)
      .then(function (mod) {
        return mod.mount({ config: config, launcher: button, host: host });
      })
      .then(function (instance) {
        widget = instance || null;
      })
      .catch(function (error) {
        console.warn('[Beth] The chat could not be loaded.', error);
        button.setAttribute('data-state', 'error');
        label.textContent = 'Beth is unavailable right now';
        setTimeout(function () {
          button.removeAttribute('data-state');
          label.textContent = defaultLabel;
        }, 4000);
      })
      .then(function () {
        loading = null;
        button.removeAttribute('aria-busy');
      });
  }

  button.addEventListener('pointerenter', preload, { passive: true });
  button.addEventListener('focus', preload);
  button.addEventListener('click', open);

  function attach() {
    document.body.appendChild(host);
  }
  if (document.body) attach();
  else document.addEventListener('DOMContentLoaded', attach);
})();
