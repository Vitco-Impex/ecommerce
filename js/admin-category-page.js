// admin-category.html — lets the admin (mobile 7500673358) add a category. Anyone else who lands
// here (verified or not) sees a gate instead; the real protection is the database's own is_admin()
// (supabase/schema.sql) — this page's checks are only about showing the right thing, not security.
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
  var editingId = null; // id of the category being edited, or null when adding a new one
  var confirmingId = null; // id pending an inline delete confirmation
  var categoriesCache = []; // last list loaded from the server, so re-renders don't need a refetch

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
      loadExisting();
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
      .slice(0, 40);
  }

  var slugValueEl = $("slugValue");
  var slugInput = $("catSlug");
  var slugEditBtn = $("slugEditBtn");

  function currentSlug() {
    return slugTouched ? slugify(slugInput.value) : slugify(nameValues.en);
  }
  // The slug format (lowercase-with-hyphens) is the same regardless of site language, so this
  // example is never translated — unlike everything else on the page.
  var SLUG_PLACEHOLDER = "your-category-name";
  function renderSlugPreview() {
    var s = currentSlug();
    slugValueEl.textContent = s || SLUG_PLACEHOLDER;
    slugValueEl.classList.toggle("is-placeholder", !s);
  }
  $("slugBase").textContent = "index.html#";

  // ------------------------------------------------------------------ EN/HI name tabs
  // One visible input serving both languages — switching tabs swaps which value it shows/edits.
  // The slug always tracks the English name specifically, regardless of which tab is active.
  var nameInput = $("catNameInput");
  var nameLabel = $("catNameLabel");
  var nameErr = $("catNameErr");
  var nameTabs = document.querySelectorAll(".field-lang-tab");
  var nameLang = "en";
  var nameValues = { en: "", hi: "" };

  function updateNameLabel() {
    var key = nameLang === "en" ? "admin.nameEn" : "admin.nameHi";
    var fallback = nameLang === "en" ? "Category name (English)" : "Category name (Hindi)";
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
    setMessage($("catMsg"), null);
    if (nameLang === "en" && !slugTouched) renderSlugPreview();
  });
  slugEditBtn.addEventListener("click", function () {
    var auto = currentSlug(); // read while still in auto mode, before flipping slugTouched
    slugTouched = true;
    slugInput.value = auto;
    slugInput.hidden = false;
    slugEditBtn.hidden = true;
    slugInput.focus();
  });
  slugInput.addEventListener("input", function () {
    fieldError(slugInput, $("catSlugErr"), null);
    renderSlugPreview();
  });

  // ------------------------------------------------------------------ existing categories
  function skeletons(container, n) {
    container.textContent = "";
    for (var i = 0; i < n; i++) container.appendChild(h("div", "acct-skeleton", { attrs: { "aria-hidden": "true" } }));
    container.setAttribute("aria-busy", "true");
  }

  function loadFailed(container, retry) {
    container.textContent = "";
    var box = h("div", "acct-empty", {}, [
      h("p", "", { key: "admin.categoriesLoadFailed" }),
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

  function renderExisting(rows) {
    categoriesCache = rows;
    var box = $("existingList");
    box.textContent = "";
    box.removeAttribute("aria-busy");
    if (!rows.length) {
      box.appendChild(h("div", "acct-empty", {}, [h("p", "", { key: "admin.noCategories" })]));
      return;
    }
    var ul = h("ul", "cat-list");
    rows.forEach(function (c) {
      var name = c["name_" + lang()] || c.name_en;
      var count = c._count || 0;
      var countKey = count === 1 ? "admin.productCountOne" : "admin.productCountOther";

      var body = h("button", "cat-row-body", { attrs: { type: "button" } }, [
        h("div", "cat-row-name", {}, [
          h("strong", "", { text: name }),
          h("span", "", { text: "#" + c.slug })
        ]),
        h("div", "cat-row-meta", {}, [
          h("span", "cat-row-count", { text: t(countKey, "{n}").replace("{n}", count) })
        ])
      ]);
      body.addEventListener("click", function () { copyCategory(c); });

      var li = h("li", "cat-row" + (editingId === c.id ? " is-editing" : ""), {}, [body]);

      if (confirmingId === c.id) {
        var yes = linkButton("addr.deleteYes", "is-danger", function () { removeCategory(c.id, count); });
        var no = linkButton("addr.deleteNo", "", function () { confirmingId = null; renderExisting(categoriesCache); });
        var confirmMsg = count > 0
          ? h("span", "", { text: t("admin.deleteCategoryAskProducts", "Delete this category and its {count}? This can't be undone.").replace("{count}", t(countKey, "{n}").replace("{n}", count)) })
          : h("span", "", { key: "admin.deleteCategoryAsk" });
        li.appendChild(h("div", "addr-confirm", {}, [confirmMsg, no, yes]));
      } else {
        var foot = h("div", "addr-foot");
        foot.appendChild(linkButton("addr.edit", "", function () { startEdit(c); }));
        foot.appendChild(linkButton("addr.delete", "is-danger", function () { confirmingId = c.id; renderExisting(categoriesCache); }));
        li.appendChild(foot);
      }
      ul.appendChild(li);
    });
    box.appendChild(ul);
  }

  function loadExisting() {
    skeletons($("existingList"), 2);
    client.from("categories").select("id,slug,name_en,name_hi,sort_order").order("sort_order", { ascending: true })
      .then(function (catRes) {
        if (catRes.error) throw catRes.error;
        var categories = catRes.data || [];
        return client.from("products").select("category_id").then(function (prodRes) {
          var counts = {};
          (prodRes.data || []).forEach(function (p) { counts[p.category_id] = (counts[p.category_id] || 0) + 1; });
          categories.forEach(function (c) { c._count = counts[c.id] || 0; });
          return categories;
        });
      }).then(renderExisting).catch(function () { loadFailed($("existingList"), loadExisting); });
  }

  // ------------------------------------------------------------------ copy / edit / delete
  function fillFormFrom(c) {
    setNameValues(c.name_en, c.name_hi);
    slugTouched = true;
    slugInput.value = c.slug || "";
    slugInput.hidden = false;
    slugEditBtn.hidden = true;
    renderSlugPreview();
    fieldError(nameInput, nameErr, null);
    fieldError(slugInput, $("catSlugErr"), null);
  }

  function scrollFormIntoView() {
    $("categoryForm").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function copyCategory(c) {
    if (editingId) cancelEdit(); // copying while mid-edit would be confusing — start fresh
    fillFormFrom(c);
    setMessage($("catMsg"), null);
    toast(t("admin.categoryCopied", "Copied into the form below — edit and save to create a new category."), "success");
    scrollFormIntoView();
    nameInput.focus();
  }

  function updateSaveLabel() {
    var label = $("catSave").querySelector("span");
    var key = editingId ? "admin.saveCategory" : "admin.addCategory";
    label.setAttribute("data-i18n", key);
    label.textContent = t(key, editingId ? "Save changes" : "Add category");
  }

  function startEdit(c) {
    editingId = c.id;
    confirmingId = null;
    fillFormFrom(c);
    setMessage($("catMsg"), null);
    $("editBannerName").textContent = c["name_" + lang()] || c.name_en;
    $("editBanner").hidden = false;
    updateSaveLabel();
    renderExisting(categoriesCache);
    scrollFormIntoView();
    nameInput.focus();
  }

  function cancelEdit() {
    editingId = null;
    $("editBanner").hidden = true;
    $("categoryForm").reset();
    setNameValues("", "");
    slugTouched = false;
    slugInput.hidden = true;
    slugEditBtn.hidden = false;
    renderSlugPreview();
    setMessage($("catMsg"), null);
    updateSaveLabel();
    renderExisting(categoriesCache);
  }

  function removeCategory(id, productCount) {
    confirmingId = null;
    // Deleting a category also deletes every product filed under it — remove the
    // products first (products: admin delete RLS policy) so the category never
    // ends up gone while its products are stranded by a failed second step.
    var removeProducts = productCount > 0
      ? client.from("products").delete().eq("category_id", id)
      : Promise.resolve({ error: null });

    removeProducts.then(function (prodRes) {
      if (prodRes.error) throw prodRes.error;
      return client.from("categories").delete().eq("id", id);
    }).then(function (res) {
      if (res.error) throw res.error;
      if (editingId === id) cancelEdit();
      toast(t("admin.categoryDeleted", "Category deleted."), "success");
      loadExisting();
    }).catch(function () {
      toast(t("admin.deleteFailed", "Couldn't delete the category. Please try again."), "error");
      renderExisting(categoriesCache);
    });
  }

  $("cancelEditBtn").addEventListener("click", cancelEdit);

  // ------------------------------------------------------------------ submit
  $("categoryForm").addEventListener("submit", function (e) {
    e.preventDefault();
    nameValues[nameLang] = nameInput.value; // capture whatever's on screen right now
    var nameEn = nameValues.en.trim();
    var nameHi = nameValues.hi.trim();
    var slug = currentSlug();

    var firstBad = null;
    function check(ok, input, errEl, key) {
      fieldError(input, errEl, ok ? null : key);
      if (!ok && !firstBad) firstBad = input;
    }
    if (nameEn.length < 2 && nameLang !== "en") setNameLang("en"); // surface the problem field
    check(nameEn.length >= 2, nameInput, nameErr, "err.categoryName");
    check(/^[a-z0-9-]{2,40}$/.test(slug), slugTouched ? slugInput : nameInput, $("catSlugErr"), "err.slug");
    if (firstBad) { firstBad.focus(); setMessage($("catMsg"), null); return; }

    var btn = $("catSave"), label = btn.querySelector("span");
    var wasEditing = editingId;
    btn.disabled = true;
    label.setAttribute("data-i18n", "acct.saving"); label.textContent = t("acct.saving", "Saving…");
    setMessage($("catMsg"), null);

    var failKey = wasEditing ? "admin.updateFailed" : "admin.addFailed";
    var query = wasEditing
      ? client.from("categories").update({ slug: slug, name_en: nameEn, name_hi: nameHi || null }).eq("id", wasEditing)
      : client.from("categories").select("sort_order").order("sort_order", { ascending: false }).limit(1)
        .then(function (res) {
          var nextOrder = (res.data && res.data[0] ? res.data[0].sort_order : -1) + 1;
          return client.from("categories").insert({ slug: slug, name_en: nameEn, name_hi: nameHi || null, sort_order: nextOrder });
        });

    query.then(function (res) {
      if (res.error) {
        setMessage($("catMsg"), res.error.code === "23505" ? "admin.slugTaken" : failKey, "error");
        if (res.error.code === "23505" && !slugTouched) { slugEditBtn.click(); }
        return;
      }
      toast(t(wasEditing ? "admin.categoryUpdated" : "admin.categoryAdded", wasEditing ? "Category updated." : "Category added."), "success");
      if (wasEditing) cancelEdit(); else {
        $("categoryForm").reset();
        setNameValues("", "");
        slugTouched = false;
        slugInput.hidden = true;
        slugEditBtn.hidden = false;
        renderSlugPreview();
      }
      loadExisting();
    }, function () {
      setMessage($("catMsg"), failKey, "error");
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
    updateSaveLabel();
    updateNameLabel();
    if (editingId) {
      var current = categoriesCache.filter(function (c) { return c.id === editingId; })[0];
      if (current) $("editBannerName").textContent = current["name_" + lang()] || current.name_en;
    }
    if (!app.hidden) loadExisting();
  });

  start();
})();
