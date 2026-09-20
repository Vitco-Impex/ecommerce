// payment-result.html — shows the outcome of a Paytm payment.
//
// The URL's ?status= comes from paytm-callback's redirect and is fine for display, but it's not
// re-verified here for anything sensitive — if the visitor is logged in, we re-fetch the actual
// payments row (RLS-scoped to their own user_id) by order_id and trust that over the URL instead.
(function () {
  "use strict";

  var auth = window.VitcoAuth;
  if (!auth) return;

  function lang() { return document.documentElement.lang === "hi" ? "hi" : "en"; }
  function t(key, fallback) {
    var dict = (window.I18N && window.I18N[lang()]) || {};
    return dict[key] != null ? dict[key] : fallback;
  }

  var iconEl = document.getElementById("payResultIcon");
  var titleEl = document.getElementById("payResultTitle");
  var bodyEl = document.getElementById("payResultBody");
  var orderWrap = document.getElementById("payResultOrder");
  var orderIdEl = document.getElementById("payResultOrderId");
  var tryAgainEl = document.getElementById("payResultTryAgain");
  if (!iconEl) return;

  var params = new URLSearchParams(window.location.search);
  var orderId = params.get("orderId") || "";
  var urlStatus = params.get("status") || "pending";

  var COPY = {
    success: ["payresult.successTitle", "Payment received", "payresult.successBody", "Thanks — your booking is confirmed. Our team will call you to finalise the details."],
    pending: ["payresult.pendingTitle", "Checking your payment…", "payresult.pendingBody", "This may take a moment. Please don't close this page."],
    failed: ["payresult.failedTitle", "Payment didn't go through", "payresult.failedBody", "No amount was charged. You can try again, or contact us for help."]
  };

  function render(status) {
    var copy = COPY[status] || COPY.pending;
    iconEl.setAttribute("data-state", status);
    titleEl.setAttribute("data-i18n", copy[0]);
    titleEl.textContent = t(copy[0], copy[1]);
    bodyEl.setAttribute("data-i18n", copy[2]);
    bodyEl.textContent = t(copy[2], copy[3]);
    if (orderId && orderWrap && orderIdEl) {
      orderIdEl.textContent = orderId;
      orderWrap.hidden = false;
    }
    if (tryAgainEl) tryAgainEl.hidden = status !== "failed";
  }

  render(urlStatus);

  // Best-effort re-check against the real row. If this fails (not logged in, not configured,
  // network hiccup) the URL status already rendered above is left standing.
  if (orderId && auth.isConfigured() && auth.isLoggedIn()) {
    auth.getClient().then(function (client) {
      return client.from("payments").select("status").eq("order_id", orderId).maybeSingle();
    }).then(function (res) {
      if (res && res.data && res.data.status && res.data.status !== "created") {
        render(res.data.status);
      }
    }).catch(function () {});
  }
})();
