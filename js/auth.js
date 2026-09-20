// Login state for the public site, backed by Supabase Auth.
//
// "Logged in" = this visitor verified their mobile number by OTP (js/otp-modal.js) and Supabase
// then issued a real session for it (via the phone-login Edge Function). The mobile number lives in
// localStorage as a synchronous hint so pages can decide instantly whether to show the OTP modal;
// the Supabase session is the source of truth and the hint is corrected as soon as it disagrees.
//
// When Supabase isn't configured (js/supabase-config.js empty) this degrades to the hint alone.
(function () {
  "use strict";

  var MOBILE_KEY = "vitco-verified-mobile";
  // Client-side check only, purely to decide what the UI shows — the real gate is the database's
  // own is_admin() (supabase/schema.sql), which every write is checked against regardless of this.
  var ADMIN_MOBILE = "7500673358";
  var SDK_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0";
  var cfg = window.VITCO_SUPABASE || {};
  var clientPromise = null;

  function read(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function write(key, value) { try { localStorage.setItem(key, value); } catch (e) {} }
  function remove(key) { try { localStorage.removeItem(key); } catch (e) {} }
  function emit() { window.dispatchEvent(new CustomEvent("vitco:auth-changed")); }

  function isConfigured() { return !!(cfg.url && cfg.anonKey); }
  function getMobile() { return read(MOBILE_KEY); }
  function isLoggedIn() { return !!getMobile(); }
  function isAdmin() { return getMobile() === ADMIN_MOBILE; }

  // Keeps the localStorage hint in step with the Supabase session. The number comes from
  // app_metadata, which only the server can write — never from anything the visitor typed.
  function syncHint(session) {
    var mobile = session && session.user && session.user.app_metadata && session.user.app_metadata.mobile;
    if (mobile) {
      if (getMobile() !== mobile) { write(MOBILE_KEY, mobile); emit(); }
    } else if (getMobile()) {
      remove(MOBILE_KEY);
      emit();
    }
  }

  // The SDK is only downloaded when it's needed, so a visitor who never logs in never pays for it.
  function loadSdk() {
    return new Promise(function (resolve, reject) {
      if (window.supabase && window.supabase.createClient) { resolve(); return; }
      var s = document.createElement("script");
      s.src = SDK_URL;
      s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error("sdk-load-failed")); };
      document.head.appendChild(s);
    });
  }

  function getClient() {
    if (!isConfigured()) return Promise.reject(new Error("not-configured"));
    if (!clientPromise) {
      clientPromise = loadSdk().then(function () {
        var client = window.supabase.createClient(cfg.url, cfg.anonKey, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "vitco-sb-auth" }
        });
        // Synchronous work only inside this callback (Supabase deadlocks if it awaits other auth calls).
        client.auth.onAuthStateChange(function (event, session) { syncHint(session); });
        return client;
      }).catch(function (err) { clientPromise = null; throw err; });
    }
    return clientPromise;
  }

  // Exchanges the one-time token from the phone-login function for a real session.
  function startSession(tokenHash) {
    return getClient().then(function (client) {
      return client.auth.verifyOtp({ token_hash: tokenHash, type: "email" }).then(function (res) {
        // Older Supabase projects still expect the legacy type name for magic-link tokens.
        return res.error ? client.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" }) : res;
      });
    }).then(function (res) {
      if (res.error || !res.data || !res.data.session) throw new Error("session-failed");
      syncHint(res.data.session);
      return res.data.session;
    });
  }

  // For the not-configured fallback, where there's no session to derive the number from.
  function markVerified(mobile) {
    if (getMobile() !== mobile) { write(MOBILE_KEY, mobile); emit(); }
  }

  function logout() {
    remove(MOBILE_KEY);
    emit();
    if (!isConfigured()) return Promise.resolve();
    return getClient().then(function (client) { return client.auth.signOut(); }).catch(function () {});
  }

  // Runs onSuccess straight away when logged in; otherwise shows the mobile-number modal first and
  // runs it once the visitor has verified. reason picks the explanatory line shown in the modal.
  function requireLogin(reason, onSuccess) {
    if (isLoggedIn()) { onSuccess(); return; }
    if (window.VitcoOtpModal) window.VitcoOtpModal.open({ reason: reason, onVerified: onSuccess });
  }

  window.VitcoAuth = {
    isConfigured: isConfigured,
    isLoggedIn: isLoggedIn,
    isAdmin: isAdmin,
    getMobile: getMobile,
    getClient: getClient,
    startSession: startSession,
    markVerified: markVerified,
    logout: logout,
    requireLogin: requireLogin
  };

  // A visitor who verified before Supabase was wired up has the hint but no session: load the SDK
  // now so the first auth event corrects it, instead of letting them run into it mid-action.
  if (isConfigured() && isLoggedIn()) getClient().catch(function () {});
})();
