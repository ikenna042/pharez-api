/**
 * Light/dark theming for the Swagger UI docs page.
 *
 * Swagger UI ships a light-only stylesheet with high specificity, so the dark
 * theme works by declaring colour tokens on :root and repainting each surface
 * from those tokens. Keeping every colour in one place at the top means adding a
 * surface later is a one-line change rather than a hunt through the file.
 *
 * Theme resolution, in order:
 *   1. an explicit choice the visitor made, stored in localStorage
 *   2. otherwise the operating system preference (prefers-color-scheme)
 *
 * swagger-ui-express injects both the CSS and the JS at the end of <body>, but
 * before Swagger's own window.onload render, so the attribute is set before the
 * UI paints and there is no flash of the wrong theme.
 */

const themeCss = `
  /* ---- tokens: light (default) ---- */
  :root {
    --pz-bg:            #ffffff;
    --pz-bg-soft:       #fafafa;
    --pz-bg-raised:     #ffffff;
    --pz-bg-inset:      #f0f2f5;
    --pz-text:          #3b4151;
    --pz-text-strong:   #1b1b1b;
    --pz-text-muted:    #6b7280;
    --pz-border:        #d9dde3;
    --pz-border-soft:   #e8ebf0;
    --pz-accent:        #1976d2;
    --pz-code-bg:       #333333;
    --pz-code-text:     #ffffff;
    --pz-input-bg:      #ffffff;
    --pz-shadow:        rgba(0, 0, 0, 0.08);
    --pz-toggle-bg:     #ffffff;
    --pz-toggle-border: #d9dde3;
  }

  /* System preference, unless the visitor explicitly chose light. */
  @media (prefers-color-scheme: dark) {
    html:not([data-pz-theme="light"]) {
      --pz-bg:            #0f172a;
      --pz-bg-soft:       #131c31;
      --pz-bg-raised:     #1a2338;
      --pz-bg-inset:      #0b1222;
      --pz-text:          #cbd5e1;
      --pz-text-strong:   #f1f5f9;
      --pz-text-muted:    #94a3b8;
      --pz-border:        #2c3a52;
      --pz-border-soft:   #223049;
      --pz-accent:        #60a5fa;
      --pz-code-bg:       #0b1222;
      --pz-code-text:     #e2e8f0;
      --pz-input-bg:      #131c31;
      --pz-shadow:        rgba(0, 0, 0, 0.5);
      --pz-toggle-bg:     #1a2338;
      --pz-toggle-border: #2c3a52;
    }
  }

  /* An explicit choice always wins over the system preference. */
  html[data-pz-theme="dark"] {
    --pz-bg:            #0f172a;
    --pz-bg-soft:       #131c31;
    --pz-bg-raised:     #1a2338;
    --pz-bg-inset:      #0b1222;
    --pz-text:          #cbd5e1;
    --pz-text-strong:   #f1f5f9;
    --pz-text-muted:    #94a3b8;
    --pz-border:        #2c3a52;
    --pz-border-soft:   #223049;
    --pz-accent:        #60a5fa;
    --pz-code-bg:       #0b1222;
    --pz-code-text:     #e2e8f0;
    --pz-input-bg:      #131c31;
    --pz-shadow:        rgba(0, 0, 0, 0.5);
    --pz-toggle-bg:     #1a2338;
    --pz-toggle-border: #2c3a52;
  }

  /* ---- page chrome ---- */
  .swagger-ui .topbar { display: none; }

  body,
  .swagger-ui,
  .swagger-ui .wrapper {
    background: var(--pz-bg);
    color: var(--pz-text);
  }

  .swagger-ui .info .title { color: var(--pz-accent); }

  .swagger-ui .info li,
  .swagger-ui .info p,
  .swagger-ui .info table,
  .swagger-ui .info h1, .swagger-ui .info h2,
  .swagger-ui .info h3, .swagger-ui .info h4, .swagger-ui .info h5,
  .swagger-ui .markdown p, .swagger-ui .markdown li,
  .swagger-ui .renderedMarkdown p, .swagger-ui .renderedMarkdown li,
  .swagger-ui label,
  .swagger-ui .tab li,
  .swagger-ui .opblock-description-wrapper p,
  .swagger-ui .opblock-external-docs-wrapper p,
  .swagger-ui .opblock-title_normal p { color: var(--pz-text); }

  .swagger-ui a,
  .swagger-ui .info a { color: var(--pz-accent); }

  .swagger-ui hr { border-color: var(--pz-border-soft); }

  /* Servers bar and auth block */
  .swagger-ui .scheme-container,
  .swagger-ui .auth-container {
    background: var(--pz-bg-raised);
    box-shadow: 0 1px 2px 0 var(--pz-shadow);
  }
  .swagger-ui .auth-container { border-color: var(--pz-border-soft); }

  /* ---- operation blocks ---- */
  .swagger-ui .opblock-tag {
    color: var(--pz-text-strong);
    border-bottom-color: var(--pz-border-soft);
  }
  .swagger-ui .opblock-tag small { color: var(--pz-text-muted); }

  .swagger-ui .opblock {
    background: var(--pz-bg-raised);
    border-color: var(--pz-border);
    box-shadow: 0 0 3px var(--pz-shadow);
  }

  .swagger-ui .opblock .opblock-summary { border-color: var(--pz-border); }
  .swagger-ui .opblock .opblock-summary-path,
  .swagger-ui .opblock .opblock-summary-path__deprecated,
  .swagger-ui .opblock .opblock-summary-operation-id { color: var(--pz-text-strong); }
  .swagger-ui .opblock .opblock-summary-description { color: var(--pz-text-muted); }

  .swagger-ui .opblock .opblock-section-header {
    background: var(--pz-bg-soft);
    box-shadow: 0 1px 2px 0 var(--pz-shadow);
  }
  .swagger-ui .opblock .opblock-section-header h4,
  .swagger-ui .opblock .opblock-section-header > label { color: var(--pz-text-strong); }

  /* Method tints, darkened so the coloured left edge still reads on a dark page */
  html[data-pz-theme="dark"] .swagger-ui .opblock.opblock-get,
  html:not([data-pz-theme="light"]) .swagger-ui .opblock.opblock-get {
    background: rgba(97, 175, 254, 0.08);
  }
  html[data-pz-theme="dark"] .swagger-ui .opblock.opblock-post,
  html:not([data-pz-theme="light"]) .swagger-ui .opblock.opblock-post {
    background: rgba(73, 204, 144, 0.08);
  }
  html[data-pz-theme="dark"] .swagger-ui .opblock.opblock-put,
  html:not([data-pz-theme="light"]) .swagger-ui .opblock.opblock-put {
    background: rgba(252, 161, 48, 0.08);
  }
  html[data-pz-theme="dark"] .swagger-ui .opblock.opblock-delete,
  html:not([data-pz-theme="light"]) .swagger-ui .opblock.opblock-delete {
    background: rgba(249, 62, 62, 0.08);
  }
  html[data-pz-theme="dark"] .swagger-ui .opblock.opblock-patch,
  html:not([data-pz-theme="light"]) .swagger-ui .opblock.opblock-patch {
    background: rgba(80, 227, 194, 0.08);
  }

  /* ---- tables ---- */
  .swagger-ui table thead tr td,
  .swagger-ui table thead tr th {
    color: var(--pz-text-strong);
    border-bottom-color: var(--pz-border);
  }
  .swagger-ui table tbody tr td { border-color: var(--pz-border-soft); }

  .swagger-ui .parameter__name,
  .swagger-ui .response-col_status { color: var(--pz-text-strong); }
  .swagger-ui .parameter__type,
  .swagger-ui .parameter__in,
  .swagger-ui .parameter__extension,
  .swagger-ui .prop-format { color: var(--pz-text-muted); }

  /* ---- models ---- */
  .swagger-ui .model-box { background: var(--pz-bg-inset); }
  .swagger-ui .model,
  .swagger-ui .model-title,
  .swagger-ui section.models h4,
  .swagger-ui section.models h5 { color: var(--pz-text); }
  .swagger-ui section.models {
    background: var(--pz-bg-soft);
    border-color: var(--pz-border-soft);
  }
  .swagger-ui section.models .model-container { background: var(--pz-bg-inset); }
  .swagger-ui .prop-type { color: var(--pz-accent); }

  /* ---- form controls ---- */
  .swagger-ui input[type=text],
  .swagger-ui input[type=password],
  .swagger-ui input[type=email],
  .swagger-ui input[type=file],
  .swagger-ui input[type=search],
  .swagger-ui textarea {
    background: var(--pz-input-bg);
    color: var(--pz-text);
    border-color: var(--pz-border);
  }

  /* background-color, not the background shorthand: Swagger draws the dropdown
     chevron as a background image on this element, and the shorthand erases it. */
  .swagger-ui select {
    background-color: var(--pz-input-bg);
    color: var(--pz-text);
    border-color: var(--pz-border);
  }

  /* Parameters render disabled until "Try it out" is pressed, and Swagger styles
     that state at a higher specificity than the base control, so it has to be
     answered explicitly or the disabled select stays light on a dark page. */
  .swagger-ui input[disabled],
  .swagger-ui select[disabled],
  .swagger-ui textarea[disabled] {
    background-color: var(--pz-bg-inset);
    color: var(--pz-text-muted);
    border-color: var(--pz-border);
  }

  /* The stock chevron is a dark SVG; swap in a light one for dark backgrounds. */
  html[data-pz-theme="dark"] .swagger-ui select,
  html:not([data-pz-theme="light"]) .swagger-ui select {
    background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%2394a3b8'%3E%3Cpath d='M13.418 7.859a.695.695 0 0 1 .978 0 .68.68 0 0 1 0 .969l-3.908 3.83a.697.697 0 0 1-.979 0l-3.908-3.83a.68.68 0 0 1 0-.969.695.695 0 0 1 .978 0L10 11z'/%3E%3C/svg%3E");
  }

  .swagger-ui input::placeholder,
  .swagger-ui textarea::placeholder { color: var(--pz-text-muted); }

  .swagger-ui .btn {
    color: var(--pz-text);
    background: transparent;
    border-color: var(--pz-border);
  }
  .swagger-ui .btn.authorize { color: #49cc90; border-color: #49cc90; }
  .swagger-ui .btn.authorize svg { fill: #49cc90; }
  .swagger-ui .btn.execute { color: #fff; }

  /* ---- code samples ---- */
  .swagger-ui .highlight-code > .microlight,
  .swagger-ui .highlight-code > .microlight code,
  .swagger-ui .body-param__example,
  .swagger-ui .example {
    background: var(--pz-code-bg) !important;
    color: var(--pz-code-text) !important;
  }
  .swagger-ui .responses-inner h4,
  .swagger-ui .responses-inner h5 { color: var(--pz-text-strong); }

  /* ---- auth modal ---- */
  .swagger-ui .dialog-ux .modal-ux {
    background: var(--pz-bg-raised);
    border-color: var(--pz-border);
  }
  .swagger-ui .dialog-ux .modal-ux-header h3,
  .swagger-ui .dialog-ux .modal-ux-content h4,
  .swagger-ui .dialog-ux .modal-ux-content p { color: var(--pz-text); }
  .swagger-ui .dialog-ux .modal-ux-header { border-bottom-color: var(--pz-border); }

  /* Swagger draws its chevrons and lock icons as SVG with a hardcoded dark fill. */
  html[data-pz-theme="dark"] .swagger-ui .expand-methods svg,
  html[data-pz-theme="dark"] .swagger-ui .expand-operation svg,
  html[data-pz-theme="dark"] .swagger-ui .opblock-summary-control svg,
  html[data-pz-theme="dark"] .swagger-ui section.models h4 svg,
  html:not([data-pz-theme="light"]) .swagger-ui .expand-methods svg,
  html:not([data-pz-theme="light"]) .swagger-ui .expand-operation svg,
  html:not([data-pz-theme="light"]) .swagger-ui .opblock-summary-control svg,
  html:not([data-pz-theme="light"]) .swagger-ui section.models h4 svg {
    fill: var(--pz-text);
  }

  /* ---- the toggle ---- */
  .pz-theme-toggle {
    position: fixed;
    top: 14px;
    right: 16px;
    z-index: 9999;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 7px 13px;
    font: 600 13px/1 system-ui, -apple-system, "Segoe UI", sans-serif;
    color: var(--pz-text);
    background: var(--pz-toggle-bg);
    border: 1px solid var(--pz-toggle-border);
    border-radius: 999px;
    cursor: pointer;
    box-shadow: 0 2px 8px var(--pz-shadow);
    transition: background .15s ease, border-color .15s ease, transform .1s ease;
  }
  .pz-theme-toggle:hover { border-color: var(--pz-accent); }
  .pz-theme-toggle:active { transform: scale(0.97); }
  .pz-theme-toggle:focus-visible { outline: 2px solid var(--pz-accent); outline-offset: 2px; }
  .pz-theme-toggle svg { width: 15px; height: 15px; fill: currentColor; }

  @media (max-width: 640px) {
    .pz-theme-toggle { top: 10px; right: 10px; padding: 7px 10px; }
    .pz-theme-toggle .pz-theme-label { display: none; }
  }

  @media (prefers-reduced-motion: reduce) {
    .pz-theme-toggle { transition: none; }
  }
`;

const themeToggleJs = `
(function () {
  var STORAGE_KEY = 'pharez-docs-theme';
  var root = document.documentElement;

  var systemPrefersDark = function () {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  };

  var stored = function () {
    // Private browsing and blocked site data both make localStorage throw.
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  };

  // ?theme=dark / ?theme=light renders the page in a given theme, which makes
  // the docs link shareable in a specific mode. Deliberately not persisted: a
  // link someone sent you should not silently rewrite your own preference.
  var fromQuery = function () {
    var match = /[?&]theme=(dark|light)\\b/.exec(window.location.search);
    return match ? match[1] : null;
  };

  var apply = function (theme) {
    if (theme) root.setAttribute('data-pz-theme', theme);
    else root.removeAttribute('data-pz-theme');
  };

  var isDark = function () {
    var choice = root.getAttribute('data-pz-theme');
    if (choice) return choice === 'dark';
    return systemPrefersDark();
  };

  // Applied before Swagger's own window.onload render, so the page never
  // paints in the wrong theme first.
  apply(fromQuery() || stored());

  var SUN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-14a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V4a1 1 0 0 1 1-1zm0 16a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1zM4 11a1 1 0 1 1 0 2H3a1 1 0 1 1 0-2h1zm17 0a1 1 0 1 1 0 2h-1a1 1 0 1 1 0-2h1zM5.6 4.2l.7.7a1 1 0 0 1-1.4 1.4l-.7-.7a1 1 0 0 1 1.4-1.4zm12.7 12.7l.7.7a1 1 0 0 1-1.4 1.4l-.7-.7a1 1 0 0 1 1.4-1.4zM4.2 18.4l.7-.7a1 1 0 0 1 1.4 1.4l-.7.7a1 1 0 0 1-1.4-1.4zM16.9 5.7l.7-.7a1 1 0 1 1 1.4 1.4l-.7.7a1 1 0 0 1-1.4-1.4z"/></svg>';
  var MOON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

  var button = document.createElement('button');
  button.className = 'pz-theme-toggle';
  button.type = 'button';

  var render = function () {
    var dark = isDark();
    // The button advertises what it will switch TO, which is what people expect.
    button.innerHTML = (dark ? SUN : MOON) +
      '<span class="pz-theme-label">' + (dark ? 'Light' : 'Dark') + '</span>';
    button.setAttribute('aria-label', 'Switch to ' + (dark ? 'light' : 'dark') + ' theme');
    button.setAttribute('aria-pressed', String(dark));
  };

  button.addEventListener('click', function () {
    var next = isDark() ? 'light' : 'dark';
    apply(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch (e) { /* not fatal */ }
    render();
  });

  // Follow the system while the visitor has not chosen for themselves.
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onChange = function () { if (!stored()) render(); };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  render();

  var mount = function () {
    if (!document.body.contains(button)) document.body.appendChild(button);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
`;

module.exports = { themeCss, themeToggleJs };
