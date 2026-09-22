// cart.html — renders the visitor's cart (js/cart.js, localStorage-only), lets them pick or add a
// delivery address (supabase/schema.sql `addresses`, same table profile.html manages), then sends
// the cart to VITCO as a batch of order_requests rows (each carrying that address_id) and takes them
// straight to payment.html to pay a booking amount. Browsing/editing the cart never needs a verified
// number; only "Proceed to Pay" does (same rule Buy Now already follows).
(function () {
  "use strict";

  var auth = window.VitcoAuth;
  var cart = window.VitcoCart;
  var root = document.getElementById("cartRoot");
  if (!auth || !cart || !root) return;

  var STATES = ["Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh",
    "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh",
    "Jammu and Kashmir", "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra",
    "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
    "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"];
  var LABEL_KEYS = { Dairy: "addr.typeDairy", Office: "addr.typeOffice", Home: "addr.typeHome", Other: "addr.typeOther" };

  var sending = false;
  var client = null;
  var addresses = [];
  var addressesLoaded = false;
  var selectedAddressId = null;
  var editingId = null;

  function $(id) { return document.getElementById(id); }
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
  var packageIconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg>';

  // ==================================================================== address section
  var addrCard = $("cartAddrCard");
  var addrFormWrap = $("addrFormWrap");
  var addrList = $("addrList");
  var addrForm = $("addrForm");
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

  function inputs() { return addrForm.querySelectorAll(".acct-input"); }

  // Only ever clears the warning once an address is picked — it's never shown proactively, only
  // by proceedToPay() when someone actually tries to continue with none selected.
  function updateHint() {
    var hint = $("cartAddrHint");
    if (hint && selectedAddressId) hint.hidden = true;
  }

  function openAddrForm(address) {
    editingId = address ? address.id : null;
    addrFormWrap.hidden = false;
    renderAddrList();
    var title = $("addrFormTitle");
    var key = address ? "addr.editTitle" : "addr.addTitle";
    title.setAttribute("data-i18n", key); title.textContent = t(key);

    inputs().forEach(function (i) { fieldError(i, null); });
    setMessage($("aMsg"), null);

    var a = address || {};
    addrForm.elements.label.value = a.label && LABEL_KEYS[a.label] ? a.label : (address ? "Other" : "Dairy");
    addrForm.elements.contact_name.value = a.contact_name || "";
    addrForm.elements.contact_mobile.value = a.contact_mobile || auth.getMobile() || "";
    addrForm.elements.line1.value = a.line1 || "";
    addrForm.elements.line2.value = a.line2 || "";
    addrForm.elements.city.value = a.city || "";
    addrForm.elements.pincode.value = a.pincode || "";
    stateSelect.value = a.state || "";
    addrForm.elements.is_default.checked = false;
    $("aDefaultRow").hidden = !addresses.length || !!(address && address.is_default);

    $("addrAdd").disabled = true;
    addrFormWrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
    window.setTimeout(function () { addrForm.elements.contact_name.focus({ preventScroll: true }); }, 60);
  }

  function closeAddrForm() {
    editingId = null;
    addrFormWrap.hidden = true;
    $("addrAdd").disabled = false;
    renderAddrList();
  }

  function addressPickCard(a) {
    var tagKey = LABEL_KEYS[a.label];
    var radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "cartAddrPick";
    radio.value = a.id;
    radio.checked = a.id === selectedAddressId;
    radio.addEventListener("change", function () { selectedAddressId = a.id; updateHint(); });

    var head = h("div", "addr-pick-head", {}, [
      tagKey ? h("strong", "", { key: tagKey }) : h("strong", "", { text: a.label })
    ]);
    if (a.is_default) head.appendChild(h("span", "addr-default", { key: "addr.default" }));
    var editLink = h("a", "addr-pick-edit", { key: "addr.edit", attrs: { href: "#" } });
    editLink.addEventListener("click", function (e) { e.preventDefault(); openAddrForm(a); });
    head.appendChild(editLink);

    var body = h("div", "addr-pick-body", {}, [h("strong", "", { text: a.contact_name })]);
    body.appendChild(document.createTextNode(
      a.line1 + (a.line2 ? ", " + a.line2 : "") + ", " + a.city + ", " + a.state + " - " + a.pincode
    ));

    var card = h("span", "addr-pick-card", {}, [head, body]);
    return h("label", "addr-pick", {}, [radio, card]);
  }

  function renderAddrList() {
    addrList.textContent = "";
    if (!addressesLoaded) {
      addrList.appendChild(h("p", "acct-sub", { key: "acct.gateBody" }));
      return;
    }
    if (!addresses.length) {
      if (!addrFormWrap.hidden) return; // the open form is the call to action
      var addFirst = h("button", "btn btn-primary btn-sm", { key: "addr.addFirst", attrs: { type: "button" } });
      addFirst.addEventListener("click", function () { openAddrForm(null); });
      addrList.appendChild(h("div", "acct-empty", {}, [h("p", "", { key: "addr.empty" }), addFirst]));
      return;
    }
    var grid = h("div", "addr-pick-list");
    addresses.forEach(function (a) { grid.appendChild(addressPickCard(a)); });
    addrList.appendChild(grid);
  }

  function loadAddresses() {
    if (!auth.isConfigured() || !auth.isLoggedIn()) {
      addresses = [];
      addressesLoaded = false;
      renderAddrList();
      return Promise.resolve();
    }
    return auth.getClient().then(function (c) {
      client = c;
      return client.from("addresses").select("*").order("is_default", { ascending: false }).order("created_at", { ascending: true });
    }).then(function (res) {
      if (res.error) throw res.error;
      addresses = res.data || [];
      addressesLoaded = true;
      if (!selectedAddressId || !addresses.some(function (a) { return a.id === selectedAddressId; })) {
        var def = addresses.filter(function (a) { return a.is_default; })[0];
        selectedAddressId = def ? def.id : (addresses[0] ? addresses[0].id : null);
      }
      renderAddrList();
      updateHint();
    }, function () {
      addressesLoaded = false;
      renderAddrList();
    });
  }

  $("addrAdd").addEventListener("click", function () {
    if (!auth.isConfigured()) return;
    if (!auth.isLoggedIn()) {
      auth.requireLogin("cart", function () { loadAddresses().then(function () { openAddrForm(null); }); });
      return;
    }
    openAddrForm(null);
  });
  $("aCancel").addEventListener("click", function () { closeAddrForm(); $("addrAdd").focus(); });
  $("aPhone").addEventListener("input", function (e) { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 10); });
  $("aPin").addEventListener("input", function (e) { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6); });
  inputs().forEach(function (i) {
    i.addEventListener("input", function () { fieldError(i, null); setMessage($("aMsg"), null); });
    i.addEventListener("change", function () { fieldError(i, null); });
  });

  addrForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var f = addrForm.elements;
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
      ? client.from("addresses").update(v).eq("id", editingId).select().single()
      : client.from("addresses").insert(v).select().single();
    request.then(function (res) {
      if (res.error) {
        setMessage($("aMsg"), /limit/i.test(res.error.message || "") ? "addr.limit" : "addr.saveFailed", "error");
        return;
      }
      var newId = res.data ? res.data.id : editingId;
      closeAddrForm();
      toast(t("addr.saved"), "success");
      return loadAddresses().then(function () {
        if (newId) selectedAddressId = newId;
        renderAddrList();
        updateHint();
      });
    }, function () { setMessage($("aMsg"), "addr.saveFailed", "error"); }).then(function () {
      btn.disabled = false;
      label.setAttribute("data-i18n", "addr.save"); label.textContent = t("addr.save");
    });
  });

  // ==================================================================== cart items
  function itemRow(item) {
    var href = "product.html?id=" + encodeURIComponent(item.key);

    var thumb = document.createElement("a");
    thumb.className = "cart-item-thumb";
    thumb.href = href;
    thumb.tabIndex = -1;
    thumb.setAttribute("aria-hidden", "true");
    if (item.image) {
      var img = document.createElement("img");
      img.src = item.image;
      img.alt = "";
      img.loading = "lazy";
      thumb.appendChild(img);
    } else {
      thumb.innerHTML = packageIconSvg;
    }

    var nameLink = h("a", "cart-item-name", { text: item.name, attrs: { href: href } });
    var info = h("div", "cart-item-info", {}, [
      nameLink,
      item.category ? h("div", "cart-item-cat", { text: item.category }) : h("div", "cart-item-cat", { text: "" })
    ]);
    var main = h("div", "cart-item-main", {}, [thumb, info]);

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

    var actions = h("div", "cart-item-actions", {}, [qty, remove]);
    return h("div", "cart-item", {}, [main, actions]);
  }

  function render() {
    var items = cart.getItems();
    root.textContent = "";

    addrCard.hidden = !items.length;
    if (items.length && !addressesLoaded) loadAddresses();

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
    var sendBtn = h("button", "btn btn-primary cart-send-btn", { key: "cart.proceedToPay", attrs: { type: "button" } });
    sendBtn.addEventListener("click", function () { proceedToPay(items, sendBtn); });
    var hint = h("p", "cart-summary-hint", { key: "cart.chooseAddress", attrs: { id: "cartAddrHint" } });
    hint.hidden = true;
    var summaryCard = h("div", "acct-card cart-summary", {}, [summaryHead, summaryCount, sendBtn, hint]);

    root.appendChild(h("div", "cart-grid", {}, [listCard, summaryCard]));
    updateHint();
  }

  // ==================================================================== proceed to pay
  function ensureSession() {
    if (!auth.isConfigured()) return Promise.resolve(true);
    return auth.getClient().then(function (c) {
      return c.auth.getSession();
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

  function saveLine(c, item) {
    return c.from("order_requests").insert({ product_key: item.key, product_name: item.name, quantity: item.qty, address_id: selectedAddressId })
      .select().single()
      .then(function (res) {
        if (!res.error) return { ok: true, id: res.data && res.data.id };
        if (res.error.code === "23505") {
          return c.from("order_requests").update({ quantity: item.qty, address_id: selectedAddressId })
            .eq("product_key", item.key).eq("status", "new").select().single()
            .then(function (res2) { return { ok: !res2.error, id: res2.data && res2.data.id }; });
        }
        return { ok: false };
      }, function () { return { ok: false }; });
  }

  function goToPayment(items, createdIds) {
    var params = new URLSearchParams();
    if (items.length === 1) {
      params.set("productName", items[0].name);
      var id = createdIds[items[0].key];
      if (id) params.set("requestId", id);
    } else {
      params.set("productName", t("cart.itemsOther", "{n} items").replace("{n}", items.length) + " — " + t("cart.title", "Cart"));
    }
    window.location.href = "payment.html?" + params.toString();
  }

  function proceedToPay(items, btn) {
    if (sending) return;
    if (!auth.isConfigured()) { sendViaWhatsApp(items); render(); return; }

    if (!selectedAddressId) {
      var hint = $("cartAddrHint");
      if (hint) hint.hidden = false;
      addrCard.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    withSession(function () {
      sending = true;
      btn.disabled = true;
      var originalLabel = btn.textContent;
      btn.textContent = t("cart.proceeding", "Starting…");

      auth.getClient().then(function (c) {
        return Promise.all(items.map(function (item) {
          return saveLine(c, item).then(function (r) { return { key: item.key, ok: r.ok, id: r.id }; });
        }));
      }).then(function (results) {
        var createdIds = {};
        results.forEach(function (r) { if (r.ok) { createdIds[r.key] = r.id; cart.removeItem(r.key); } });
        var allOk = results.every(function (r) { return r.ok; });
        if (allOk) { goToPayment(items, createdIds); return; }
        toast(t("cart.partialFailed", "Some items couldn't be sent. Please try again for those."), "error");
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
  window.addEventListener("vitco:auth-changed", function () {
    addressesLoaded = false;
    if (cart.getItems().length) loadAddresses();
  });
  render();
})();
