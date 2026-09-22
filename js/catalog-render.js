// Renders the home page's product grid from the Supabase catalogue (js/catalog.js). Runs once when
// the catalogue first loads and again whenever the language changes, since product/category names
// come from the database rather than the i18n dictionary main.js's generic sweep already handles.
(function () {
  "use strict";

  var root = document.getElementById("catalogRoot");
  if (!root) return;

  function t(key, fallback) {
    var lang = document.documentElement.lang === "hi" ? "hi" : "en";
    var dict = (window.I18N && window.I18N[lang]) || {};
    return dict[key] != null ? dict[key] : fallback;
  }

  var packageIconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg>';
  var tagIconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L2.5 12.5V3h9.5l8.59 8.59a2 2 0 0 1 0 2.82Z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>';
  var plusIconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M12 5v14M5 12h14"/></svg>';
  var cartIconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>';

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function priceBlockHtml(catalog, p) {
    if (p.price == null) return '<span class="price-now" data-i18n="common.priceTBD">' + esc(t("common.priceTBD")) + '</span>';
    if (p.discount_price != null) {
      return '<span class="price-now">' + esc(catalog.formatPrice(p.discount_price)) + '</span>' +
        '<span class="price-was">' + esc(catalog.formatPrice(p.price)) + '</span>' +
        '<span class="price-off">' + catalog.discountPercent(p.price, p.discount_price) + '% ' + esc(t("common.off", "OFF")) + '</span>';
    }
    return '<span class="price-now">' + esc(catalog.formatPrice(p.price)) + '</span>';
  }

  function productCardHtml(catalog, p, catName) {
    var name = catalog.productName(p);
    var href = "product.html?id=" + encodeURIComponent(p.slug);
    var media = p.image_url
      ? '<img src="' + esc(p.image_url) + '" alt="" loading="lazy">'
      : packageIconSvg;
    return (
      '<div class="product-card" data-product-key="' + esc(p.slug) + '" data-product-name="' + esc(p.name_en) + '" data-product-category="' + esc(catName || "") + '" data-product-image="' + esc(p.image_url || "") + '">' +
      '  <a class="product-card-media" aria-hidden="true" href="' + href + '" tabindex="-1">' + media + '</a>' +
      '  <div class="product-card-body">' +
      '    <h4><a class="product-card-name-link" href="' + href + '">' + esc(name) + '</a></h4>' +
      '    <div class="product-card-price">' + priceBlockHtml(catalog, p) + '</div>' +
      '    <div class="product-card-actions">' +
      '      <button type="button" class="btn-icon" data-i18n-title="common.addToCart" title="' + esc(t("common.addToCart")) + '" aria-label="' + esc(t("common.addToCart")) + '">' + cartIconSvg + '</button>' +
      '      <button type="button" class="btn btn-primary btn-xs" data-i18n="common.buyNow">' + esc(t("common.buyNow")) + '</button>' +
      '    </div>' +
      '  </div>' +
      '</div>'
    );
  }

  function categorySectionHtml(catalog, cat) {
    var products = catalog.productsInCategory(cat.id);
    if (!products.length) return "";
    var catName = catalog.categoryName(cat);
    return (
      '<div class="category-section" id="' + esc(cat.slug) + '">' +
      '  <div class="container" style="padding:0;">' +
      '    <div class="category-heading"><div class="category-heading-text"><h3>' + esc(catName) + '</h3></div></div>' +
      '    <div class="product-grid">' + products.map(function (p) { return productCardHtml(catalog, p, catName); }).join("") + '</div>' +
      '  </div>' +
      '</div>'
    );
  }

  // Links to admin-category.html / admin-product.html for the admin (mobile 7500673358).
  // Shown regardless of whether the catalogue is empty.
  function adminPanelHtml() {
    return (
      '<div class="catalog-admin">' +
      '  <div class="catalog-admin-head"><h3 data-i18n="admin.panelTitle">' + esc(t("admin.panelTitle")) + '</h3></div>' +
      '  <p class="catalog-admin-hint" data-i18n="admin.panelHint">' + esc(t("admin.panelHint")) + '</p>' +
      '  <div class="catalog-admin-actions">' +
      '    <a href="admin-category.html" class="catalog-admin-tile">' +
      '      <span class="catalog-admin-tile-icon">' + tagIconSvg + '</span>' +
      '      <span data-i18n="admin.addCategory">' + esc(t("admin.addCategory")) + '</span>' +
      '    </a>' +
      '    <a href="admin-product.html" class="catalog-admin-tile">' +
      '      <span class="catalog-admin-tile-icon">' + plusIconSvg + '</span>' +
      '      <span data-i18n="admin.addProduct">' + esc(t("admin.addProduct")) + '</span>' +
      '    </a>' +
      '  </div>' +
      '</div>'
    );
  }
  function adminPanelIfAny() {
    return (window.VitcoAuth && window.VitcoAuth.isAdmin()) ? adminPanelHtml() : "";
  }

  // A link to index.html#slug (footer, product breadcrumbs) lands here before the catalogue has
  // fetched, so the browser's own jump-to-anchor happens too early and misses. Do it ourselves once
  // the matching section actually exists — but only right after load, not on every re-render.
  var didInitialHashScroll = false;
  function scrollToHashIfNeeded() {
    if (didInitialHashScroll) return;
    didInitialHashScroll = true;
    var id = window.location.hash.slice(1);
    if (!id) return;
    var el = document.getElementById(id);
    if (el) el.scrollIntoView({ block: "start" });
  }

  function render() {
    var catalog = window.VitcoCatalog;
    if (!catalog) return;
    var state = catalog.state;

    if (!state.ok) {
      root.innerHTML = adminPanelIfAny() + '<div class="acct-empty"><p data-i18n="catalog.unavailable">' + esc(t("catalog.unavailable", "Couldn't load the catalogue. Please check your internet and try again.")) + '</p></div>';
      return;
    }
    var sections = state.categories.map(function (c) { return categorySectionHtml(catalog, c); }).join("");
    if (!sections) {
      root.innerHTML = adminPanelIfAny() + '<div class="acct-empty"><p data-i18n="catalog.empty">' + esc(t("catalog.empty", "No products listed yet. Please check back soon.")) + '</p></div>';
      return;
    }
    root.innerHTML = adminPanelIfAny() + sections;
    scrollToHashIfNeeded();
  }

  if (window.VitcoCatalog) window.VitcoCatalog.ready(render); else window.addEventListener("vitco:catalog-ready", render, { once: true });
  window.addEventListener("vitco:lang-changed", render);
  // Shows/hides the admin panel immediately on login/logout, without needing a page reload.
  window.addEventListener("vitco:auth-changed", function () { if (window.VitcoCatalog && window.VitcoCatalog.state.loaded) render(); });
})();
