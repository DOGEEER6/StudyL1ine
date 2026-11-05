/* 统一顶栏的行为：折叠分组、当前页高亮、用户名回填、管理入口可见性。
   首页另由 app.js 接管 #nav-review / #header-add / #open-settings 的点击。 */
(function () {
  function closeMenus(except) {
    document.querySelectorAll(".nav-more[open]").forEach(function (node) {
      if (node !== except) node.open = false;
    });
  }

  function markActive() {
    var here = location.pathname.replace(/\/+$/, "") || "/";
    document.querySelectorAll(".nav-more-menu a").forEach(function (link) {
      var href = link.getAttribute("href") || "";
      if (href && href !== "/" && here.indexOf(href) === 0) link.classList.add("active");
    });
    document.querySelectorAll(".topbar-nav .nav-link[href]").forEach(function (link) {
      var href = link.getAttribute("href") || "";
      if (!href) return;
      if (href === "/" && here === "/") link.classList.add("active");
      else if (href !== "/" && href.indexOf("?") < 0 && here.indexOf(href) === 0) link.classList.add("active");
    });
    var more = document.querySelector(".nav-more");
    if (more && more.querySelector(".nav-more-menu a.active")) {
      var summary = more.querySelector("summary");
      if (summary) summary.classList.add("active");
    }
  }

  function fillUser() {
    var chip = document.getElementById("user-chip");
    if (!chip) return;
    var name = (chip.getAttribute("data-user") || "").trim();
    if (!name) return;
    var label = document.getElementById("user-name");
    if (label && (!label.textContent || label.textContent.trim() === "…")) label.textContent = name;
    var avatar = document.getElementById("user-avatar");
    if (avatar && !avatar.textContent.trim()) avatar.textContent = name.slice(0, 1).toUpperCase();
  }

  function applyAdmin() {
    var bar = document.querySelector(".topbar");
    if (!bar) return;
    if (bar.getAttribute("data-admin") !== "1") {
      document.querySelectorAll("[data-admin-only]").forEach(function (node) {
        node.hidden = true;
      });
    }
  }

  function boot() {
    markActive();
    fillUser();
    applyAdmin();
  }

  document.addEventListener("click", function (event) {
    if (!event.target.closest(".nav-more")) closeMenus(null);
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") closeMenus(null);
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
