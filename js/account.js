// Buy Now + the Profile button. Both need a verified mobile number: if the visitor hasn't verified
// yet, the OTP modal (js/otp-modal.js) is shown and the visitor then stays on the page they were on.
// Buy Now continues on its own once they've verified; Profile just opens profile.html next time.
// Data goes to Supabase under Row Level Security (supabase/schema.sql).
(function () {
  "use strict";

  var auth = window.VitcoAuth;
  if (!auth) return;

  function lang() { return document.documentElement.lang === "hi" ? "hi" : "en"; }
  function t(key, fallback) {
    var dict = (window.I18N && window.I18N[lang()]) || {};
    return dict[key] != null ? dict[key] : fallback;
  }
  // ------------------------------------------------------------------ toast
  var toastEl = null, toastTimer = null;
  function toast(message, kind) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "vitco-toast";
      toastEl.setAttribute("role", "status");
      toastEl.setAttribute("aria-live", "polite");
      toastEl.hidden = true;
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = message;
    toastEl.setAttribute("data-kind", kind || "info");
    toastEl.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { toastEl.hidden = true; }, 4500);
  }
  window.VitcoUi = { toast: toast };

  // ------------------------------------------------------------------ Buy Now
  // A visitor can hold the "verified" hint without a live Supabase session (cleared browser data,
  // expired login). That counts as logged out, so they're asked to verify again.
  function ensureSession() {
    if (!auth.isConfigured()) return Promise.resolve(true);
    return auth.getClient().then(function (client) {
      return client.auth.getSession();
    }).then(function (res) {
      return !!(res.data && res.data.session);
    }, function () { return true; });
  }

  function withSession(reason, action) {
    auth.requireLogin(reason, function () {
      ensureSession().then(function (ok) {
        if (ok) { action(); return; }
        auth.logout().then(function () { auth.requireLogin(reason, action); });
      });
    });
  }

  // Rendered by catalog-render.js (home) or product-page.js (the PDP hero), both of which stamp the
  // product's slug and its English name onto the nearest wrapper — no DOM text-scraping needed.
  function productFromButton(btn) {
    var card = btn.closest("[data-product-key]");
    if (!card) return null;
    return { key: card.dataset.productKey.slice(0, 60), name: (card.dataset.productName || card.dataset.productKey).slice(0, 160) };
  }

  function requestPurchase(product, btn) {
    if (!auth.isConfigured()) {
      window.open("https://wa.me/919917045963?text=" +
        encodeURIComponent("Hello VITCO, I'd like to buy the " + product.name + ". Please share price and availability."),
        "_blank", "noopener");
      return;
    }
    btn.disabled = true;
    auth.getClient().then(function (client) {
      return client.from("order_requests").insert({ product_key: product.key, product_name: product.name });
    }).then(function (res) {
      if (!res.error) {
        toast(t("toast.buySaved", "Request received for {name}. We'll contact you on your mobile number.").replace("{name}", product.name), "success");
      } else if (res.error.code === "23505") {
        toast(t("toast.buyAlready", "You've already asked about this one. We'll be in touch soon."), "info");
      } else {
        toast(t("toast.buyFailed", "Couldn't save your request. Please try again."), "error");
      }
    }, function () {
      toast(t("toast.buyFailed", "Couldn't save your request. Please try again."), "error");
    }).then(function () { btn.disabled = false; });
  }

  // ------------------------------------------------------------------ wiring
  document.addEventListener("click", function (e) {
    var target = e.target.closest && e.target.closest(".js-profile-link, [data-i18n='common.buyNow']");
    if (!target) return;

    if (target.classList.contains("js-profile-link")) {
      // Logged in: the link goes to profile.html as normal (that page re-checks the session itself).
      if (auth.isLoggedIn()) return;
      e.preventDefault();
      auth.requireLogin("profile", function () {
        toast(t("toast.verified", "Verified."), "success");
      });
      return;
    }

    var product = productFromButton(target);
    if (product) withSession("buy", function () { requestPurchase(product, target); });
  });
})();
