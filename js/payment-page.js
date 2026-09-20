// payment.html — pay a booking/advance amount via Paytm to confirm an order.
//
// Flow: verify mobile number (if not already) -> enter an amount -> call the paytm-initiate Edge
// Function with the visitor's own session token -> it returns a Paytm txnToken -> we auto-submit a
// hidden form to Paytm's hosted payment page. Paytm redirects back to payment-result.html once done.
(function () {
  "use strict";

  var auth = window.VitcoAuth;
  if (!auth) return;
  var cfg = window.VITCO_SUPABASE || {};

  function lang() { return document.documentElement.lang === "hi" ? "hi" : "en"; }
  function t(key, fallback) {
    var dict = (window.I18N && window.I18N[lang()]) || {};
    return dict[key] != null ? dict[key] : fallback;
  }
  function toast(message, kind) { if (window.VitcoUi) window.VitcoUi.toast(message, kind); }

  var acctGate = document.getElementById("acctGate");
  var unavailableGate = document.getElementById("unavailableGate");
  var payApp = document.getElementById("payApp");
  var acctGateBtn = document.getElementById("acctGateBtn");
  var payForRequest = document.getElementById("payForRequest");
  var payForRequestName = document.getElementById("payForRequestName");
  var payForm = document.getElementById("payForm");
  var payAmount = document.getElementById("payAmount");
  var payAmountErr = document.getElementById("payAmountErr");
  var payMsg = document.getElementById("payMsg");
  var paySubmit = document.getElementById("paySubmit");
  var paySandboxNote = document.getElementById("paySandboxNote");
  var redirectForm = document.getElementById("paytmRedirectForm");
  if (!payApp || !payForm) return;

  var params = new URLSearchParams(window.location.search);
  var requestId = params.get("requestId") || null;
  var productName = params.get("productName") || "";

  function showMsg(text, kind) {
    if (!payMsg) return;
    if (!text) { payMsg.hidden = true; payMsg.textContent = ""; return; }
    payMsg.hidden = false;
    payMsg.textContent = text;
    payMsg.className = "acct-msg " + (kind === "ok" ? "is-ok" : "is-error");
  }

  function ensureSession() {
    return auth.getClient().then(function (client) {
      return client.auth.getSession();
    }).then(function (res) {
      return (res.data && res.data.session) || null;
    }, function () { return null; });
  }

  function showApp() {
    if (acctGate) acctGate.hidden = true;
    payApp.hidden = false;
    if (requestId && productName && payForRequest && payForRequestName) {
      payForRequestName.textContent = productName;
      payForRequest.hidden = false;
    }
    // This deployment is wired to Paytm's staging environment (PAYTM_ENV=staging on the server) —
    // hide this note once the project secrets are switched to production.
    if (paySandboxNote) paySandboxNote.hidden = false;
  }

  function init() {
    if (!auth.isConfigured()) {
      if (unavailableGate) unavailableGate.hidden = false;
      return;
    }
    ensureSession().then(function (session) {
      if (session) { showApp(); return; }
      if (acctGate) acctGate.hidden = false;
    });
  }

  if (acctGateBtn) {
    acctGateBtn.addEventListener("click", function () {
      auth.requireLogin("payment", function () { showApp(); });
    });
  }

  function submitToPaytm(data) {
    redirectForm.action = data.action;
    redirectForm.innerHTML = "";
    ["mid", "orderId", "txnToken"].forEach(function (key) {
      var input = document.createElement("input");
      input.type = "hidden";
      input.name = key;
      input.value = data[key];
      redirectForm.appendChild(input);
    });
    redirectForm.submit();
  }

  payForm.addEventListener("submit", function (e) {
    e.preventDefault();
    if (payAmountErr) payAmountErr.hidden = true;
    showMsg("", null);

    var amount = Number(payAmount.value);
    if (!Number.isFinite(amount) || amount < 1 || amount > 1000000) {
      if (payAmountErr) {
        payAmountErr.hidden = false;
        payAmountErr.textContent = t("pay.err.amount", "Enter an amount between ₹1 and ₹10,00,000.");
      }
      return;
    }

    paySubmit.disabled = true;
    ensureSession().then(function (session) {
      if (!session) {
        auth.logout();
        showMsg(t("otp.sessionFailed", "Your number is verified, but we couldn't sign you in. Please request a new code."), "error");
        if (acctGate) acctGate.hidden = false;
        payApp.hidden = true;
        paySubmit.disabled = false;
        return null;
      }
      return fetch(cfg.url + "/functions/v1/paytm-initiate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: cfg.anonKey,
          Authorization: "Bearer " + session.access_token
        },
        body: JSON.stringify({ amountRupees: amount, orderRequestId: requestId })
      }).then(function (res) {
        return res.json().then(function (body) { return { ok: res.ok, body: body }; });
      }).then(function (result) {
        if (!result.ok || !result.body || !result.body.txnToken) {
          showMsg((result.body && result.body.error) || t("pay.err.start", "Couldn't start the payment. Please try again."), "error");
          paySubmit.disabled = false;
          return;
        }
        showMsg(t("pay.redirecting", "Taking you to Paytm…"), "ok");
        submitToPaytm(result.body);
      });
    }).catch(function () {
      showMsg(t("pay.err.start", "Couldn't start the payment. Please try again."), "error");
      paySubmit.disabled = false;
    });
  });

  init();
})();
