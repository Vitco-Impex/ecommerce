(function () {
  "use strict";

  // Keep the sticky-header offset (used by section scroll-margin-top) in sync with the
  // header's real rendered height, since it varies by viewport.
  function syncStickyOffsets() {
    var header = document.querySelector(".site-header");
    var headerH = header ? header.offsetHeight : 73;
    document.documentElement.style.setProperty("--header-h", headerH + "px");
    document.documentElement.style.setProperty("--sticky-h", headerH + "px");
  }
  syncStickyOffsets();
  window.addEventListener("resize", syncStickyOffsets);
  window.addEventListener("load", syncStickyOffsets);

  // Top carousel
  (function () {
    var root = document.getElementById("topCarousel");
    if (!root) return;
    var track = document.getElementById("carouselTrack");
    var slides = Array.prototype.slice.call(track.children);
    var dotsWrap = document.getElementById("carouselDots");
    var prevBtn = root.querySelector(".carousel-btn.prev");
    var nextBtn = root.querySelector(".carousel-btn.next");
    var index = 0;
    var timer = null;

    slides.forEach(function (_, i) {
      var dot = document.createElement("button");
      dot.type = "button";
      dot.className = "carousel-dot" + (i === 0 ? " active" : "");
      dot.setAttribute("aria-label", "Go to slide " + (i + 1));
      dot.addEventListener("click", function () { goTo(i); restart(); });
      dotsWrap.appendChild(dot);
    });
    var dots = Array.prototype.slice.call(dotsWrap.children);

    function goTo(i) {
      index = (i + slides.length) % slides.length;
      track.style.transform = "translateX(-" + (index * 100) + "%)";
      dots.forEach(function (d, di) { d.classList.toggle("active", di === index); });
    }
    function next() { goTo(index + 1); }
    function prev() { goTo(index - 1); }
    function start() {
      stop();
      timer = setInterval(next, 3000);
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    function restart() { start(); }

    prevBtn.addEventListener("click", function () { prev(); restart(); });
    nextBtn.addEventListener("click", function () { next(); restart(); });
    root.addEventListener("mouseenter", stop);
    root.addEventListener("mouseleave", start);
    root.addEventListener("focusin", stop);
    root.addEventListener("focusout", start);

    start();
  })();

  // Language switch (EN / conversational Hindi)
  function applyLanguage(lang) {
    var dict = window.I18N && window.I18N[lang];
    if (!dict) return;
    document.documentElement.lang = lang === "hi" ? "hi" : "en";
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      if (dict[key] != null) el.textContent = dict[key];
    });
    document.querySelectorAll("[data-i18n-alt]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-alt");
      if (dict[key] != null) el.setAttribute("alt", dict[key]);
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-placeholder");
      if (dict[key] != null) el.setAttribute("placeholder", dict[key]);
    });
    document.querySelectorAll("[data-i18n-title]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-title");
      if (dict[key] != null) { el.setAttribute("title", dict[key]); el.setAttribute("aria-label", dict[key]); }
    });
    document.querySelectorAll(".lang-btn").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-lang") === lang);
    });
    syncStickyOffsets();
    try { localStorage.setItem("vitco-lang", lang); } catch (e) {}
    // Product/category names come from the database, not this dictionary, so nothing above
    // retranslates them — catalog.js's renderers listen for this to redraw in the new language.
    window.dispatchEvent(new CustomEvent("vitco:lang-changed"));
  }
  document.querySelectorAll(".lang-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      applyLanguage(btn.getAttribute("data-lang"));
    });
  });
  var savedLang = null;
  try { savedLang = localStorage.getItem("vitco-lang"); } catch (e) {}
  if (savedLang === "hi") applyLanguage("hi");

  // Lightbox for category images
  var lightbox = document.getElementById("lightbox");
  var lightboxImg = lightbox ? lightbox.querySelector("img") : null;
  document.querySelectorAll(".category-media img").forEach(function (img) {
    img.addEventListener("click", function () {
      if (!lightbox || !lightboxImg) return;
      lightboxImg.src = img.src;
      lightboxImg.alt = img.alt;
      lightbox.classList.add("open");
      document.body.style.overflow = "hidden";
    });
  });
  function closeLightbox() {
    if (!lightbox) return;
    lightbox.classList.remove("open");
    document.body.style.overflow = "";
  }
  var lbClose = document.querySelector(".lightbox-close");
  if (lbClose) lbClose.addEventListener("click", closeLightbox);
  if (lightbox) {
    lightbox.addEventListener("click", function (e) {
      if (e.target === lightbox) closeLightbox();
    });
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeLightbox();
  });

  // Enquiry form -> WhatsApp handoff (no backend on this static site)
  var form = document.getElementById("enquiry-form");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var lang = document.documentElement.lang === "hi" ? "hi" : "en";
      var dict = (window.I18N && window.I18N[lang]) || {};
      var name = form.name.value.trim();
      var phone = form.phone.value.trim();
      var productLabel = form.product.options[form.product.selectedIndex].textContent.trim();
      var message = form.message.value.trim();
      var text = encodeURIComponent(dict["form.waHello"] || "Hello VITCO, I would like to enquire.") +
        "%0A" + encodeURIComponent(dict["form.waName"] || "Name:") + " " + encodeURIComponent(name) +
        "%0A" + encodeURIComponent(dict["form.waPhone"] || "Phone:") + " " + encodeURIComponent(phone) +
        "%0A" + encodeURIComponent(dict["form.waProduct"] || "Product interested in:") + " " + encodeURIComponent(productLabel) +
        (message ? "%0A" + encodeURIComponent(dict["form.waMessage"] || "Message:") + " " + encodeURIComponent(message) : "");
      window.open("https://wa.me/919917045963?text=" + text, "_blank");
    });
  }

  // Site search — client-side, indexes the product cards already on the page
  (function () {
    var root = document.getElementById("siteSearch");
    if (!root) return;
    var input = document.getElementById("siteSearchInput");
    var clearBtn = document.getElementById("siteSearchClear");
    var panel = document.getElementById("siteSearchPanel");
    var hintEl = document.getElementById("siteSearchHint");
    var chipsWrap = document.getElementById("siteSearchChips");
    var resultsWrap = document.getElementById("siteSearchResults");
    var emptyWrap = document.getElementById("siteSearchEmpty");
    var emptyQueryEl = document.getElementById("siteSearchEmptyQuery");
    var emptyWaLink = document.getElementById("siteSearchEmptyWa");
    var MAX_RESULTS = 8;
    var debounceTimer = null;
    var activeIndex = -1;

    function currentDict() {
      var lang = document.documentElement.lang === "hi" ? "hi" : "en";
      return (window.I18N && window.I18N[lang]) || {};
    }

    // Product and category names live in Supabase (js/catalog.js), not in this page's DOM — search
    // reads the shared catalogue directly so it works the same on every page. A card rendered on this
    // page (home) is matched back up by its data-product-key so a result can still scroll to it;
    // elsewhere goToResult() opens the product page instead.
    function buildIndex() {
      var catalog = window.VitcoCatalog;
      if (!catalog) return [];
      var cats = {};
      catalog.state.categories.forEach(function (c) { cats[c.id] = catalog.categoryName(c); });
      return catalog.state.products.map(function (p) {
        var name = catalog.productName(p);
        var cat = cats[p.category_id] || "";
        return {
          key: p.slug,
          el: document.querySelector('[data-product-key="' + p.slug + '"]'),
          name: name,
          cat: cat,
          price: currentDict()["common.priceTBD"] || "",
          // both languages stay searchable regardless of which one the page is showing
          haystack: (name + " " + cat + " " + (p.name_en || "") + " " + (p.name_hi || "")).toLowerCase()
        };
      }).filter(function (item) { return item.name; });
    }

    function popularTerms() {
      var catalog = window.VitcoCatalog;
      if (!catalog) return [];
      return catalog.state.categories.map(function (c) { return catalog.categoryName(c); }).filter(Boolean).slice(0, 6);
    }

    function highlight(text, terms) {
      var frag = document.createDocumentFragment();
      var lower = text.toLowerCase();
      // find the earliest match among the terms to mark
      var matchStart = -1, matchLen = 0;
      terms.forEach(function (term) {
        if (!term) return;
        var idx = lower.indexOf(term);
        if (idx !== -1 && (matchStart === -1 || idx < matchStart)) {
          matchStart = idx; matchLen = term.length;
        }
      });
      if (matchStart === -1) {
        frag.appendChild(document.createTextNode(text));
        return frag;
      }
      frag.appendChild(document.createTextNode(text.slice(0, matchStart)));
      var mark = document.createElement("mark");
      mark.textContent = text.slice(matchStart, matchStart + matchLen);
      frag.appendChild(mark);
      frag.appendChild(document.createTextNode(text.slice(matchStart + matchLen)));
      return frag;
    }

    function productIconSvg() {
      var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");
      svg.setAttribute("stroke-width", "1.6");
      svg.setAttribute("stroke-linecap", "round");
      svg.setAttribute("stroke-linejoin", "round");
      svg.innerHTML = '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>';
      return svg;
    }

    function renderChips() {
      chipsWrap.innerHTML = "";
      var terms = popularTerms();
      terms.forEach(function (term) {
        var chip = document.createElement("button");
        chip.type = "button";
        chip.className = "site-search-chip";
        chip.textContent = term;
        chip.addEventListener("click", function () {
          input.value = term;
          runSearch(term);
          input.focus();
        });
        chipsWrap.appendChild(chip);
      });
    }

    function renderResults(items, terms, total) {
      resultsWrap.innerHTML = "";
      activeIndex = -1;
      items.forEach(function (item, i) {
        var row = document.createElement("button");
        row.type = "button";
        row.className = "site-search-result";
        row.setAttribute("role", "option");
        row.dataset.index = String(i);

        var icon = document.createElement("div");
        icon.className = "site-search-result-icon";
        icon.appendChild(productIconSvg());

        var text = document.createElement("div");
        text.className = "site-search-result-text";
        var nameLine = document.createElement("div");
        nameLine.className = "site-search-result-name";
        nameLine.appendChild(highlight(item.name, terms));
        text.appendChild(nameLine);
        if (item.cat) {
          var catLine = document.createElement("div");
          catLine.className = "site-search-result-cat";
          catLine.textContent = item.cat;
          text.appendChild(catLine);
        }

        var price = document.createElement("div");
        price.className = "site-search-result-price";
        price.textContent = item.price;

        row.appendChild(icon);
        row.appendChild(text);
        row.appendChild(price);
        row.addEventListener("click", function () { goToResult(item); });
        resultsWrap.appendChild(row);
      });
      if (total > items.length) {
        var more = document.createElement("div");
        more.className = "site-search-more";
        more.textContent = "+" + (total - items.length) + " " + (currentDict()["search.moreResults"] || "more results — refine your search");
        resultsWrap.appendChild(more);
      }
    }

    function goToResult(item) {
      closePanel();
      closeMobileSearch();
      input.value = item.name;
      if (!item.el) { window.location.href = "product.html?id=" + encodeURIComponent(item.key); return; }
      item.el.scrollIntoView({ behavior: "smooth", block: "center" });
      item.el.classList.remove("search-hit-flash");
      // eslint-disable-next-line no-unused-expressions
      item.el.offsetWidth; // restart animation if same card is picked twice
      item.el.classList.add("search-hit-flash");
      window.setTimeout(function () { item.el.classList.remove("search-hit-flash"); }, 1700);
    }

    function openPanel() {
      panel.hidden = false;
      input.setAttribute("aria-expanded", "true");
    }
    function closePanel() {
      panel.hidden = true;
      input.setAttribute("aria-expanded", "false");
      activeIndex = -1;
    }

    // On phones the search bar itself is hidden until the bottom nav's
    // Search button reveals it (see .site-search.mobile-search-open in CSS).
    var mobileNavSearchBtn = document.getElementById("mobileNavSearch");
    function isMobileSearchLayout() {
      return window.matchMedia && window.matchMedia("(max-width: 640px)").matches;
    }
    function openMobileSearch() {
      root.classList.add("mobile-search-open");
      window.scrollTo({ top: 0, behavior: "smooth" });
      window.setTimeout(function () { input.focus(); }, 150);
    }
    function closeMobileSearch() {
      if (!isMobileSearchLayout()) return;
      root.classList.remove("mobile-search-open");
      closePanel();
    }
    if (mobileNavSearchBtn) {
      mobileNavSearchBtn.addEventListener("click", function () {
        if (root.classList.contains("mobile-search-open")) {
          input.focus();
        } else {
          openMobileSearch();
        }
      });
    }

    function runSearch(rawQuery) {
      var query = rawQuery.trim().toLowerCase();
      clearBtn.hidden = query.length === 0;

      if (!query) {
        hintEl.hidden = false;
        chipsWrap.hidden = false;
        resultsWrap.innerHTML = "";
        emptyWrap.hidden = true;
        renderChips();
        openPanel();
        return;
      }

      var terms = query.split(/\s+/).filter(Boolean);
      var index = buildIndex();
      var matches = index.filter(function (item) {
        return terms.every(function (t) { return item.haystack.indexOf(t) !== -1; });
      });
      matches.sort(function (a, b) {
        function score(item) {
          var n = item.name.toLowerCase();
          if (n.indexOf(query) === 0) return 3;
          if (n.indexOf(query) !== -1) return 2;
          return 1;
        }
        return score(b) - score(a);
      });

      hintEl.hidden = true;
      chipsWrap.hidden = true;

      if (!matches.length) {
        resultsWrap.innerHTML = "";
        emptyWrap.hidden = false;
        emptyQueryEl.textContent = "“" + rawQuery.trim() + "”";
        emptyWaLink.href = "https://wa.me/919917045963?text=" +
          encodeURIComponent("Hi VITCO, I'm looking for: " + rawQuery.trim() + " — do you have this?");
      } else {
        emptyWrap.hidden = true;
        renderResults(matches.slice(0, MAX_RESULTS), terms, matches.length);
      }
      openPanel();
    }

    input.addEventListener("input", function () {
      window.clearTimeout(debounceTimer);
      var val = input.value;
      debounceTimer = window.setTimeout(function () { runSearch(val); }, 120);
    });
    input.addEventListener("focus", function () { runSearch(input.value); });
    clearBtn.addEventListener("click", function () {
      input.value = "";
      clearBtn.hidden = true;
      runSearch("");
      input.focus();
    });
    document.addEventListener("click", function (e) {
      var onSearchBtn = mobileNavSearchBtn && mobileNavSearchBtn.contains(e.target);
      if (!root.contains(e.target) && !onSearchBtn) { closePanel(); closeMobileSearch(); }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !panel.hidden) { closePanel(); closeMobileSearch(); input.blur(); }
    });
    // Re-run whatever's on screen once the catalogue has (re)loaded, or the language changes.
    window.addEventListener("vitco:catalog-ready", function () { if (!panel.hidden) runSearch(input.value); });
    window.addEventListener("vitco:lang-changed", function () { if (!panel.hidden) runSearch(input.value); });
    input.addEventListener("keydown", function (e) {
      var rows = Array.prototype.slice.call(resultsWrap.querySelectorAll(".site-search-result"));
      if (!rows.length) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        activeIndex = Math.min(activeIndex + 1, rows.length - 1);
        rows.forEach(function (r, i) { r.classList.toggle("is-active", i === activeIndex); });
        rows[activeIndex].scrollIntoView({ block: "nearest" });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
        rows.forEach(function (r, i) { r.classList.toggle("is-active", i === activeIndex); });
        rows[activeIndex].scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter") {
        e.preventDefault();
        rows[activeIndex >= 0 ? activeIndex : 0].click();
      }
    });
  })();

  // Footer year
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
})();
