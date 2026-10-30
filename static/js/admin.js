(() => {
  "use strict";

  const PRESETS = {
    openai: {
      base: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      vision: "gpt-4o-mini",
    },
    deepseek: {
      base: "https://api.deepseek.com",
      model: "deepseek-chat",
      vision: "",
    },
    openrouter: {
      base: "https://openrouter.ai/api/v1",
      model: "openai/gpt-4o-mini",
      vision: "openai/gpt-4o-mini",
    },
    siliconflow: {
      base: "https://api.siliconflow.cn/v1",
      model: "Qwen/Qwen2.5-72B-Instruct",
      vision: "Qwen/Qwen2-VL-72B-Instruct",
    },
    moonshot: {
      base: "https://api.moonshot.cn/v1",
      model: "moonshot-v1-8k",
      vision: "",
    },
    custom: { base: "", model: "", vision: "" },
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  let csrf = null;
  let current = null;
  let usersData = [];
  let usersSummary = null;
  let inviteCodes = [];
  let activeUser = null;
  let announcementLoaded = false;

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function formatBytes(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n) || n <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let size = n;
    let i = 0;
    while (size >= 1024 && i < units.length - 1) {
      size /= 1024;
      i += 1;
    }
    return `${size >= 10 || i === 0 ? Math.round(size) : size.toFixed(1)} ${units[i]}`;
  }

  function formatDate(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  }

  function formatDateTime(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  }

  function switchTab(name) {
    const tabs = ["overview", "ai", "users", "invites", "announcement"];
    const target = tabs.includes(name) ? name : "overview";
    $$("[data-admin-tab]").forEach((button) => {
      const on = button.dataset.adminTab === target;
      button.classList.toggle("active", on);
      button.setAttribute("aria-selected", String(on));
    });
    $$("[data-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.panel !== target;
    });
    if (history.replaceState) {
      history.replaceState(null, "", target === "overview" ? location.pathname : `#${target}`);
    }
    if (target === "users") loadUsers();
    if (target === "invites") loadInvites();
    if (target === "announcement") loadAnnouncement();
  }

  function toast(message, type = "success", timeout = 3600) {
    const stack = $("#toast-stack");
    if (!stack) return;
    const node = document.createElement("div");
    node.className = `toast ${type}`;
    node.textContent = message;
    stack.appendChild(node);
    window.setTimeout(() => {
      node.style.opacity = "0";
      node.style.transform = "translateY(6px)";
      node.style.transition = "opacity .2s ease, transform .2s ease";
      window.setTimeout(() => node.remove(), 240);
    }, timeout);
  }

  async function api(path, options = {}) {
    const opts = { credentials: "same-origin", ...options };
    const method = (opts.method || "GET").toUpperCase();
    const headers = { Accept: "application/json", ...(opts.headers || {}) };
    if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(opts.body);
    }
    if (method !== "GET" && csrf) headers["X-CSRF-Token"] = csrf;
    opts.headers = headers;
    const response = await fetch(path, opts);
    if (response.status === 401) {
      location.replace(`/login?next=${encodeURIComponent(location.pathname)}`);
      throw new Error("请先登录");
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "请求失败");
    return data;
  }

  function setStatusPill(config) {
    const pill = $("#admin-status-pill");
    if (!pill) return;
    const on = Boolean(config && config.enabled && config.key_configured);
    pill.classList.toggle("on", on);
    pill.innerHTML = `<i></i>${on ? "AI 已启用" : config && config.enabled ? "待填写 Key" : "未启用"}`;
  }

  function fillForm(config) {
    $("#ai-enabled").checked = Boolean(config.enabled);
    $("#ai-base").value = config.base_url || "";
    $("#ai-model").value = config.model || "";
    $("#ai-vision").value = config.vision_model || "";
    $("#ai-temperature").value = config.temperature ?? 0.2;
    $("#ai-max-tokens").value = config.max_tokens ?? 2400;
    $("#ai-daily-limit").value = config.daily_limit ?? 80;
    $("#ai-hourly-limit").value = config.hourly_limit ?? 30;
    $("#ai-min-interval").value = config.min_interval ?? 3;
    $("#ai-auto-solve").checked = Boolean(config.auto_solve);
    $("#ai-auto-ocr").checked = Boolean(config.auto_ocr);
    const keyState = $("#ai-key-state");
    if (config.key_configured) {
      keyState.textContent = `已配置 ${config.key_hint || ""}`;
      $("#ai-key").placeholder = `${config.key_hint || "已配置"}；留空保持不变`;
    } else {
      keyState.textContent = "尚未配置";
      $("#ai-key").placeholder = "填写新的 API Key";
    }
    setStatusPill(config);
    // Pick a preset label when it matches exactly.
    const preset = Object.entries(PRESETS).find(([, value]) => value.base === config.base_url);
    $("#ai-preset").value = preset ? preset[0] : "custom";
  }

  function text(selector, value) {
    const node = $(selector);
    if (node) node.textContent = value;
  }

  function renderAnnouncementPreview() {
    const title = $("#announcement-popup-title")?.value.trim() || "公告标题";
    const body = $("#announcement-popup-body")?.value.trim() || "弹窗正文会显示在这里。";
    const banner = $("#announcement-banner-text")?.value.trim() || "顶部横幅会显示在这里";
    text("#announcement-preview-title", title);
    text("#announcement-preview-body", body);
    text("#announcement-preview-banner-text", banner);
    const dot = $("#announcement-state-dot");
    if (dot) {
      dot.classList.toggle(
        "on",
        Boolean(
          $("#announcement-popup-enabled")?.checked || $("#announcement-banner-enabled")?.checked
        )
      );
    }
  }

  function fillAnnouncement(data) {
    $("#announcement-popup-enabled").checked = Boolean(data.popup_enabled);
    $("#announcement-popup-title").value = data.popup_title || "";
    $("#announcement-popup-body").value = data.popup_body || "";
    $("#announcement-banner-enabled").checked = Boolean(data.banner_enabled);
    $("#announcement-banner-text").value = data.banner_text || "";
    text("#announcement-save-state", data.updated_at ? `上次保存 ${formatDateTime(data.updated_at)}` : "尚未发布");
    renderAnnouncementPreview();
  }

  async function loadAnnouncement() {
    try {
      const data = await api("/api/admin/announcement");
      fillAnnouncement(data);
      announcementLoaded = true;
    } catch (err) {
      toast(err.message, "error");
    }
  }

  async function saveAnnouncement() {
    const button = $("#announcement-save");
    const label = button.querySelector("span");
    const old = label.textContent;
    button.disabled = true;
    label.textContent = "保存中…";
    try {
      const data = await api("/api/admin/announcement", {
        method: "POST",
        body: {
          popup_enabled: $("#announcement-popup-enabled").checked,
          popup_title: $("#announcement-popup-title").value,
          popup_body: $("#announcement-popup-body").value,
          banner_enabled: $("#announcement-banner-enabled").checked,
          banner_text: $("#announcement-banner-text").value,
        },
      });
      fillAnnouncement(data);
      toast("公告已保存，首页会自动更新", "success");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      button.disabled = false;
      label.textContent = old;
    }
  }

  function renderOverview() {
    const s = usersSummary || {};
    text("#admin-stat-users", s.users ?? "—");
    text("#admin-stat-admins", s.admins ?? "—");
    text("#admin-stat-entries", s.entries ?? "—");
    text("#admin-stat-images", s.images ?? "—");
    text("#admin-stat-storage", formatBytes(s.storage_bytes));
    text("#admin-stat-free", formatBytes(s.disk_free));
    text("#users-count-label", s.users ?? 0);
    text("#users-entry-label", s.entries ?? 0);
    text("#users-image-label", s.images ?? 0);
    text("#users-storage-label", formatBytes(s.storage_bytes));
    text("#admin-users-badge", s.users ?? 0);

    const diskTotal = Number(s.disk_total || 0);
    const diskUsed = Number(s.disk_used || 0);
    const usedPct = diskTotal ? Math.min(100, (diskUsed / diskTotal) * 100) : 0;
    text("#admin-overview-storage-label", `${formatBytes(diskUsed)} / ${formatBytes(diskTotal)}`);
    const bar = $("#admin-overview-storage-bar");
    if (bar) bar.style.width = `${usedPct.toFixed(2)}%`;
    text(
      "#admin-overview-storage-note",
      `题库 ${formatBytes(s.storage_bytes)} · 数据盘剩余 ${formatBytes(s.disk_free)}`
    );
    text("#admin-disk-text", `${usedPct.toFixed(0)}% used`);
    text("#admin-overview-orphans", formatBytes(s.orphan_bytes));
    text("#admin-overview-updated", `更新于 ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`);

    const aiOn = Boolean(current && current.enabled && current.key_configured);
    text("#admin-overview-ai-status", aiOn ? "已启用" : current && current.enabled ? "待填写 Key" : "未启用");
    text(
      "#admin-overview-ai-detail",
      current ? `${current.model || "未设置模型"} · ${current.vision_model || "无视觉模型"}` : "等待读取配置"
    );
    const dot = $("#admin-overview-dot");
    if (dot) dot.classList.toggle("on", aiOn);

    const unusedInvites = inviteCodes.filter((item) => !item.used).length;
    text(
      "#admin-overview-invites",
      inviteCodes.length ? `${unusedInvites} 个可用 / ${inviteCodes.length} 个` : "还没有生成"
    );

    const badge = $("#admin-users-badge");
    if (badge) badge.hidden = !(s.users > 0);
  }

  async function loadUsers() {
    try {
      const data = await api("/api/admin/users");
      usersData = data.users || [];
      usersSummary = data.summary || null;
      renderUsers();
      renderOverview();
    } catch (err) {
      toast(err.message, "error");
    }
  }

  function renderUsers() {
    const root = $("#user-list");
    if (!root) return;
    const query = ($("#user-search")?.value || "").trim().toLowerCase();
    const sort = $("#user-sort")?.value || "storage";
    let list = usersData.filter((user) => user.username.toLowerCase().includes(query));
    list = list.slice().sort((a, b) => {
      if (sort === "entries") return (b.entry_count || 0) - (a.entry_count || 0);
      if (sort === "recent") {
        return String(b.last_entry_at || b.last_login_at || b.created_at || "").localeCompare(
          String(a.last_entry_at || a.last_login_at || a.created_at || "")
        );
      }
      if (sort === "created") {
        return String(a.created_at || "").localeCompare(String(b.created_at || ""));
      }
      return (b.storage_bytes || 0) - (a.storage_bytes || 0);
    });

    root.innerHTML = "";
    if (!list.length) {
      root.innerHTML = `<div class="user-empty">没有匹配的用户。</div>`;
      return;
    }
    const maxStorage = Math.max(1, ...list.map((user) => user.storage_bytes || 0));
    for (const user of list) {
      const pct = Math.max(2, ((user.storage_bytes || 0) / maxStorage) * 100);
      const role = user.role === "admin" ? "管理员" : "用户";
      const last = user.last_entry_at || user.last_login_at;
      const card = document.createElement("div");
      card.className = "user-card";
      card.innerHTML = `
        <div class="user-identity">
          <span class="user-avatar-lg ${user.role === "admin" ? "admin" : ""}">${esc(
            (user.username || "?").slice(0, 1).toUpperCase()
          )}</span>
          <div class="user-main">
            <div class="user-name">${esc(user.username)}<span class="user-role ${
        user.role === "admin" ? "admin" : "user"
      }">${role}</span></div>
            <div class="user-meta">注册 ${esc(formatDate(user.created_at))} · 最近 ${
        last ? esc(formatDateTime(last)) : "未活跃"
      }</div>
          </div>
        </div>
        <div class="user-body">
          <div class="user-stats">
            <div class="user-stat"><b>${user.entry_count || 0}</b><span>题目</span></div>
            <div class="user-stat"><b>${user.image_count || 0}</b><span>图片</span></div>
            <div class="user-stat"><b>${user.ai_done || 0}</b><span>AI 解析</span></div>
            <div class="user-stat"><b>${formatBytes(user.storage_bytes)}</b><span>空间</span></div>
          </div>
          <div class="user-space">
            <div class="user-space-head"><span>空间占用</span><span>${formatBytes(
              user.storage_bytes
            )}</span></div>
            <div class="user-space-track"><i style="width:${pct.toFixed(1)}%"></i></div>
          </div>
        </div>
        <button class="btn btn-ghost btn-sm user-open" type="button" data-user-open="${esc(
          user.id
        )}">查看题目 →</button>
      `;
      card.querySelector("[data-user-open]")?.addEventListener("click", () => openUser(user.id));
      root.appendChild(card);
    }
  }

  async function openUser(userId) {
    activeUser = userId;
    const dialog = $("#user-dialog");
    text("#user-dialog-title", "正在载入…");
    text("#user-dialog-sub", "读取题目与空间占用");
    $("#user-detail-content").innerHTML = '<div class="admin-loading">正在载入用户…</div>';
    if (dialog && !dialog.open) dialog.showModal();
    try {
      const data = await api(`/api/admin/users/${encodeURIComponent(userId)}`);
      const user = data.user;
      const entries = data.entries || [];
      text("#user-dialog-title", user.username);
      text(
        "#user-dialog-sub",
        `${user.role === "admin" ? "管理员" : "普通用户"} · 注册于 ${formatDate(
          user.created_at
        )} · 最近活跃 ${user.last_entry_at ? formatDateTime(user.last_entry_at) : "—"}`
      );
      text("#user-dialog-eyebrow", `USER · ${entries.length} ENTRIES`);
      const entryHtml = entries.length
        ? entries
            .map((entry, index) => {
              const subject = entry.subject === "linear" ? "线性代数" : "工科数学分析";
              const status =
                { unsolved: "不会", wrong: "错题", reviewing: "待复习", mastered: "已掌握" }[
                  entry.status
                ] || entry.status;
              const images = (entry.attachments || [])
                .filter((item) => item.url)
                .map(
                  (item) =>
                    `<a href="${esc(item.url)}" target="_blank" rel="noopener"><img src="${esc(
                      item.url
                    )}" alt="${esc(item.name || "题目图片")}" loading="eager"></a>`
                )
                .join("");
              return `
                <details class="user-entry" ${index === 0 ? "open" : ""}>
                  <summary>
                    <span class="user-entry-title">${esc(entry.title || "未命名题目")}</span>
                    <span class="user-entry-meta">${esc(subject)} · ${esc(status)} · ${formatBytes(
                entry.storage_bytes
              )}</span>
                  </summary>
                  <div class="user-entry-body">
                    <span class="user-entry-label">PROBLEM · 原题</span>
                    <div class="user-entry-problem">${esc(entry.problem || "（仅图片，无文字）")}</div>
                    ${images ? `<div class="user-image-grid">${images}</div>` : ""}
                    ${
                      entry.solution
                        ? `<span class="user-entry-label">SOLUTION · 解析</span><div class="user-entry-solution">${esc(
                            entry.solution
                          )}</div>`
                        : ""
                    }
                    <span class="user-entry-meta">记录于 ${formatDate(
                      entry.occurred_at || entry.created_at
                    )} · ${entry.image_count || 0} 张图片</span>
                  </div>
                </details>`;
            })
            .join("")
        : '<div class="user-empty">这个账号还没有上传题目。</div>';
      $("#user-detail-content").innerHTML = `
        <div class="user-detail-headline">
          <span class="user-avatar-lg ${user.role === "admin" ? "admin" : ""}">${esc(
        (user.username || "?").slice(0, 1).toUpperCase()
      )}</span>
          <div>
            <h3>${esc(user.username)}</h3>
            <p>${user.role === "admin" ? "管理员账号" : "普通用户"} · ${
        user.entry_count || 0
      } 道题</p>
          </div>
        </div>
        <div class="user-detail-summary">
          <div><strong>${user.entry_count || 0}</strong><span>题目</span></div>
          <div><strong>${user.image_count || 0}</strong><span>图片</span></div>
          <div><strong>${formatBytes(user.storage_bytes)}</strong><span>空间占用</span></div>
          <div><strong>${user.solved_count || 0}</strong><span>已有解答</span></div>
        </div>
        <div class="user-detail-list">${entryHtml}</div>
      `;
    } catch (err) {
      $("#user-detail-content").innerHTML = `<div class="user-empty">${esc(err.message)}</div>`;
      toast(err.message, "error");
    }
  }

  function closeUser() {
    const dialog = $("#user-dialog");
    if (dialog && dialog.open) dialog.close();
    activeUser = null;
  }

  function renderStats(data) {
    const stats = data.stats || {};
    $("#ai-stat-done").textContent = stats.ai_done || 0;
    $("#ai-stat-pending").textContent = stats.ai_pending || 0;
    $("#ai-stat-errors").textContent = stats.ai_errors || 0;
    $("#ai-stat-ocr").textContent = stats.ocr_done || 0;
    const usage = stats.usage_by_kind || {};
    const usageText = `过去 24 小时调用 ${stats.usage_today || 0} 次 · 最近一小时 ${
      stats.usage_hour || 0
    } 次 · ${stats.usage_users_today || 0} 个用户`;
    text("#ai-usage-line", usageText);
    if (Object.keys(usage).length) {
      const node = $("#ai-usage-line");
      if (node) {
        const labels = { solve: "解析", ocr: "OCR", chat: "追问", test: "测试" };
        node.textContent = `${usageText} · ${Object.entries(usage)
          .map(([key, count]) => `${labels[key] || key} ${count}`)
          .join(" / ")}`;
      }
    }

    const last = data.last_test || {};
    if (last.at) {
      $("#ai-last-test").textContent = `最近测试：${last.reply || "OK"} · ${last.model || ""} · ${last.elapsed_ms || 0}ms`;
    } else {
      $("#ai-last-test").textContent = "还没有测试连接。";
    }

    const errors = $("#ai-recent-errors");
    errors.innerHTML = "";
    if (!data.recent_errors || !data.recent_errors.length) {
      const empty = document.createElement("p");
      empty.className = "side-empty";
      empty.textContent = "没有失败记录。";
      errors.appendChild(empty);
    } else {
      for (const item of data.recent_errors) {
        const row = document.createElement("div");
        row.className = "admin-error-item";
        const title = document.createElement("strong");
        title.textContent = item.title || "未命名题目";
        const error = document.createElement("p");
        error.textContent = item.error || "";
        row.appendChild(title);
        row.appendChild(error);
        errors.appendChild(row);
      }
    }
  }

  async function load() {
    try {
      const me = await api("/api/me");
      if (!me.authenticated) {
        location.replace("/login?next=/admin");
        return;
      }
      csrf = me.csrf;
      const data = await api("/api/admin/ai");
      current = data.config;
      fillForm(data.config);
      renderStats(data);
      await Promise.all([loadInvites(), loadUsers()]);
      renderOverview();
      const hash = location.hash.replace("#", "");
      switchTab(["ai", "users", "invites", "announcement"].includes(hash) ? hash : "overview");
    } catch (err) {
      toast(err.message, "error");
    }
  }

  function collect() {
    return {
      enabled: $("#ai-enabled").checked,
      base_url: $("#ai-base").value.trim(),
      model: $("#ai-model").value.trim(),
      vision_model: $("#ai-vision").value.trim(),
      temperature: Number($("#ai-temperature").value || 0.2),
      max_tokens: Number($("#ai-max-tokens").value || 2400),
      daily_limit: Number($("#ai-daily-limit").value || 0),
      hourly_limit: Number($("#ai-hourly-limit").value || 0),
      min_interval: Number($("#ai-min-interval").value || 0),
      auto_solve: $("#ai-auto-solve").checked,
      auto_ocr: $("#ai-auto-ocr").checked,
      api_key: $("#ai-key").value.trim(),
    };
  }

  async function save(clearKey = false) {
    const button = $("#ai-save");
    const old = button.querySelector("span").textContent;
    button.disabled = true;
    button.querySelector("span").textContent = "保存中…";
    try {
      const body = collect();
      if (clearKey) body.clear_key = true;
      const data = await api("/api/admin/ai", { method: "POST", body });
      current = data.config;
      fillForm(data.config);
      $("#ai-key").value = "";
      renderStats(data);
      renderOverview();
      toast(clearKey ? "API Key 已清除" : "AI 配置已保存", "success");
    } catch (err) {
      toast(err.message, "error", 5000);
    } finally {
      button.disabled = false;
      button.querySelector("span").textContent = old;
    }
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
    return Promise.resolve();
  }

  function renderInvites(codes) {
    const root = $("#invite-list");
    if (!root) return;
    root.innerHTML = "";
    if (!codes || !codes.length) {
      const empty = document.createElement("p");
      empty.className = "side-empty";
      empty.textContent = "还没有邀请码，点右上角生成一个。";
      root.appendChild(empty);
      return;
    }
    for (const item of codes) {
      const row = document.createElement("div");
      row.className = `invite-row${item.used ? " is-used" : ""}`;
      const code = document.createElement("code");
      code.textContent = item.code;
      const state = document.createElement("span");
      state.className = "invite-state";
      state.textContent = item.used ? "已使用" : "未使用";
      row.appendChild(code);
      row.appendChild(state);
      if (!item.used) {
        const copy = document.createElement("button");
        copy.className = "text-btn";
        copy.type = "button";
        copy.textContent = "复制";
        copy.addEventListener("click", async () => {
          try {
            await copyText(item.code);
            toast("邀请码已复制", "success", 1800);
          } catch (err) {
            toast("复制失败，请手动选中", "error");
          }
        });
        const revoke = document.createElement("button");
        revoke.className = "text-btn danger-text";
        revoke.type = "button";
        revoke.textContent = "撤销";
        revoke.addEventListener("click", async () => {
          if (!window.confirm(`撤销邀请码 ${item.code}？`)) return;
          try {
            await api(`/api/admin/invites/${encodeURIComponent(item.code)}`, { method: "DELETE" });
            await loadInvites();
            toast("邀请码已撤销", "success");
          } catch (err) {
            toast(err.message, "error");
          }
        });
        row.appendChild(copy);
        row.appendChild(revoke);
      }
      root.appendChild(row);
    }
  }

  async function loadInvites() {
    try {
      const data = await api("/api/admin/invites");
      inviteCodes = data.codes || [];
      renderInvites(inviteCodes);
      renderOverview();
    } catch (err) {
      toast(err.message, "error");
    }
  }

  async function createInvite() {
    const button = $("#invite-generate");
    const old = button.textContent;
    button.disabled = true;
    button.textContent = "生成中…";
    try {
      const data = await api("/api/admin/invites", { method: "POST", body: { count: 1 } });
      inviteCodes = data.all || [];
      renderInvites(inviteCodes);
      renderOverview();
      const code = data.codes && data.codes[0];
      if (code) {
        try {
          await copyText(code);
          toast(`邀请码 ${code} 已生成并复制`, "success", 4200);
        } catch (err) {
          toast(`邀请码 ${code} 已生成`, "success", 4200);
        }
      }
    } catch (err) {
      toast(err.message, "error", 5000);
    } finally {
      button.disabled = false;
      button.textContent = old;
    }
  }

  async function test() {
    const button = $("#ai-test");
    const old = button.querySelector("span").textContent;
    button.disabled = true;
    button.querySelector("span").textContent = "测试中…";
    $("#ai-test-result").textContent = "正在保存配置并请求模型服务…";
    try {
      // Persist the form first so "Test" uses exactly what is on screen.
      const saved = await api("/api/admin/ai", { method: "POST", body: collect() });
      current = saved.config;
      const result = await api("/api/admin/ai/test", { method: "POST", body: {} });
      $("#ai-test-result").textContent = `连接成功：${result.reply || "OK"} · ${result.model} · ${result.elapsed_ms}ms`;
      toast("连接成功", "success");
      const data = await api("/api/admin/ai");
      current = data.config;
      renderStats(data);
      renderOverview();
    } catch (err) {
      $("#ai-test-result").textContent = `连接失败：${err.message}`;
      toast(err.message, "error", 6000);
    } finally {
      button.disabled = false;
      button.querySelector("span").textContent = old;
    }
  }

  function bind() {
    $("#ai-preset").addEventListener("change", (event) => {
      const preset = PRESETS[event.target.value];
      if (!preset) return;
      if (preset.base) $("#ai-base").value = preset.base;
      if (preset.model) $("#ai-model").value = preset.model;
      $("#ai-vision").value = preset.vision || "";
    });
    $("#ai-save").addEventListener("click", () => save(false));
    $("#ai-test").addEventListener("click", test);
    $("#ai-clear-key").addEventListener("click", () => {
      if (window.confirm("确定清除服务器上的 API Key？清除后 AI 自动解析会暂停。")) save(true);
    });
    $("#invite-generate").addEventListener("click", createInvite);
    $("#announcement-save").addEventListener("click", saveAnnouncement);
    [
      "#announcement-popup-enabled",
      "#announcement-popup-title",
      "#announcement-popup-body",
      "#announcement-banner-enabled",
      "#announcement-banner-text",
    ].forEach((selector) => {
      const node = $(selector);
      if (!node) return;
      node.addEventListener("input", renderAnnouncementPreview);
      node.addEventListener("change", renderAnnouncementPreview);
    });
    $$("[data-admin-tab]").forEach((button) => {
      button.addEventListener("click", () => switchTab(button.dataset.adminTab));
    });
    $$("[data-goto-tab]").forEach((button) => {
      button.addEventListener("click", () => switchTab(button.dataset.gotoTab));
    });
    $("#user-search").addEventListener("input", renderUsers);
    $("#user-sort").addEventListener("change", renderUsers);
    $$("[data-close-user]").forEach((button) => button.addEventListener("click", closeUser));
    const userDialog = $("#user-dialog");
    if (userDialog) {
      userDialog.addEventListener("click", (event) => {
        if (event.target === userDialog) closeUser();
      });
      userDialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        closeUser();
      });
    }
    $("#ai-enabled").addEventListener("change", () => {
      const pill = $("#admin-status-pill");
      if (!pill) return;
      pill.classList.toggle("on", $("#ai-enabled").checked && current && current.key_configured);
      pill.innerHTML = `<i></i>${$("#ai-enabled").checked ? "已开启" : "未启用"}`;
    });
  }

  bind();
  load();
})();
