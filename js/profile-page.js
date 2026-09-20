// profile.html — the visitor's details, delivery addresses and product requests, all stored in
// Supabase under Row Level Security (supabase/schema.sql). Text is built with data-i18n keys so the
// page's language switch translates it in place, including anything rendered after load.
(function () {
  "use strict";

  var auth = window.VitcoAuth;
  var gate = document.getElementById("acctGate");
  var app = document.getElementById("acctApp");
  if (!auth || !gate || !app) return;

  var MAX_ADDRESSES = 10;
  var STATES = ["Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh",
    "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh",
    "Jammu and Kashmir", "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra",
    "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
    "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"];
  var LABEL_KEYS = { Dairy: "addr.typeDairy", Office: "addr.typeOffice", Home: "addr.typeHome", Other: "addr.typeOther" };

  var client = null;
  var user = null;
  var profile = {};
  var addresses = [];
  var editingId = null;      // null = adding a new address
  var confirmingId = null;   // address whose inline "delete?" prompt is open
  var starting = false;
  var gateAutoOpened = false;

  function $(id) { return document.getElementById(id); }
  function lang() { return document.documentElement.lang === "hi" ? "hi" : "en"; }
  function t(key, fallback) {
    var dict = (window.I18N && window.I18N[lang()]) || {};
    return dict[key] != null ? dict[key] : (fallback != null ? fallback : key);
  }
  function toast(msg, kind) { if (window.VitcoUi) window.VitcoUi.toast(msg, kind); }

  // h("div", "class", { key: "i18n.key" | text: "plain", attrs: {...} }, [children])
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

  function setMessage(el, key, kind) {
    if (!key) { el.hidden = true; el.textContent = ""; el.removeAttribute("data-i18n"); return; }
    el.hidden = false;
    el.className = "acct-msg " + (kind === "ok" ? "is-ok" : "is-error");
    el.setAttribute("data-i18n", key);
    el.textContent = t(key);
  }

  function fieldError(input, key) {
    var err = input.closest(".acct-field").querySelector(".acct-field-error");
    if (!err) return;
    if (key) {
      input.setAttribute("aria-invalid", "true");
      err.setAttribute("data-i18n", key);
      err.textContent = t(key);
      err.hidden = false;
    } else {
      input.removeAttribute("aria-invalid");
      err.hidden = true;
      err.textContent = "";
      err.removeAttribute("data-i18n");
    }
  }

  // ------------------------------------------------------------------ gate / app switching
  function showGate(openModal, unavailable) {
    app.hidden = true;
    gate.hidden = false;
    if (unavailable) {
      $("acctGateBtn").hidden = true;
      var title = gate.querySelector("h1"), body = gate.querySelector("p");
      title.setAttribute("data-i18n", "acct.unavailableTitle"); title.textContent = t("acct.unavailableTitle");
      body.setAttribute("data-i18n", "acct.unavailableBody"); body.textContent = t("acct.unavailableBody");
      return;
    }
    if (openModal && !gateAutoOpened && window.VitcoOtpModal) {
      gateAutoOpened = true;
      window.VitcoOtpModal.open({ reason: "profile", onVerified: start });
    }
  }

  function start() {
    if (starting || !app.hidden) return;
    if (!auth.isConfigured()) { showGate(false, true); return; }
    if (!auth.isLoggedIn()) { showGate(true); return; }
    starting = true;
    auth.getClient().then(function (c) {
      client = c;
      return c.auth.getSession();
    }).then(function (res) {
      var session = res.data && res.data.session;
      if (!session) {
        // "Verified" hint without a live session: ask again.
        return auth.logout().then(function () { showGate(true); });
      }
      user = session.user;
      gate.hidden = true;
      app.hidden = false;
      $("acctMobile").textContent = "+91 " + (auth.getMobile() || "");
      $("dMobile").value = "+91 " + (auth.getMobile() || "");
      loadAll();
    }).catch(function () {
      showGate(false, true);
    }).then(function () { starting = false; });
  }

  // ------------------------------------------------------------------ identity + details
  function initials(name) {
    var parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "";
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  }

  function renderIdentity() {
    var name = (profile.full_name || "").trim();
    var nameEl = $("acctName");
    if (name) { nameEl.removeAttribute("data-i18n"); nameEl.textContent = name; }
    else { nameEl.setAttribute("data-i18n", "acct.defaultName"); nameEl.textContent = t("acct.defaultName"); }
    var avatar = $("acctAvatar");
    var ini = initials(name);
    if (ini) { avatar.textContent = ini; }
    else {
      avatar.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a8 8 0 0 1 16 0v1"/></svg>';
    }
  }

  function fillDetails() {
    $("dName").value = profile.full_name || "";
    $("dBusiness").value = profile.business_name || "";
    $("dEmail").value = profile.email || "";
    renderIdentity();
  }

  $("detailsForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var name = $("dName").value.trim(), business = $("dBusiness").value.trim(), email = $("dEmail").value.trim();
    var bad = false;
    fieldError($("dName"), null); fieldError($("dEmail"), null);
    if (name && name.length < 2) { fieldError($("dName"), "err.name"); bad = true; }
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { fieldError($("dEmail"), "err.email"); bad = true; }
    if (bad) { setMessage($("dMsg"), null); return; }

    var btn = $("dSave"), label = btn.querySelector("span");
    btn.disabled = true;
    label.setAttribute("data-i18n", "acct.saving"); label.textContent = t("acct.saving");
    setMessage($("dMsg"), null);
    var values = { full_name: name || null, business_name: business || null, email: email || null };
    client.from("profiles").update(values).eq("id", user.id).then(function (res) {
      if (res.error) { setMessage($("dMsg"), "acct.saveFailed", "error"); return; }
      profile = Object.assign(profile, values);
      renderIdentity();
      setMessage($("dMsg"), "acct.saved", "ok");
    }, function () { setMessage($("dMsg"), "acct.saveFailed", "error"); }).then(function () {
      btn.disabled = false;
      label.setAttribute("data-i18n", "acct.save"); label.textContent = t("acct.save");
    });
  });
  ["dName", "dBusiness", "dEmail"].forEach(function (id) {
    $(id).addEventListener("input", function () { fieldError($(id), null); setMessage($("dMsg"), null); });
  });

  // ------------------------------------------------------------------ data loading
  function loadFailed(container, retry) {
    container.textContent = "";
    var box = h("div", "acct-empty", {}, [
      h("p", "", { key: "acct.loadFailed" }),
      h("button", "btn btn-line btn-sm", { key: "acct.retry", attrs: { type: "button" } })
    ]);
    box.querySelector("button").addEventListener("click", retry);
    container.appendChild(box);
  }

  function skeletons(container, n) {
    container.textContent = "";
    for (var i = 0; i < n; i++) container.appendChild(h("div", "acct-skeleton", { attrs: { "aria-hidden": "true" } }));
    container.setAttribute("aria-busy", "true");
  }

  function loadProfile() {
    return client.from("profiles").select("full_name,business_name,email").maybeSingle().then(function (res) {
      if (res.error) throw res.error;
      profile = res.data || {};
      fillDetails();
    });
  }

  function loadAddresses() {
    skeletons($("addrList"), 2);
    return client.from("addresses").select("*").order("is_default", { ascending: false }).order("created_at", { ascending: true })
      .then(function (res) {
        if (res.error) throw res.error;
        addresses = res.data || [];
        renderAddresses();
      }).catch(function () { loadFailed($("addrList"), loadAddresses); });
  }

  function loadRequests() {
    var box = $("reqList");
    skeletons(box, 2);
    return client.from("order_requests").select("id,product_name,quantity,status,created_at").order("created_at", { ascending: false }).limit(20)
      .then(function (res) {
        if (res.error) throw res.error;
        renderRequests(res.data || []);
      }).catch(function () { loadFailed(box, loadRequests); });
  }

  function loadAll() {
    loadProfile().catch(function () { setMessage($("dMsg"), "acct.loadFailed", "error"); });
    loadAddresses();
    loadRequests();
  }

  // ------------------------------------------------------------------ requests
  function renderRequests(rows) {
    var box = $("reqList");
    box.textContent = "";
    box.removeAttribute("aria-busy");
    if (!rows.length) {
      box.appendChild(h("div", "acct-empty", {}, [
        h("p", "", { key: "req.empty" }),
        h("a", "btn btn-primary btn-sm", { key: "req.browse", attrs: { href: "index.html#analyzers" } })
      ]));
      return;
    }
    var ul = h("ul", "req-list");
    rows.forEach(function (row) {
      var status = h("span", "req-status is-" + row.status, { key: "req.status." + row.status });
      var date = h("time", "", { text: new Date(row.created_at).toLocaleDateString(lang() === "hi" ? "hi-IN" : "en-IN", { day: "numeric", month: "short", year: "numeric" }) });
      var nameEl = h("span", "req-name", { text: row.product_name });
      if (row.quantity > 1) nameEl.appendChild(h("span", "req-qty", { text: " · " + t("req.qty", "Qty: {n}").replace("{n}", row.quantity) }));
      var payLink = h("a", "req-pay-link", {
        key: "req.payBooking",
        attrs: { href: "payment.html?requestId=" + encodeURIComponent(row.id) + "&productName=" + encodeURIComponent(row.product_name) }
      });
      ul.appendChild(h("li", "", {}, [
        nameEl,
        h("span", "req-meta", {}, [status, date, payLink])
      ]));
    });
    box.appendChild(ul);
  }

  // ------------------------------------------------------------------ addresses: list
  function renderAddresses() {
    var box = $("addrList");
    box.textContent = "";
    box.removeAttribute("aria-busy");
    $("addrAdd").hidden = addresses.length >= MAX_ADDRESSES;

    if (!addresses.length) {
      if (!$("addrFormWrap").hidden) return; // the open form is the call to action
      var addFirst = h("button", "btn btn-primary btn-sm", { key: "addr.addFirst", attrs: { type: "button" } });
      addFirst.addEventListener("click", function () { openForm(null); });
      box.appendChild(h("div", "acct-empty", {}, [h("p", "", { key: "addr.empty" }), addFirst]));
      return;
    }
    var grid = h("div", "addr-grid");
    addresses.forEach(function (a) { grid.appendChild(addressCard(a)); });
    box.appendChild(grid);
    if (addresses.length >= MAX_ADDRESSES) box.appendChild(h("p", "acct-sub", { key: "addr.limit", attrs: { style: "margin:14px 0 0" } }));
  }

  function linkButton(key, cls, handler) {
    var b = h("button", "addr-link" + (cls ? " " + cls : ""), { key: key, attrs: { type: "button" } });
    b.addEventListener("click", handler);
    return b;
  }

  function addressCard(a) {
    var tagKey = LABEL_KEYS[a.label];
    var head = h("div", "addr-head", {}, [
      tagKey ? h("span", "addr-tag", { key: tagKey }) : h("span", "addr-tag", { text: a.label })
    ]);
    if (a.is_default) head.appendChild(h("span", "addr-default", { key: "addr.default" }));

    var lines = h("div", "addr-lines", {}, [h("strong", "", { text: a.contact_name })]);
    lines.appendChild(document.createTextNode(a.line1));
    if (a.line2) { lines.appendChild(document.createElement("br")); lines.appendChild(document.createTextNode(a.line2)); }
    lines.appendChild(document.createElement("br"));
    lines.appendChild(document.createTextNode(a.city + ", " + a.state));
    lines.appendChild(h("span", "addr-phone", { text: "+91 " + a.contact_mobile }));

    var body = h("div", "addr-body", {}, [
      lines,
      h("div", "addr-pin", {}, [h("small", "", { key: "addr.pincode" }), h("b", "", { text: a.pincode })])
    ]);

    var card = h("article", "addr-card" + (a.is_default ? " is-default" : ""), {}, [head, body]);

    if (confirmingId === a.id) {
      var yes = linkButton("addr.deleteYes", "is-danger", function () { removeAddress(a.id); });
      var no = linkButton("addr.deleteNo", "", function () { confirmingId = null; renderAddresses(); });
      card.appendChild(h("div", "addr-confirm", {}, [h("span", "", { key: "addr.deleteAsk" }), no, yes]));
      return card;
    }

    var foot = h("div", "addr-foot");
    foot.appendChild(linkButton("addr.edit", "", function () { openForm(a); }));
    if (!a.is_default) foot.appendChild(linkButton("addr.makeDefault", "", function () { makeDefault(a.id); }));
    foot.appendChild(linkButton("addr.delete", "is-danger", function () { confirmingId = a.id; renderAddresses(); }));
    card.appendChild(foot);
    return card;
  }

  function makeDefault(id) {
    client.from("addresses").update({ is_default: true }).eq("id", id).then(function (res) {
      if (res.error) { toast(t("addr.saveFailed"), "error"); return; }
      toast(t("addr.defaultSet"), "success");
      return loadAddresses();
    }, function () { toast(t("addr.saveFailed"), "error"); });
  }

  function removeAddress(id) {
    confirmingId = null;
    client.from("addresses").delete().eq("id", id).then(function (res) {
      if (res.error) { toast(t("addr.deleteFailed"), "error"); renderAddresses(); return; }
      if (editingId === id) closeForm();
      toast(t("addr.deleted"), "success");
      return loadAddresses();
    }, function () { toast(t("addr.deleteFailed"), "error"); renderAddresses(); });
  }

  // ------------------------------------------------------------------ addresses: form
  var form = $("addrForm");
  var stateSelect = $("aState");

  (function buildStates() {
    var first = document.createElement("option");
    first.value = "";
    first.setAttribute("data-i18n", "addr.statePick");
    first.textContent = t("addr.statePick");
    stateSelect.appendChild(first);
    STATES.forEach(function (s) {
      var o = document.createElement("option");
      o.value = s; o.textContent = s;
      stateSelect.appendChild(o);
    });
  })();

  function inputs() { return form.querySelectorAll(".acct-input"); }

  function openForm(address) {
    editingId = address ? address.id : null;
    confirmingId = null;
    $("addrFormWrap").hidden = false;
    renderAddresses();
    var title = $("addrFormTitle");
    var key = address ? "addr.editTitle" : "addr.addTitle";
    title.setAttribute("data-i18n", key); title.textContent = t(key);

    inputs().forEach(function (i) { fieldError(i, null); });
    setMessage($("aMsg"), null);

    var a = address || {};
    form.elements.label.value = a.label && LABEL_KEYS[a.label] ? a.label : (address ? "Other" : "Dairy");
    form.elements.contact_name.value = a.contact_name || profile.full_name || "";
    form.elements.contact_mobile.value = a.contact_mobile || auth.getMobile() || "";
    form.elements.line1.value = a.line1 || "";
    form.elements.line2.value = a.line2 || "";
    form.elements.city.value = a.city || "";
    form.elements.pincode.value = a.pincode || "";
    stateSelect.value = a.state || "";
    form.elements.is_default.checked = false;
    // The very first address is the default automatically, and the current default stays default.
    $("aDefaultRow").hidden = !addresses.length || !!(address && address.is_default);

    $("addrFormWrap").hidden = false;
    $("addrAdd").disabled = true;
    $("addrFormWrap").scrollIntoView({ behavior: "smooth", block: "nearest" });
    window.setTimeout(function () { form.elements.contact_name.focus({ preventScroll: true }); }, 60);
  }

  function closeForm() {
    editingId = null;
    $("addrFormWrap").hidden = true;
    $("addrAdd").disabled = false;
    renderAddresses();
  }

  $("addrAdd").addEventListener("click", function () { openForm(null); });
  $("aCancel").addEventListener("click", function () { closeForm(); $("addrAdd").focus(); });
  $("aPhone").addEventListener("input", function (e) { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 10); });
  $("aPin").addEventListener("input", function (e) { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6); });
  inputs().forEach(function (i) {
    i.addEventListener("input", function () { fieldError(i, null); setMessage($("aMsg"), null); });
    i.addEventListener("change", function () { fieldError(i, null); });
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var f = form.elements;
    var v = {
      label: f.label.value || "Other",
      contact_name: f.contact_name.value.trim(),
      contact_mobile: f.contact_mobile.value.replace(/\D/g, ""),
      line1: f.line1.value.trim(),
      line2: f.line2.value.trim() || null,
      city: f.city.value.trim(),
      state: f.state.value,
      pincode: f.pincode.value.trim()
    };
    var firstBad = null;
    function check(ok, input, key) {
      fieldError(input, ok ? null : key);
      if (!ok && !firstBad) firstBad = input;
    }
    check(v.contact_name.length >= 2, f.contact_name, "err.name");
    check(/^[6-9]\d{9}$/.test(v.contact_mobile), f.contact_mobile, "err.mobile");
    check(v.line1.length >= 3, f.line1, "err.line1");
    check(v.city.length >= 1, f.city, "err.city");
    check(/^[1-9]\d{5}$/.test(v.pincode), f.pincode, "err.pin");
    check(!!v.state, f.state, "err.state");
    if (firstBad) { firstBad.focus(); setMessage($("aMsg"), null); return; }

    if (f.is_default.checked && !$("aDefaultRow").hidden) v.is_default = true;

    var btn = $("aSave"), label = btn.querySelector("span");
    btn.disabled = true;
    label.setAttribute("data-i18n", "acct.saving"); label.textContent = t("acct.saving");
    setMessage($("aMsg"), null);

    var request = editingId
      ? client.from("addresses").update(v).eq("id", editingId)
      : client.from("addresses").insert(v);
    request.then(function (res) {
      if (res.error) {
        setMessage($("aMsg"), /limit/i.test(res.error.message || "") ? "addr.limit" : "addr.saveFailed", "error");
        return;
      }
      closeForm();
      toast(t("addr.saved"), "success");
      return loadAddresses();
    }, function () { setMessage($("aMsg"), "addr.saveFailed", "error"); }).then(function () {
      btn.disabled = false;
      label.setAttribute("data-i18n", "addr.save"); label.textContent = t("addr.save");
    });
  });

  // ------------------------------------------------------------------ session events
  $("acctLogout").addEventListener("click", function () {
    auth.logout().then(function () { window.location.href = "index.html"; });
  });
  $("acctGateBtn").addEventListener("click", function () {
    if (window.VitcoOtpModal) window.VitcoOtpModal.open({ reason: "profile", onVerified: start });
  });

  window.addEventListener("vitco:auth-changed", function () {
    if (auth.isLoggedIn()) start();
    else { user = null; showGate(false); }
  });

  start();
})();
