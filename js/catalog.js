// Loads the product catalogue (categories + products) from Supabase, once per page, for every page
// that shows or searches products. supabase/schema.sql makes both tables publicly readable — no
// login needed to browse. Until the admin (js/auth.js's is_admin, mobile 7500673358) has added
// anything, both lists are empty and callers should render an empty state, not an error.
(function () {
  "use strict";

  var auth = window.VitcoAuth;
  var state = { categories: [], products: [], loaded: false, ok: !auth || !auth.isConfigured() };

  function bySortOrder(a, b) { return a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at); }

  function finish() {
    state.loaded = true;
    window.dispatchEvent(new CustomEvent("vitco:catalog-ready", { detail: state }));
  }

  if (!auth || !auth.isConfigured()) {
    finish();
  } else {
    // A stalled request (seen with concurrent fetches during a network failure) must not leave the
    // page waiting forever — give up after 12s and show the "unavailable" state instead.
    var timeout = new Promise(function (resolve) { window.setTimeout(function () { resolve({ timedOut: true }); }, 12000); });
    Promise.race([
      auth.getClient().then(function (client) {
        return Promise.all([
          client.from("categories").select("id,slug,name_en,name_hi,sort_order,created_at"),
          client.from("products").select("id,category_id,slug,name_en,name_hi,sort_order,created_at,image_url,price,discount_price,description,gallery_images,video_urls,specs")
        ]);
      }),
      timeout
    ]).then(function (result) {
      if (result && result.timedOut) throw new Error("timed out");
      if (result[0].error || result[1].error) throw result[0].error || result[1].error;
      state.categories = result[0].data.sort(bySortOrder);
      state.products = result[1].data.sort(bySortOrder);
      state.ok = true;
    }).catch(function () {
      state.ok = false; // network/config problem — distinct from "ok, just empty"
    }).then(finish);
  }

  // t(row, "name") picks name_en/name_hi for the page's current language, falling back to English.
  function t(row, field) {
    var lang = document.documentElement.lang === "hi" ? "hi" : "en";
    return row[field + "_" + lang] || row[field + "_en"] || "";
  }

  function byId(id) { return state.categories.filter(function (c) { return c.id === id; })[0] || null; }
  function bySlug(slug) { return state.products.filter(function (p) { return p.slug === slug; })[0] || null; }

  // Indian grouping, no paise on the storefront (₹45,000 not ₹45,000.00) — admin can still type
  // cents into the price field, this just doesn't show them since VITCO's prices are always whole.
  function formatPrice(n) { return "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 }); }
  function discountPercent(price, discountPrice) { return Math.round((1 - discountPrice / price) * 100); }

  var api = {
    state: state,
    ready: function (cb) { state.loaded ? cb(state) : window.addEventListener("vitco:catalog-ready", function () { cb(state); }, { once: true }); },
    categoryName: function (cat) { return t(cat, "name"); },
    productName: function (prod) { return t(prod, "name"); },
    categoryById: byId,
    productBySlug: bySlug,
    productsInCategory: function (categoryId) { return state.products.filter(function (p) { return p.category_id === categoryId; }); },
    formatPrice: formatPrice,
    discountPercent: discountPercent
  };
  window.VitcoCatalog = api;

  // Footer's "Product range" column, present on every page — hidden until there's something to list.
  function renderFooterCategories() {
    var list = document.getElementById("footerCategories");
    var wrap = document.getElementById("footerCategoriesWrap");
    if (!list || !wrap) return;
    var cats = state.categories.slice(0, 6);
    wrap.hidden = cats.length === 0;
    list.innerHTML = cats.map(function (c) {
      return '<li><a href="index.html#' + c.slug + '">' + api.categoryName(c).replace(/[&<>"']/g, function (ch) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
      }) + '</a></li>';
    }).join("");
  }
  api.ready(renderFooterCategories);
  window.addEventListener("vitco:lang-changed", renderFooterCategories);
})();
