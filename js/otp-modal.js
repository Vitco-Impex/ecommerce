(function () {
  "use strict";

  var backdrop = document.getElementById("otpModalBackdrop");
  if (!backdrop) return;

  // ---------------------------------------------------------------------
  // Backend wiring
  // ---------------------------------------------------------------------
  // This modal never talks to the OTP provider directly — SMS sending is done through the
  // busiman API server (features/public-otp + features/messagecentral/services/messagecentral.service.ts).
  // The browser only ever calls these two public endpoints; the server holds the real credentials.
  var API_BASE = "https://api.busiman.org/api/v1/public/otp";

  // Every failure — a rejected request, a timeout, or the server refusing — becomes an OtpError
  // whose `message` is ALREADY the text to show the visitor, in their current language. The raw
  // server message is only used to decide WHICH i18n string applies (the server speaks English
  // only; the site is bilingual), and the browser's own error text ("Failed to fetch") is never
  // shown to anyone.
  var REQUEST_TIMEOUT_MS = 20000;

  function OtpError(message, waitSeconds) {
    this.message = message;
    this.waitSeconds = waitSeconds || 0;
  }

  function describeFailure(status, serverMessage, context) {
    var msg = String(serverMessage || "");
    if (status === 429) {
      var wait = /wait\s+(\d+)\s*s/i.exec(msg);
      if (wait) {
        var n = Number(wait[1]);
        return new OtpError(t("otp.waitSeconds", "Please wait {n}s before requesting another code.").replace("{n}", n), n);
      }
      if (/tomorrow/i.test(msg)) return new OtpError(t("otp.dailyLimit", "Too many codes requested for this number today. Please try again tomorrow."));
      return new OtpError(t("otp.tooMany", "Too many attempts. Please try again in a few minutes."));
    }
    if (status === 400) {
      if (/valid 10-digit/i.test(msg)) return new OtpError(t("otp.invalidPhone", "Enter a valid 10-digit mobile number"));
      if (/\d-digit/i.test(msg)) return new OtpError(t("otp.invalidCode", "Enter the 4-digit code"));
      if (/expired|No code/i.test(msg)) return new OtpError(t("otp.expired", "This code has expired or wasn't requested. Please request a new one."));
    }
    return context === "verify"
      ? new OtpError(t("otp.verifyFailed", "Couldn't verify the code. Please try again."))
      : new OtpError(t("otp.sendFailed", "Couldn't send the code. Please try again."));
  }

  function postJson(url, payload, context, extraHeaders) {
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timer = controller ? window.setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS) : null;
    var headers = { "Content-Type": "application/json" };
    if (extraHeaders) Object.keys(extraHeaders).forEach(function (k) { headers[k] = extraHeaders[k]; });

    return fetch(url, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(payload),
      signal: controller ? controller.signal : undefined
    }).then(function (res) {
      window.clearTimeout(timer);
      if (res.ok) return res.json();
      return res.json().catch(function () { return {}; }).then(function (body) {
        throw describeFailure(res.status, body && body.error, context);
      });
    }, function () {
      // fetch itself rejected: offline, DNS, CORS refusal, or our own abort on timeout.
      window.clearTimeout(timer);
      throw new OtpError(t("otp.noConnection", "No connection. Check your internet and try again."));
    });
  }

  function apiSendOtp(mobileNumber) {
    return postJson(API_BASE + "/send", { mobileNumber: mobileNumber }, "send");
  }

  function apiVerifyOtp(mobileNumber, code) {
    return postJson(API_BASE + "/verify", { mobileNumber: mobileNumber, code: code }, "verify");
  }

  // With Supabase configured, verification goes through the phone-login Edge Function. It checks
  // the code against the same /verify endpoint above and, when correct, returns a one-time token
  // that auth.js turns into a real Supabase session. Without Supabase, the original call is used.
  function apiVerifyAndSignIn(mobileNumber, code) {
    var auth = window.VitcoAuth;
    if (!auth || !auth.isConfigured()) {
      return apiVerifyOtp(mobileNumber, code).then(function (result) {
        if (result && result.success && auth) auth.markVerified(mobileNumber);
        return result;
      });
    }
    var cfg = window.VITCO_SUPABASE;
    return postJson(cfg.url + "/functions/v1/phone-login", { mobileNumber: mobileNumber, code: code }, "verify", {
      apikey: cfg.anonKey,
      Authorization: "Bearer " + cfg.anonKey
    }).then(function (result) {
      if (!(result && result.success && result.token_hash)) return { success: false };
      return auth.startSession(result.token_hash).then(function () {
        return { success: true };
      }, function () {
        throw new OtpError(t("otp.sessionFailed", "Your number is verified, but we couldn't sign you in. Please request a new code."));
      });
    });
  }

  // ---------------------------------------------------------------------
  // DOM references
  // ---------------------------------------------------------------------
  var closeBtn = document.getElementById("otpModalClose");
  var stepPhone = document.getElementById("otpStepPhone");
  var phoneForm = document.getElementById("otpPhoneForm");
  var phoneInput = document.getElementById("otpPhoneInput");
  var phoneError = document.getElementById("otpPhoneError");
  var sendBtn = document.getElementById("otpSendBtn");

  var stepCode = document.getElementById("otpStepCode");
  var codeForm = document.getElementById("otpCodeForm");
  var codeInput = document.getElementById("otpCodeInput");
  var codeError = document.getElementById("otpCodeError");
  var verifyBtn = document.getElementById("otpVerifyBtn");
  var sentToNumber = document.getElementById("otpSentToNumber");
  var changeNumberBtn = document.getElementById("otpChangeNumber");
  var resendBtn = document.getElementById("otpResendBtn");

  var reasonEl = document.getElementById("otpReason");

  var stepSuccess = document.getElementById("otpStepSuccess");
  var doneBtn = document.getElementById("otpDoneBtn");

  var currentPhone = "";
  var resendTimer = null;
  var autoCloseTimer = null;
  // explicitOpen: a button (Profile / Buy Now) opened the modal, not the 10s auto popup.
  var pendingOnVerified = null;
  var explicitOpen = false;

  function t(key, fallback) {
    var lang = document.documentElement.lang === "hi" ? "hi" : "en";
    var dict = (window.I18N && window.I18N[lang]) || {};
    return dict[key] != null ? dict[key] : fallback;
  }

  function showStep(step) {
    [stepPhone, stepCode, stepSuccess].forEach(function (s) { s.hidden = s !== step; });
  }

  function setError(el, msg) {
    if (!msg) { el.hidden = true; el.textContent = ""; return; }
    el.hidden = false;
    el.textContent = msg;
  }

  // Permanent (localStorage, not sessionStorage) — either one means "never
  // show this again on this browser", not just for the current tab/session.
  function shouldStayHidden() {
    try {
      return !!localStorage.getItem("vitco-verified-mobile") ||
        !!localStorage.getItem("vitco-otp-dismissed");
    } catch (e) { return false; }
  }

  function setReason(key, fallback) {
    if (!reasonEl) return;
    reasonEl.hidden = !key;
    if (key) {
      reasonEl.setAttribute("data-i18n", key);
      reasonEl.textContent = t(key, fallback);
    } else {
      reasonEl.removeAttribute("data-i18n");
      reasonEl.textContent = "";
    }
  }

  function showBackdrop() {
    backdrop.hidden = false;
    document.body.style.overflow = "hidden";
    window.setTimeout(function () { (stepCode.hidden ? phoneInput : codeInput).focus(); }, 50);
  }

  function openModal() {
    if (shouldStayHidden() || !backdrop.hidden) return;
    explicitOpen = false;
    pendingOnVerified = null;
    setReason(null);
    showBackdrop();
  }

  // Opened by a button: the visitor asked for something that needs a verified number, so this
  // ignores the "dismissed" flag. Already verified → just run the action.
  var REASONS = {
    profile: ["otp.reason.profile", "Verify your mobile number to view and manage your profile."],
    buy: ["otp.reason.buy", "Verify your mobile number so we can take your request and reach you."],
    cart: ["otp.reason.cart", "Verify your mobile number so we can take your cart request and reach you."],
    payment: ["otp.reason.payment", "Verify your mobile number before making a payment."]
  };
  function openForAction(opts) {
    opts = opts || {};
    if (window.VitcoAuth && window.VitcoAuth.isLoggedIn()) {
      if (opts.onVerified) opts.onVerified();
      return;
    }
    explicitOpen = true;
    pendingOnVerified = opts.onVerified || null;
    var r = REASONS[opts.reason];
    setReason(r ? r[0] : null, r ? r[1] : "");
    if (!stepSuccess.hidden) showStep(stepPhone);
    showBackdrop();
  }

  function closeModal() {
    backdrop.hidden = true;
    document.body.style.overflow = "";
    window.clearInterval(resendTimer);
    window.clearTimeout(autoCloseTimer);
  }

  // Closing via the X is a permanent "don't ask again" — not just for this
  // page or this session.
  function dismissForGood() {
    try { localStorage.setItem("vitco-otp-dismissed", "1"); } catch (e) {}
    closeModal();
  }

  // Matches the server's own resend cooldown (RESEND_COOLDOWN_MS in otp.service.ts) — the server
  // enforces it regardless; this just keeps the button honest so visitors aren't invited to click
  // something that would be refused. When the server reports a different remaining wait, that
  // number wins (see resendBtn handler).
  function startResendCountdown(fromSeconds) {
    var seconds = fromSeconds > 0 ? fromSeconds : 30;
    resendBtn.disabled = true;
    function tick() {
      resendBtn.textContent = t("otp.resendIn", "Resend OTP in") + " " + seconds + "s";
      if (seconds <= 0) {
        window.clearInterval(resendTimer);
        resendBtn.disabled = false;
        resendBtn.textContent = t("otp.resend", "Resend OTP");
        return;
      }
      seconds -= 1;
    }
    window.clearInterval(resendTimer);
    tick();
    resendTimer = window.setInterval(tick, 1000);
  }

  function goToCodeStep(phone) {
    currentPhone = phone;
    sentToNumber.textContent = "+91 " + phone;
    codeInput.value = "";
    setError(codeError, null);
    showStep(stepCode);
    window.setTimeout(function () { codeInput.focus(); }, 50);
    startResendCountdown();
  }

  // ---------------------------------------------------------------------
  // Step 1: phone number
  // ---------------------------------------------------------------------
  phoneForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var digits = phoneInput.value.replace(/\D/g, "");
    if (!/^[6-9]\d{9}$/.test(digits)) {
      setError(phoneError, t("otp.invalidPhone", "Enter a valid 10-digit mobile number"));
      phoneInput.focus();
      return;
    }
    setError(phoneError, null);
    sendBtn.disabled = true;
    sendBtn.querySelector("span").textContent = t("otp.sending", "Sending…");
    apiSendOtp(digits).then(function () {
      sendBtn.disabled = false;
      sendBtn.querySelector("span").textContent = t("otp.sendOtp", "Send OTP");
      goToCodeStep(digits);
    }).catch(function (err) {
      sendBtn.disabled = false;
      sendBtn.querySelector("span").textContent = t("otp.sendOtp", "Send OTP");
      setError(phoneError, errorText(err, "otp.sendFailed", "Couldn't send the code. Please try again."));
    });
  });

  // OtpError carries ready-to-show text; anything else (a bug on our side) gets the generic line
  // rather than leaking a raw JS error message to a visitor.
  function errorText(err, fallbackKey, fallbackText) {
    return err && err.message && err instanceof OtpError ? err.message : t(fallbackKey, fallbackText);
  }

  phoneInput.addEventListener("input", function () {
    phoneInput.value = phoneInput.value.replace(/\D/g, "").slice(0, 10);
  });

  // ---------------------------------------------------------------------
  // Step 2: verify code
  // ---------------------------------------------------------------------
  codeForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var code = codeInput.value.trim();
    if (!/^\d{4}$/.test(code)) {
      setError(codeError, t("otp.invalidCode", "Enter the 4-digit code"));
      return;
    }
    setError(codeError, null);
    verifyBtn.disabled = true;
    verifyBtn.querySelector("span").textContent = t("otp.verifying", "Verifying…");

    apiVerifyAndSignIn(currentPhone, code).then(function (result) {
      verifyBtn.disabled = false;
      verifyBtn.querySelector("span").textContent = t("otp.verify", "Verify");
      if (result && result.success) {
        var done = pendingOnVerified;
        pendingOnVerified = null;
        if (explicitOpen && done) {
          closeModal();
          done();
        } else {
          showStep(stepSuccess);
          autoCloseTimer = window.setTimeout(closeModal, 3000);
        }
      } else {
        setError(codeError, t("otp.wrongCode", "That code didn't match. Please try again."));
        codeInput.select();
      }
    }).catch(function (err) {
      verifyBtn.disabled = false;
      verifyBtn.querySelector("span").textContent = t("otp.verify", "Verify");
      setError(codeError, errorText(err, "otp.verifyFailed", "Couldn't verify the code. Please try again."));
    });
  });

  codeInput.addEventListener("input", function () {
    codeInput.value = codeInput.value.replace(/\D/g, "").slice(0, 4);
    // Submit as soon as the fourth digit lands — no extra tap needed. Guarded so a paste that
    // fires input twice, or a slow verify already in flight, can't double-submit.
    if (codeInput.value.length === 4 && !verifyBtn.disabled) {
      if (typeof codeForm.requestSubmit === "function") codeForm.requestSubmit();
      else verifyBtn.click();
    }
  });

  changeNumberBtn.addEventListener("click", function () {
    window.clearInterval(resendTimer);
    showStep(stepPhone);
    window.setTimeout(function () { phoneInput.focus(); }, 50);
  });

  resendBtn.addEventListener("click", function () {
    if (resendBtn.disabled) return;
    setError(codeError, null);
    resendBtn.disabled = true; // no double-clicks while the request is in flight
    apiSendOtp(currentPhone).then(function () {
      codeInput.value = "";
      codeInput.focus();
      startResendCountdown();
    }).catch(function (err) {
      setError(codeError, errorText(err, "otp.sendFailed", "Couldn't send the code. Please try again."));
      // A cooldown/limit refusal restarts the visible wait from what the server said; any other
      // failure (offline, WhatsApp service hiccup) just hands the button back so they can retry.
      if (err && err.waitSeconds) startResendCountdown(err.waitSeconds);
      else {
        resendBtn.disabled = false;
        resendBtn.textContent = t("otp.resend", "Resend OTP");
      }
    });
  });

  // ---------------------------------------------------------------------
  // Close / done
  // ---------------------------------------------------------------------
  doneBtn.addEventListener("click", closeModal);
  closeBtn.addEventListener("click", function () {
    // Backing out of a button-triggered prompt just closes it; only the auto popup's X means
    // "don't ask me again".
    if (explicitOpen) { pendingOnVerified = null; closeModal(); } else dismissForGood();
  });

  window.VitcoOtpModal = { open: openForAction };

  // ---------------------------------------------------------------------
  // Show 10 seconds after the visitor's FIRST page in this browsing
  // session — not 10 seconds after every individual page load. A shared
  // timestamp in sessionStorage tracks when they arrived; every page
  // (index.html, product.html, ...) reads the same timestamp and fires
  // the modal when the total elapsed time crosses 10s, so navigating
  // between pages can only bring it up sooner, never reset the clock.
  // ---------------------------------------------------------------------
  var SHOW_AFTER_MS = 10000;
  function scheduleModal() {
    if (shouldStayHidden()) return;
    var firstVisitAt;
    try {
      firstVisitAt = Number(sessionStorage.getItem("vitco-otp-session-start"));
      if (!firstVisitAt) {
        firstVisitAt = Date.now();
        sessionStorage.setItem("vitco-otp-session-start", String(firstVisitAt));
      }
    } catch (e) {
      firstVisitAt = Date.now();
    }
    var remaining = Math.max(0, SHOW_AFTER_MS - (Date.now() - firstVisitAt));
    window.setTimeout(openModal, remaining);
  }
  scheduleModal();
})();
