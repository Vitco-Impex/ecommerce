// admin-product.html — lets the admin (mobile 7500673358) add, edit and delete products. Anyone
// else who lands here (verified or not) sees a gate instead; the real protection is the database's
// own is_admin() (supabase/schema.sql) — this page's checks are only about showing the right thing.
(function () {
  "use strict";

  var auth = window.VitcoAuth;
  var gate = document.getElementById("acctGate");
  var denied = document.getElementById("deniedGate");
  var app = document.getElementById("acctApp");
  if (!auth || !gate || !denied || !app) return;

  var client = null;
  var starting = false;
  var gateAutoOpened = false;
  var slugTouched = false; // true once the admin has manually edited the link
  var categories = [];
  var editingId = null; // id of the product being edited, or null when adding a new one
  var confirmingId = null; // id pending an inline delete confirmation
  var productsCache = []; // last list loaded from the server, so re-renders don't need a refetch

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

  function setMessage(el, key, kind) {
    if (!key) { el.hidden = true; el.textContent = ""; el.removeAttribute("data-i18n"); return; }
    el.hidden = false;
    el.className = "acct-msg " + (kind === "ok" ? "is-ok" : "is-error");
    el.setAttribute("data-i18n", key);
    el.textContent = t(key);
  }

  function fieldError(input, errEl, key) {
    if (key) {
      input.setAttribute("aria-invalid", "true");
      errEl.setAttribute("data-i18n", key);
      errEl.textContent = t(key);
      errEl.hidden = false;
    } else {
      input.removeAttribute("aria-invalid");
      errEl.hidden = true;
      errEl.textContent = "";
      errEl.removeAttribute("data-i18n");
    }
  }

  // ------------------------------------------------------------------ gate / app switching
  function showOnly(section) {
    [gate, denied, app].forEach(function (s) { s.hidden = s !== section; });
  }

  function showGate(openModal) {
    showOnly(gate);
    if (openModal && !gateAutoOpened && window.VitcoOtpModal) {
      gateAutoOpened = true;
      window.VitcoOtpModal.open({ reason: "profile", onVerified: start });
    }
  }

  function start() {
    if (starting || !app.hidden) return;
    if (!auth.isConfigured()) { showGate(false); return; }
    if (!auth.isLoggedIn()) { showGate(true); return; }
    starting = true;
    auth.getClient().then(function (c) {
      client = c;
      return c.auth.getSession();
    }).then(function (res) {
      var session = res.data && res.data.session;
      if (!session) return auth.logout().then(function () { showGate(true); });
      if (!auth.isAdmin()) { showOnly(denied); return; }
      showOnly(app);
      loadAll();
    }).catch(function () {
      showGate(false);
    }).then(function () { starting = false; });
  }

  // ------------------------------------------------------------------ slug
  function slugify(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFKD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
  }

  var slugValueEl = $("slugValue");
  var slugInput = $("prodSlug");
  var slugEditBtn = $("slugEditBtn");
  var SLUG_PLACEHOLDER = "your-product-name";

  function currentSlug() {
    return slugTouched ? slugify(slugInput.value) : slugify(nameValues.en);
  }
  function renderSlugPreview() {
    var s = currentSlug();
    slugValueEl.textContent = s || SLUG_PLACEHOLDER;
    slugValueEl.classList.toggle("is-placeholder", !s);
  }
  $("slugBase").textContent = "product.html?id=";

  slugEditBtn.addEventListener("click", function () {
    var auto = currentSlug(); // read while still in auto mode, before flipping slugTouched
    slugTouched = true;
    slugInput.value = auto;
    slugInput.hidden = false;
    slugEditBtn.hidden = true;
    slugInput.focus();
  });
  slugInput.addEventListener("input", function () {
    fieldError(slugInput, $("prodSlugErr"), null);
    renderSlugPreview();
  });

  // ------------------------------------------------------------------ EN/HI name tabs
  // One visible input serving both languages — switching tabs swaps which value it shows/edits.
  // The slug always tracks the English name specifically, regardless of which tab is active.
  var nameInput = $("prodNameInput");
  var nameLabel = $("prodNameLabel");
  var nameErr = $("prodNameErr");
  var nameTabs = document.querySelectorAll(".field-lang-tab");
  var nameLang = "en";
  var nameValues = { en: "", hi: "" };

  function updateNameLabel() {
    var key = nameLang === "en" ? "admin.productNameEn" : "admin.productNameHi";
    var fallback = nameLang === "en" ? "Product name (English)" : "Product name (Hindi)";
    var text = t(key, fallback);
    if (nameLang === "hi") text += " " + t("acct.optional", "(optional)");
    nameLabel.textContent = text;
  }
  function setNameLang(newLang) {
    nameValues[nameLang] = nameInput.value;
    nameLang = newLang;
    nameInput.value = nameValues[nameLang];
    nameTabs.forEach(function (b) {
      var active = b.getAttribute("data-tab") === newLang;
      b.classList.toggle("active", active);
      b.setAttribute("aria-selected", active ? "true" : "false");
    });
    updateNameLabel();
    fieldError(nameInput, nameErr, null);
  }
  function setNameValues(en, hi) {
    nameValues.en = en || ""; nameValues.hi = hi || "";
    nameLang = "en";
    nameTabs.forEach(function (b) {
      var active = b.getAttribute("data-tab") === "en";
      b.classList.toggle("active", active);
      b.setAttribute("aria-selected", active ? "true" : "false");
    });
    nameInput.value = nameValues.en;
    updateNameLabel();
  }
  nameTabs.forEach(function (b) { b.addEventListener("click", function () { setNameLang(b.getAttribute("data-tab")); }); });
  updateNameLabel();
  renderSlugPreview();

  nameInput.addEventListener("input", function () {
    nameValues[nameLang] = nameInput.value;
    fieldError(nameInput, nameErr, null);
    setMessage($("prodMsg"), null);
    if (nameLang === "en" && !slugTouched) renderSlugPreview();
  });

  // ------------------------------------------------------------------ category dropdown
  var categorySelect = $("prodCategory");
  function renderCategoryOptions() {
    var current = categorySelect.value;
    categorySelect.textContent = "";
    var pick = document.createElement("option");
    pick.value = ""; pick.setAttribute("data-i18n", "admin.categoryPick"); pick.textContent = t("admin.categoryPick");
    categorySelect.appendChild(pick);
    categories.forEach(function (c) {
      var o = document.createElement("option");
      o.value = c.id;
      o.textContent = c["name_" + lang()] || c.name_en;
      categorySelect.appendChild(o);
    });
    if (categories.some(function (c) { return c.id === current; })) categorySelect.value = current;
  }
  categorySelect.addEventListener("change", function () { fieldError(categorySelect, $("prodCategoryErr"), null); });

  // ------------------------------------------------------------------ lists
  function skeletons(container, n) {
    container.textContent = "";
    for (var i = 0; i < n; i++) container.appendChild(h("div", "acct-skeleton", { attrs: { "aria-hidden": "true" } }));
    container.setAttribute("aria-busy", "true");
  }

  function loadFailed(container, key, retry) {
    container.textContent = "";
    var box = h("div", "acct-empty", {}, [
      h("p", "", { key: key }),
      h("button", "btn btn-line btn-sm", { key: "acct.retry", attrs: { type: "button" } })
    ]);
    box.querySelector("button").addEventListener("click", retry);
    container.appendChild(box);
  }

  function linkButton(key, cls, handler) {
    var b = h("button", "addr-link" + (cls ? " " + cls : ""), { key: key, attrs: { type: "button" } });
    b.addEventListener("click", handler);
    return b;
  }

  function renderExistingProducts(rows) {
    productsCache = rows;
    var box = $("existingList");
    box.textContent = "";
    box.removeAttribute("aria-busy");
    if (!rows.length) {
      box.appendChild(h("div", "acct-empty", {}, [h("p", "", { key: "admin.noProducts" })]));
      return;
    }
    var catalog = window.VitcoCatalog;
    var ul = h("ul", "cat-list");
    rows.forEach(function (p) {
      var name = p["name_" + lang()] || p.name_en;
      var cat = p.categories ? (p.categories["name_" + lang()] || p.categories.name_en) : null;
      var priceText = catalog && p.price != null ? catalog.formatPrice(p.discount_price != null ? p.discount_price : p.price) : null;

      var metaChildren = [];
      if (cat) metaChildren.push(h("span", "cat-row-tag", { text: cat }));
      if (priceText) metaChildren.push(h("span", "cat-row-count", { text: priceText }));

      var body = h("button", "cat-row-body", { attrs: { type: "button" } }, [
        h("div", "cat-row-name", {}, [
          h("strong", "", { text: name }),
          h("span", "", { text: "#" + p.slug })
        ]),
        h("div", "cat-row-meta", {}, metaChildren)
      ]);
      body.addEventListener("click", function () { copyProduct(p); });

      var li = h("li", "cat-row" + (editingId === p.id ? " is-editing" : ""), {}, [body]);

      if (confirmingId === p.id) {
        var yes = linkButton("addr.deleteYes", "is-danger", function () { removeProduct(p.id); });
        var no = linkButton("addr.deleteNo", "", function () { confirmingId = null; renderExistingProducts(productsCache); });
        li.appendChild(h("div", "addr-confirm", {}, [h("span", "", { key: "admin.deleteProductAsk" }), no, yes]));
      } else {
        var foot = h("div", "addr-foot");
        foot.appendChild(linkButton("addr.edit", "", function () { startEdit(p); }));
        foot.appendChild(linkButton("addr.delete", "is-danger", function () { confirmingId = p.id; renderExistingProducts(productsCache); }));
        li.appendChild(foot);
      }
      ul.appendChild(li);
    });
    box.appendChild(ul);
  }

  function loadProducts() {
    skeletons($("existingList"), 2);
    return client.from("products").select("id,slug,name_en,name_hi,sort_order,category_id,image_url,price,discount_price,categories(name_en,name_hi)")
      .order("sort_order", { ascending: true })
      .then(function (res) {
        if (res.error) throw res.error;
        renderExistingProducts(res.data || []);
      }).catch(function () { loadFailed($("existingList"), "admin.productsLoadFailed", loadProducts); });
  }

  function loadCategories() {
    return client.from("categories").select("id,slug,name_en,name_hi").order("sort_order", { ascending: true })
      .then(function (res) {
        if (res.error) throw res.error;
        categories = res.data || [];
        var hasCategories = categories.length > 0;
        $("noCatCard").hidden = hasCategories;
        $("formCard").hidden = !hasCategories;
        if (hasCategories) renderCategoryOptions();
      }).catch(function () {
        $("noCatCard").hidden = true;
        $("formCard").hidden = false;
        loadFailed(categorySelect.parentElement, "admin.categoriesLoadFailed", loadCategories);
      });
  }

  function loadAll() {
    loadCategories();
    loadProducts();
  }

  // ------------------------------------------------------------------ copy / edit / delete
  function fillFormFrom(p) {
    categorySelect.value = p.category_id || "";
    fieldError(categorySelect, $("prodCategoryErr"), null);
    setNameValues(p.name_en, p.name_hi);
    $("prodImage").value = p.image_url || "";
    $("prodPrice").value = p.price != null ? p.price : "";
    $("prodDiscountPrice").value = p.discount_price != null ? p.discount_price : "";
    fieldError($("prodImage"), $("prodImageErr"), null);
    fieldError($("prodPrice"), $("prodPriceErr"), null);
    fieldError($("prodDiscountPrice"), $("prodDiscountPriceErr"), null);
    slugTouched = true;
    slugInput.value = p.slug || "";
    slugInput.hidden = false;
    slugEditBtn.hidden = true;
    renderSlugPreview();
    fieldError(nameInput, nameErr, null);
    fieldError(slugInput, $("prodSlugErr"), null);
  }

  function scrollFormIntoView() {
    $("productForm").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function copyProduct(p) {
    if (editingId) cancelEdit(); // copying while mid-edit would be confusing — start fresh
    fillFormFrom(p);
    setMessage($("prodMsg"), null);
    toast(t("admin.productCopied", "Copied into the form below — edit and save to create a new product."), "success");
    scrollFormIntoView();
    nameInput.focus();
  }

  function updateSaveLabel() {
    var label = $("prodSave").querySelector("span");
    var key = editingId ? "admin.saveProduct" : "admin.addProduct";
    label.setAttribute("data-i18n", key);
    label.textContent = t(key, editingId ? "Save changes" : "Add product");
  }

  function startEdit(p) {
    editingId = p.id;
    confirmingId = null;
    fillFormFrom(p);
    setMessage($("prodMsg"), null);
    $("editBannerName").textContent = p["name_" + lang()] || p.name_en;
    $("editBanner").hidden = false;
    updateSaveLabel();
    renderExistingProducts(productsCache);
    scrollFormIntoView();
    nameInput.focus();
  }

  function cancelEdit() {
    editingId = null;
    $("editBanner").hidden = true;
    $("productForm").reset();
    setNameValues("", "");
    slugTouched = false;
    slugInput.hidden = true;
    slugEditBtn.hidden = false;
    renderSlugPreview();
    setMessage($("prodMsg"), null);
    updateSaveLabel();
    renderExistingProducts(productsCache);
  }

  function removeProduct(id) {
    confirmingId = null;
    client.from("products").delete().eq("id", id).then(function (res) {
      if (res.error) throw res.error;
      if (editingId === id) cancelEdit();
      toast(t("admin.productDeleted", "Product deleted."), "success");
      loadProducts();
    }).catch(function () {
      toast(t("admin.deleteProductFailed", "Couldn't delete the product. Please try again."), "error");
      renderExistingProducts(productsCache);
    });
  }

  $("cancelEditBtn").addEventListener("click", cancelEdit);

  // ------------------------------------------------------------------ submit
  $("productForm").addEventListener("submit", function (e) {
    e.preventDefault();
    nameValues[nameLang] = nameInput.value; // capture whatever's on screen right now
    var categoryId = categorySelect.value;
    var nameEn = nameValues.en.trim();
    var nameHi = nameValues.hi.trim();
    var slug = currentSlug();
    var imageUrl = $("prodImage").value.trim();
    var priceRaw = $("prodPrice").value.trim();
    var discountRaw = $("prodDiscountPrice").value.trim();
    var price = priceRaw === "" ? null : Number(priceRaw);
    var discountPrice = discountRaw === "" ? null : Number(discountRaw);

    var firstBad = null;
    function check(ok, input, errEl, key) {
      fieldError(input, errEl, ok ? null : key);
      if (!ok && !firstBad) firstBad = input;
    }
    if (nameEn.length < 2 && nameLang !== "en") setNameLang("en"); // surface the problem field
    check(!!categoryId, categorySelect, $("prodCategoryErr"), "err.category");
    check(nameEn.length >= 2, nameInput, nameErr, "err.productName");
    check(/^[a-z0-9-]{2,60}$/.test(slug), slugTouched ? slugInput : nameInput, $("prodSlugErr"), "err.slug");
    check(imageUrl === "" || /^https?:\/\/\S+$/i.test(imageUrl), $("prodImage"), $("prodImageErr"), "err.imageUrl");
    check(price === null || (Number.isFinite(price) && price >= 0), $("prodPrice"), $("prodPriceErr"), "err.price");
    check(discountPrice === null || (Number.isFinite(discountPrice) && discountPrice >= 0), $("prodDiscountPrice"), $("prodDiscountPriceErr"), "err.price");
    check(discountPrice === null || (price !== null && discountPrice < price), $("prodDiscountPrice"), $("prodDiscountPriceErr"), "err.discountPrice");
    if (firstBad) { firstBad.focus(); setMessage($("prodMsg"), null); return; }

    var btn = $("prodSave"), label = btn.querySelector("span");
    var wasEditing = editingId;
    btn.disabled = true;
    label.setAttribute("data-i18n", "acct.saving"); label.textContent = t("acct.saving", "Saving…");
    setMessage($("prodMsg"), null);

    var payload = {
      category_id: categoryId, slug: slug, name_en: nameEn, name_hi: nameHi || null,
      image_url: imageUrl || null, price: price, discount_price: discountPrice
    };
    var failKey = wasEditing ? "admin.updateProductFailed" : "admin.addProductFailed";
    var query = wasEditing
      ? client.from("products").update(payload).eq("id", wasEditing)
      : client.from("products").select("sort_order").eq("category_id", categoryId).order("sort_order", { ascending: false }).limit(1)
        .then(function (res) {
          var nextOrder = (res.data && res.data[0] ? res.data[0].sort_order : -1) + 1;
          payload.sort_order = nextOrder;
          return client.from("products").insert(payload);
        });

    query.then(function (res) {
      if (res.error) {
        setMessage($("prodMsg"), res.error.code === "23505" ? "admin.slugTakenProduct" : failKey, "error");
        if (res.error.code === "23505" && !slugTouched) { slugEditBtn.click(); }
        return;
      }
      toast(t(wasEditing ? "admin.productUpdated" : "admin.productAdded", wasEditing ? "Product updated." : "Product added."), "success");
      if (wasEditing) cancelEdit(); else {
        var keepCategory = categorySelect.value;
        $("productForm").reset();
        categorySelect.value = keepCategory;
        setNameValues("", "");
        slugTouched = false;
        slugInput.hidden = true;
        slugEditBtn.hidden = false;
        renderSlugPreview();
      }
      loadProducts();
    }, function () {
      setMessage($("prodMsg"), failKey, "error");
    }).then(function () {
      btn.disabled = false;
      updateSaveLabel();
    });
  });

  // ------------------------------------------------------------------ session events
  $("acctGateBtn").addEventListener("click", function () {
    if (window.VitcoOtpModal) window.VitcoOtpModal.open({ reason: "profile", onVerified: start });
  });
  window.addEventListener("vitco:auth-changed", function () {
    if (auth.isLoggedIn()) start();
    else showGate(false);
  });
  window.addEventListener("vitco:lang-changed", function () {
    renderSlugPreview();
    updateNameLabel();
    updateSaveLabel();
    if (categories.length) renderCategoryOptions();
    if (editingId) {
      var current = productsCache.filter(function (p) { return p.id === editingId; })[0];
      if (current) $("editBannerName").textContent = current["name_" + lang()] || current.name_en;
    }
    if (!app.hidden) loadProducts();
  });

  start();
})();
