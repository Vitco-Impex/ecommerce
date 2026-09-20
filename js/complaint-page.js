(function () {
  "use strict";

  var form = document.getElementById("complaint-form");
  if (!form) return;

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var lang = document.documentElement.lang === "hi" ? "hi" : "en";
    var dict = (window.I18N && window.I18N[lang]) || {};

    var name = form.name.value.trim();
    var phone = form.phone.value.trim();
    var product = form.product.value.trim();
    var city = form.city.value.trim();
    var issue = form.issue.value.trim();

    var text = encodeURIComponent(dict["complaint.waHello"] || "Hello VITCO, I'd like to report a complaint / after-sales issue.") +
      "%0A" + encodeURIComponent(dict["form.waName"] || "Name:") + " " + encodeURIComponent(name) +
      "%0A" + encodeURIComponent(dict["form.waPhone"] || "Phone:") + " " + encodeURIComponent(phone) +
      (product ? "%0A" + encodeURIComponent(dict["complaint.waProduct"] || "Product / model:") + " " + encodeURIComponent(product) : "") +
      (city ? "%0A" + encodeURIComponent(dict["complaint.waCity"] || "City:") + " " + encodeURIComponent(city) : "") +
      "%0A" + encodeURIComponent(dict["complaint.waIssue"] || "Issue:") + " " + encodeURIComponent(issue);

    window.open("https://wa.me/919917045963?text=" + text, "_blank");
  });
})();
