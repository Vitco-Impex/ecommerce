// Shopping cart — lives entirely in this browser (localStorage), not the database. Browsing and
// adding items never needs a verified mobile number; only sending the cart to VITCO does (see
// cart-page.js), the same rule Buy Now already follows.
(function () {
  "use strict";

  var KEY = "vitco-cart";

  function read() {
    try {
      var raw = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch (e) { return []; }
  }
  function write(items) {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) {}
    window.dispatchEvent(new CustomEvent("vitco:cart-changed"));
  }

  function getItems() { return read(); }
  function count() { return read().reduce(function (n, i) { return n + i.qty; }, 0); }

  // product: { key, name, category } — name/category are the English values (matches how
  // order_requests already stores product_name, and how Buy Now builds its own request).
  function addItem(product, qty) {
    qty = qty || 1;
    var items = read();
    var existing = items.filter(function (i) { return i.key === product.key; })[0];
    if (existing) existing.qty = Math.min(999, existing.qty + qty);
    else items.push({ key: product.key, name: product.name, category: product.category || "", qty: Math.min(999, qty) });
    write(items);
  }

  function setQty(key, qty) {
    var items = read();
    var item = items.filter(function (i) { return i.key === key; })[0];
    if (!item) return;
    qty = Math.max(1, Math.min(999, qty));
    item.qty = qty;
    write(items);
  }

  function removeItem(key) {
    write(read().filter(function (i) { return i.key !== key; }));
  }

  function clear() { write([]); }

  window.VitcoCart = {
    getItems: getItems,
    count: count,
    addItem: addItem,
    setQty: setQty,
    removeItem: removeItem,
    clear: clear
  };

  // Cart badges — the desktop header icon and the mobile bottom-nav icon both carry one; only one
  // of the two is ever visible at a given viewport width, but both exist in the DOM at all times.
  function renderBadge() {
    var n = count();
    document.querySelectorAll(".cart-badge").forEach(function (badge) {
      badge.textContent = n > 99 ? "99+" : String(n);
      badge.hidden = n === 0;
    });
  }
  renderBadge();
  window.addEventListener("vitco:cart-changed", renderBadge);
  // Two tabs of the same site share localStorage but not events fired in each other's window.
  window.addEventListener("storage", function (e) { if (e.key === KEY) renderBadge(); });

  // ------------------------------------------------------------------ Add to Cart buttons
  // Rendered by catalog-render.js (home) and product-page.js (PDP + related), which stamp the
  // product's slug/name/category onto the nearest wrapper — same pattern Buy Now uses (js/account.js).
  // Adding to cart never needs a verified mobile number; only sending the cart does (js/cart-page.js).
  function lang() { return document.documentElement.lang === "hi" ? "hi" : "en"; }
  function t(key, fallback) {
    var dict = (window.I18N && window.I18N[lang()]) || {};
    return dict[key] != null ? dict[key] : fallback;
  }

  document.addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest("[data-i18n-title='common.addToCart']");
    if (!btn) return;
    var card = btn.closest("[data-product-key]");
    if (!card) return;
    addItem({
      key: card.dataset.productKey.slice(0, 60),
      name: (card.dataset.productName || card.dataset.productKey).slice(0, 160),
      category: (card.dataset.productCategory || "").slice(0, 160)
    }, 1);
    if (window.VitcoUi) window.VitcoUi.toast(t("cart.itemAdded", "Added to cart."), "success");
  });
})();
