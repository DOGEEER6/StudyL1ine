/* 统一顶栏的行为：当前页高亮、用户名回填、管理入口可见性。
   导航项全部平铺，不再有折叠菜单。
   首页另由 app.js 接管 #nav-review / #header-add / #open-settings 的点击。 */
(function () {
  function markActive() {
    var here = location.pathname.replace(/\/+$/, "") || "/";
    document.querySelectorAll(".topbar-nav .nav-link[href]").forEach(function (link) {
      var href = link.getAttribute("href") || "";
      if (!href || href.indexOf("?") >= 0) return;
      if (href === "/") {
        if (here === "/") link.classList.add("active");
        return;
      }
      if (here.indexOf(href) === 0) link.classList.add("active");
    });
  }

  function fillUser() {
    var chip = document.getElementById("user-chip");
    if (!chip) return;
    var name = (chip.getAttribute("data-user") || "").trim();
    if (!name) return;
    var label = document.getElementById("user-name");
    if (label && (!label.textContent || label.textContent.trim() === "\u2026")) label.textContent = name;
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
