// product.html — renders one product from the Supabase catalogue (js/catalog.js). Re-renders on
// vitco:lang-changed since the product/category name comes from the database, not the i18n
// dictionary main.js's generic sweep already retranslates on its own.
(function () {
  "use strict";

  var root = document.getElementById("pdpRoot");
  if (!root) return;

  function lang() { return document.documentElement.lang === "hi" ? "hi" : "en"; }
  function t(key, fallback) {
    var dict = (window.I18N && window.I18N[lang()]) || {};
    var en = (window.I18N && window.I18N.en) || {};
    return dict[key] != null ? dict[key] : (en[key] != null ? en[key] : fallback || key);
  }

  var id = new URLSearchParams(window.location.search).get("id") || "";

  var packageIconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg>';
  var checkIconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>';
  var arrowIconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';
  var cartIconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>';

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function waLink(text) { return "https://wa.me/919917045963?text=" + encodeURIComponent(text); }

  // Recognises youtube.com/watch, youtu.be, /shorts/ and /embed/ links so they can be embedded
  // directly; anything else (Drive, Vimeo, etc.) just gets rendered as a "Watch video" link instead.
  function youtubeEmbedUrl(url) {
    var m = String(url || "").match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{6,15})/);
    return m ? "https://www.youtube.com/embed/" + m[1] : null;
  }

  function renderUnavailable() {
    root.innerHTML =
      '<section class="pdp-not-found"><div class="container">' +
      '  <h1 data-i18n="acct.unavailableTitle">' + esc(t("acct.unavailableTitle")) + '</h1>' +
      '  <p data-i18n="catalog.unavailable">' + esc(t("catalog.unavailable")) + '</p>' +
      '  <a class="btn btn-primary" href="index.html" data-i18n="pdp.notFoundCta">' + esc(t("pdp.notFoundCta")) + '</a>' +
      '</div></section>';
    document.title = "VITCO";
  }

  function renderNotFound() {
    root.innerHTML =
      '<section class="pdp-not-found"><div class="container">' +
      '  <h1 data-i18n="pdp.notFoundTitle">' + esc(t("pdp.notFoundTitle")) + '</h1>' +
      '  <p data-i18n="pdp.notFoundBody">' + esc(t("pdp.notFoundBody")) + '</p>' +
      '  <a class="btn btn-primary" href="index.html" data-i18n="pdp.notFoundCta">' + esc(t("pdp.notFoundCta")) + '</a>' +
      '</div></section>';
    document.title = t("pdp.notFoundTitle") + " — VITCO";
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

  function renderProduct(catalog, product) {
    var category = product.category_id ? catalog.categoryById(product.category_id) : null;
    var name = catalog.productName(product);
    var catName = category ? catalog.categoryName(category) : "";
    var catHref = category ? "index.html#" + category.slug : "index.html";
    var waEnquire = waLink("I'm interested in VITCO " + product.name_en + (catName ? " (" + catName + ")" : "") + ". Please share price and availability.");

    document.title = name + (catName ? " — " + catName : "") + " — VITCO";
    var metaDesc = document.getElementById("pageDescription");
    if (metaDesc) metaDesc.setAttribute("content", name + " — VITCO dairy equipment, Vijay Trading Corporation, Agra.");

    var related = category ? catalog.productsInCategory(category.id).filter(function (p) { return p.id !== product.id; }).slice(0, 6) : [];

    var html = "";

    html += (
      '<nav class="pdp-breadcrumb" aria-label="Breadcrumb">' +
      '  <div class="container pdp-breadcrumb-row">' +
      '    <a href="index.html#top" data-i18n="pdp.breadcrumbHome">' + esc(t("pdp.breadcrumbHome")) + '</a>' +
      (category ? '    <span aria-hidden="true">/</span><a href="' + catHref + '">' + esc(catName) + '</a>' : '') +
      '    <span aria-hidden="true">/</span>' +
      '    <span class="pdp-breadcrumb-current">' + esc(name) + '</span>' +
      '  </div>' +
      '</nav>'
    );

    var allImages = [product.image_url].concat(product.gallery_images || []).filter(Boolean);
    var hasImage = allImages.length > 0;
    var galleryMedia = hasImage
      ? '<img id="pdpMainImg" src="' + esc(allImages[0]) + '" alt="' + esc(name) + '">'
      : packageIconSvg;
    var thumbsHtml = allImages.length > 1
      ? '<div class="pdp-gallery-thumbs">' + allImages.map(function (src, i) {
          return '<button type="button" class="pdp-gallery-thumb' + (i === 0 ? " is-active" : "") + '" data-src="' + esc(src) + '"><img src="' + esc(src) + '" alt=""></button>';
        }).join('') + '</div>'
      : '';
    var pdpPrice = product.price == null
      ? '<span class="pdp-price" data-i18n="common.priceTBD">' + esc(t("common.priceTBD")) + '</span>'
      : product.discount_price != null
        ? '<span class="pdp-price">' + esc(catalog.formatPrice(product.discount_price)) + '</span>' +
          '<span class="pdp-price-was">' + esc(catalog.formatPrice(product.price)) + '</span>' +
          '<span class="pdp-price-off">' + catalog.discountPercent(product.price, product.discount_price) + '% ' + esc(t("common.off", "OFF")) + '</span>'
        : '<span class="pdp-price">' + esc(catalog.formatPrice(product.price)) + '</span>';

    html += (
      '<section class="pdp-hero">' +
      '  <div class="container pdp-hero-grid" data-product-key="' + esc(product.slug) + '" data-product-name="' + esc(product.name_en) + '" data-product-category="' + esc(catName || "") + '" data-product-image="' + esc(product.image_url || "") + '">' +
      '    <div class="pdp-gallery">' +
      '      <div class="pdp-gallery-main' + (hasImage ? " has-image" : "") + '">' + galleryMedia + '</div>' +
      thumbsHtml +
      (hasImage ? '' : '      <div class="pdp-gallery-note" data-i18n="pdp.galleryNote">' + esc(t("pdp.galleryNote")) + '</div>') +
      '    </div>' +
      '    <div class="pdp-info">' +
      (category ? '      <a class="pdp-cat-link" href="' + catHref + '">' + esc(catName) + '</a>' : '') +
      '      <h1>' + esc(name) + '</h1>' +
      '      <div class="pdp-price-row">' +
      pdpPrice +
      '      </div>' +
      (product.description
        // Rendered unescaped — this is trusted admin-authored HTML from the mini rich-text editor
        // in admin-product.html (bold/italic/underline/lists only), never visitor input.
        ? '      <div class="pdp-description-body">' + product.description + '</div>'
        : '') +
      '      <div class="pdp-cta-row">' +
      '        <button type="button" class="btn-icon pdp-cart-btn" data-i18n-title="common.addToCart" title="' + esc(t("common.addToCart")) + '" aria-label="' + esc(t("common.addToCart")) + '">' + cartIconSvg + '</button>' +
      '        <button type="button" class="btn btn-line" data-i18n="common.buyNow">' + esc(t("common.buyNow")) + '</button>' +
      '        <a class="btn btn-primary pdp-enquire-btn" href="' + waEnquire + '" target="_blank" rel="noopener" data-i18n="common.enquireWa">' + esc(t("common.enquireWa")) +
      '          ' + arrowIconSvg +
      '        </a>' +
      '      </div>' +
      '    </div>' +
      '  </div>' +
      '</section>'
    );

    if (product.video_urls && product.video_urls.length) {
      html += (
        '<section class="pdp-videos"><div class="container">' +
        '  <h2 data-i18n="pdp.videosTitle">' + esc(t("pdp.videosTitle", "Videos")) + '</h2>' +
        '  <div class="pdp-videos-grid">' +
        product.video_urls.map(function (v) {
          var embed = youtubeEmbedUrl(v);
          return embed
            ? '<div class="pdp-video-embed"><iframe src="' + esc(embed) + '" title="Product video" loading="lazy" allowfullscreen frameborder="0"></iframe></div>'
            : '<a class="pdp-video-link" href="' + esc(v) + '" target="_blank" rel="noopener">' + esc(t("pdp.watchVideo", "Watch video")) + arrowIconSvg + '</a>';
        }).join('') +
        '  </div>' +
        '</div></section>'
      );
    }

    var customSpecRows = (product.specs || []).map(function (s) {
      return '<tr><th>' + esc(s.label) + '</th><td>' + esc(s.value) + '</td></tr>';
    }).join('');

    html += (
      '<section class="pdp-specs">' +
      '  <div class="container">' +
      '    <h2 data-i18n="pdp.specsTitle">' + esc(t("pdp.specsTitle")) + '</h2>' +
      '    <table class="pdp-specs-table"><tbody>' +
      '      <tr><th data-i18n="pdp.specModel">' + esc(t("pdp.specModel")) + '</th><td>' + esc(name) + '</td></tr>' +
      customSpecRows +
      '    </tbody></table>' +
      '  </div>' +
      '</section>'
    );

    html += (
      '<section class="pdp-why">' +
      '  <div class="container">' +
      '    <h2 data-i18n="pdp.whyTitle">' + esc(t("pdp.whyTitle")) + '</h2>' +
      '    <ul class="pdp-why-grid">' +
      ["about.point1", "about.point2", "about.point3"].map(function (k) { return '<li>' + checkIconSvg + '<span data-i18n="' + k + '">' + esc(t(k)) + '</span></li>'; }).join('') +
      '    </ul>' +
      '  </div>' +
      '</section>'
    );

    if (related.length) {
      html += (
        '<section class="pdp-related"><div class="container">' +
        '  <h2 data-i18n="pdp.relatedTitle">' + esc(t("pdp.relatedTitle")) + '</h2>' +
        '  <div class="product-grid">' + related.map(function (p) { return productCardHtml(catalog, p, catName); }).join('') + '</div>' +
        '</div></section>'
      );
    }

    root.innerHTML = html;

    var mainImg = document.getElementById("pdpMainImg");
    root.querySelectorAll(".pdp-gallery-thumb").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (mainImg) mainImg.src = btn.dataset.src;
        root.querySelectorAll(".pdp-gallery-thumb").forEach(function (b) { b.classList.toggle("is-active", b === btn); });
      });
    });
  }

  function render() {
    var catalog = window.VitcoCatalog;
    if (!catalog) return;
    if (!catalog.state.ok) { renderUnavailable(); return; }
    var product = catalog.productBySlug(id);
    if (!product) { renderNotFound(); return; }
    renderProduct(catalog, product);
  }

  if (window.VitcoCatalog) window.VitcoCatalog.ready(render); else window.addEventListener("vitco:catalog-ready", render, { once: true });
  window.addEventListener("vitco:lang-changed", render);
})();
