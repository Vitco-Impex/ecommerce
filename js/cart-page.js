// cart.html — renders the visitor's cart (js/cart.js, localStorage-only) and sends it to VITCO as a
// batch of order_requests rows once they've verified their mobile number. Browsing/editing the cart
// never needs a verified number; only "Send request" does (same rule Buy Now already follows).
(function () {
  "use strict";

  var auth = window.VitcoAuth;
  var cart = window.VitcoCart;
  var root = document.getElementById("cartRoot");
  if (!auth || !cart || !root) return;

  var sending = false;

  function lang() { return document.documentElement.lang === "hi" ? "hi" : "en"; }
  function t(key, fallback) {
    var dict = (window.I18N && window.I18N[lang()]) || {};
    return dict[key] != null ? dict[key] : (fallback != null ? fallback : key);
  }
  function toast(msg, kind) { if (window.VitcoUi) window.VitcoUi.toast(msg, kind); }

  function h(tag, cls, opts, children) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    opts = opts || {};
    if (opts.key) { node.setAttribute("data-i18n", opts.key); node.textContent = t(opts.key); }
    else if (opts.text != null) node.textContent = opts.text;
    if (opts.attrs) Object.keys(opts.attrs).forEach(function (k) { node.setAttribute(k, opts.attrs[k]); });
    (children || []).forEach(function (c) { node.appendChild(c); });
    return node;
  }

  var minusIconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>';
  var plusIconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
  var trashIconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';

  // ------------------------------------------------------------------ render
  function itemRow(item) {
    var info = h("div", "cart-item-info", {}, [
      h("div", "cart-item-name", { text: item.name }),
      item.category ? h("div", "cart-item-cat", { text: item.category }) : h("div", "cart-item-cat", { text: "" })
    ]);

    var dec = h("button", "cart-qty-btn", { attrs: { type: "button", "aria-label": "-" } });
    dec.innerHTML = minusIconSvg;
    dec.addEventListener("click", function () { cart.setQty(item.key, item.qty - 1); });

    var inc = h("button", "cart-qty-btn", { attrs: { type: "button", "aria-label": "+" } });
    inc.innerHTML = plusIconSvg;
    inc.addEventListener("click", function () { cart.setQty(item.key, item.qty + 1); });

    var qty = h("div", "cart-item-qty", {}, [dec, h("span", "cart-qty-val", { text: String(item.qty) }), inc]);

    var remove = h("button", "cart-item-remove", { attrs: { type: "button", "data-i18n-title": "cart.remove", title: t("cart.remove"), "aria-label": t("cart.remove") } });
    remove.innerHTML = trashIconSvg;
    remove.addEventListener("click", function () { cart.removeItem(item.key); });

    return h("div", "cart-item", {}, [info, qty, remove]);
  }

  function render() {
    var items = cart.getItems();
    root.textContent = "";

    if (!items.length) {
      var browse = h("a", "btn btn-primary btn-sm", { key: "cart.browse", attrs: { href: "index.html#top" } });
      root.appendChild(h("div", "acct-empty", {}, [
        h("p", "", { key: "cart.empty" }),
        h("p", "acct-sub", { key: "cart.emptyHint", attrs: { style: "margin:-8px 0 14px" } }),
        browse
      ]));
      return;
    }

    var list = h("div", "cart-list");
    items.forEach(function (item) { list.appendChild(itemRow(item)); });
    var listCard = h("div", "acct-card cart-list-card", {}, [list]);

    var count = items.reduce(function (n, i) { return n + i.qty; }, 0);
    var summaryHead = h("div", "acct-card-head", {}, [h("h2", "", { key: "cart.summaryTitle" })]);
    var summaryCount = h("p", "cart-summary-count", { text: count === 1 ? t("cart.itemsOne", "{n} item").replace("{n}", count) : t("cart.itemsOther", "{n} items").replace("{n}", count) });
    var sendBtn = h("button", "btn btn-primary cart-send-btn", { key: "cart.sendRequest", attrs: { type: "button" } });
    sendBtn.addEventListener("click", function () { sendRequest(items, sendBtn); });
    var summaryCard = h("div", "acct-card cart-summary", {}, [summaryHead, summaryCount, sendBtn]);

    root.appendChild(h("div", "cart-grid", {}, [listCard, summaryCard]));
  }

  // ------------------------------------------------------------------ send
  function ensureSession() {
    if (!auth.isConfigured()) return Promise.resolve(true);
    return auth.getClient().then(function (client) {
      return client.auth.getSession();
    }).then(function (res) {
      return !!(res.data && res.data.session);
    }, function () { return true; });
  }

  function withSession(action) {
    auth.requireLogin("cart", function () {
      ensureSession().then(function (ok) {
        if (ok) { action(); return; }
        auth.logout().then(function () { auth.requireLogin("cart", action); });
      });
    });
  }

  function sendViaWhatsApp(items) {
    var lines = items.map(function (i) { return "- " + i.name + " x " + i.qty; }).join("\n");
    window.open("https://wa.me/919917045963?text=" +
      encodeURIComponent("Hello VITCO, I'd like to request the following:\n" + lines + "\nPlease share price and availability."),
      "_blank", "noopener");
    cart.clear();
  }

  function saveLine(client, item) {
    return client.from("order_requests").insert({ product_key: item.key, product_name: item.name, quantity: item.qty })
      .then(function (res) {
        if (!res.error) return true;
        if (res.error.code === "23505") {
          return client.from("order_requests").update({ quantity: item.qty }).eq("product_key", item.key).eq("status", "new")
            .then(function (res2) { return !res2.error; });
        }
        return false;
      }, function () { return false; });
  }

  function sendRequest(items, btn) {
    if (sending) return;
    if (!auth.isConfigured()) { sendViaWhatsApp(items); render(); return; }

    withSession(function () {
      sending = true;
      btn.disabled = true;
      var sendingLabel = t("cart.sending", "Sending…");
      var originalLabel = btn.textContent;
      btn.textContent = sendingLabel;

      auth.getClient().then(function (client) {
        return Promise.all(items.map(function (item) {
          return saveLine(client, item).then(function (ok) { return { key: item.key, ok: ok }; });
        }));
      }).then(function (results) {
        results.forEach(function (r) { if (r.ok) cart.removeItem(r.key); });
        var allOk = results.every(function (r) { return r.ok; });
        toast(allOk ? t("cart.requestsSaved", "Your request has been sent. We'll contact you on your mobile number.") : t("cart.partialFailed", "Some items couldn't be sent. Please try again for those."), allOk ? "success" : "error");
      }, function () {
        toast(t("cart.requestFailed", "Couldn't send your request. Please try again."), "error");
      }).then(function () {
        sending = false;
        btn.disabled = false;
        btn.textContent = originalLabel;
        render();
      });
    });
  }

  window.addEventListener("vitco:cart-changed", render);
  window.addEventListener("vitco:lang-changed", render);
  render();
})();
