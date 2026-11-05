/* ==========================================================================
   math-notes · 数学错题本
   Vanilla JS front-end. No framework, no external requests.
   ========================================================================== */

(() => {
  "use strict";

  // ---------------------------------------------------------------------
  // Constants & state
  // ---------------------------------------------------------------------

  const SUBJECT_LABEL = { analysis: "工科数学分析", linear: "线性代数" };
  const KIND_LABEL = { math: "数学", cpp: "程序设计", english: "英语", other: "其他" };

  const STATUS_LABEL = {
    unsolved: "不会",
    wrong: "错题",
    reviewing: "待复习",
    mastered: "已掌握",
  };
  const STATUS_ORDER = ["unsolved", "wrong", "reviewing", "mastered"];
  const RESULT_META = {
    again: { label: "忘记了", hint: "1 天后" },
    hard: { label: "有点模糊", hint: "2 天后" },
    good: { label: "基本掌握", hint: "按计划" },
    easy: { label: "很熟练", hint: "更久之后" },
  };
  const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const DRAFT_KEY = "math-notes:draft:v1";
  function draftKey() { return `${DRAFT_KEY}:${state.user ? state.user.id : "anonymous"}`; }
  function storedMode() { try { return localStorage.getItem("math-notes:mode:v1"); } catch { return null; } }
  const MODE_KEY = "math-notes:mode:v1";
  const ANNOUNCEMENT_POPUP_KEY = "math-notes:announcement:popup";
  const ANNOUNCEMENT_BANNER_KEY = "math-notes:announcement:banner";
  const MAX_ATTACHMENTS = 8;
  const MAX_PRINT = 120;

  const state = {
    csrf: null,
    user: null,
    subjects: Object.entries(SUBJECT_LABEL).map(([id, name]) => ({id, name})),
    entries: [],
    total: 0,
    stats: null,
    mode: storedMode() === "practice" ? "practice" : "solutions",
    filters: { subject: "all", status: "all", q: "", tag: "", due: false },
    sort: "newest",
    loading: false,
    loadSeq: 0,
    selectMode: false,
    selected: new Set(),
    expanded: new Set(),
    editor: null,
    imageEditing: false,
    detail: null,
    review: null,
    confirmResolver: null,
    draftsTimer: null,
    previewTimers: {},
    lastImageKind: "problem",
    aiPoll: null,
    announcementVersion: "0",
    chat: { entryId: null, messages: [], loading: false, sending: false, loaded: false },
  };

  // ---------------------------------------------------------------------
  // Tiny DOM helpers
  // ---------------------------------------------------------------------

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function el(tag, props, ...children) {
    const node = document.createElement(tag);
    if (props) {
      for (const [key, value] of Object.entries(props)) {
        if (value === null || value === undefined || value === false) continue;
        if (key === "class") node.className = value;
        else if (key === "text") node.textContent = String(value);
        else if (key === "html") node.innerHTML = value; // static markup only
        else if (key === "dataset") Object.assign(node.dataset, value);
        else if (key === "style") Object.assign(node.style, value);
        else if (key.startsWith("on") && typeof value === "function") {
          node.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (key === "checked" || key === "value" || key === "disabled") {
          node[key] = value;
        } else {
          node.setAttribute(key, value === true ? "" : value);
        }
      }
    }
    appendChildren(node, children);
    return node;
  }

  function appendChildren(node, children) {
    for (const child of children.flat(Infinity)) {
      if (child === null || child === undefined || child === false) continue;
      node.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
    }
  }

  function iconEl(name, className = "icon") {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", className);
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", `#i-${name}`);
    svg.appendChild(use);
    return svg;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function setText(node, value) {
    if (node) node.textContent = String(value ?? "");
  }

  function svgIcon(name) {
    return iconEl(name);
  }

  // ---------------------------------------------------------------------
  // Dates
  // ---------------------------------------------------------------------

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function todayDate() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function todayISO() {
    const d = todayDate();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function parseLocalDate(value) {
    if (!value) return null;
    const [y, m, d] = String(value).slice(0, 10).split("-").map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }

  function toLocalDate(value) {
    if (value instanceof Date) {
      return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }
    return parseLocalDate(value);
  }

  function dateKey(value) {
    const d = toLocalDate(value);
    if (!d) return "";
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function addDays(d, n) {
    const copy = toLocalDate(d);
    copy.setDate(copy.getDate() + n);
    return copy;
  }

  function daysBetween(a, b) {
    const da = toLocalDate(a);
    const db = toLocalDate(b);
    if (!da || !db) return 0;
    return Math.round((db.getTime() - da.getTime()) / 86400000);
  }

  function formatDateShort(value) {
    const d = parseLocalDate(value);
    if (!d) return "";
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }

  function formatDateFull(value) {
    const d = parseLocalDate(value);
    if (!d) return "";
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  }

  function formatTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  function formatDateTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())} ${pad2(
      d.getHours()
    )}:${pad2(d.getMinutes())}`;
  }

  function dayLabel(value) {
    const d = parseLocalDate(value);
    if (!d) return "";
    const today = todayDate();
    const diff = daysBetween(value, dateKey(today));
    if (diff === 0) return "今天";
    if (diff === 1) return "昨天";
    if (diff === 2) return "前天";
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }

  function monthLabel(value) {
    const d = parseLocalDate(value);
    if (!d) return "";
    return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`;
  }

  function weekdayLabel(value) {
    const d = parseLocalDate(value);
    return d ? WEEKDAYS[d.getDay()] : "";
  }

  function nextReviewText(value) {
    if (!value) return "未安排复习";
    const today = todayISO();
    const diff = daysBetween(today, value);
    if (diff < 0) return `已逾期 ${Math.abs(diff)} 天`;
    if (diff === 0) return "今天复习";
    if (diff === 1) return "明天复习";
    return `${formatDateShort(value)}复习`;
  }

  // ---------------------------------------------------------------------
  // API
  // ---------------------------------------------------------------------

  class ApiError extends Error {
    constructor(message, status, code) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.code = code;
    }
  }

  async function api(path, options = {}) {
    const opts = { credentials: "same-origin", ...options };
    const method = (opts.method || "GET").toUpperCase();
    const headers = { Accept: "application/json", ...(opts.headers || {}) };
    if (opts.body && !(opts.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(opts.body);
    }
    if (method !== "GET" && state.csrf) headers["X-CSRF-Token"] = state.csrf;
    opts.headers = headers;
    let response;
    try {
      response = await fetch(path, opts);
    } catch (err) {
      throw new ApiError("网络连接失败，请检查网络后重试", 0, "network");
    }
    if (response.status === 401) {
      const next = encodeURIComponent(location.pathname + location.search);
      location.replace(`/login?next=${next}`);
      throw new ApiError("登录已失效", 401, "unauthorized");
    }
    const contentType = response.headers.get("content-type") || "";
    let data;
    if (contentType.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }
    if (!response.ok) {
      const message =
        (data && data.error) || (typeof data === "string" && data) || "请求失败，请稍后重试";
      throw new ApiError(message, response.status, data && data.code);
    }
    return data;
  }

  function handleError(err) {
    if (err && err.code === "unauthorized") return;
    console.error(err);
    toast(err && err.message ? err.message : "操作失败，请稍后重试", "error");
  }

  // ---------------------------------------------------------------------
  // Toast
  // ---------------------------------------------------------------------

  function toast(message, type = "success", timeout = 3400) {
    const stack = $("#toast-stack");
    if (!stack) return;
    const icons = { success: "check-circle", error: "alert", info: "lightbulb" };
    const node = el(
      "div",
      { class: `toast ${type}` },
      iconEl(icons[type] || "lightbulb"),
      el("span", { text: message })
    );
    stack.appendChild(node);
    window.setTimeout(() => {
      node.style.opacity = "0";
      node.style.transform = "translateY(6px)";
      node.style.transition = "opacity .2s ease, transform .2s ease";
      window.setTimeout(() => node.remove(), 240);
    }, timeout);
  }

  // ---------------------------------------------------------------------
  // Modal helpers
  // ---------------------------------------------------------------------

  function openDialog(dialog) {
    if (!dialog || dialog.open) return;
    closeMobileSidebar();
    if (window.matchMedia("(max-width: 760px)").matches) {
      const replace = history.state?.mathDialog && !document.querySelector("dialog[open]");
      history[replace ? "replaceState" : "pushState"]({ ...history.state, mathDialog: dialog.id }, "", location.href);
      dialog.dataset.historyEntry = "1";
    }
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    document.body.classList.add("has-dialog");
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
    if (!document.querySelector("dialog[open]")) document.body.classList.remove("has-dialog");
  }

  function confirmAction({ title, message, okText = "确定", cancelText = "取消", danger = true }) {
    return new Promise((resolve) => {
      const dialog = $("#confirm-dialog");
      setText($("#confirm-title"), title || "确认操作");
      setText($("#confirm-message"), message || "");
      const ok = $("#confirm-ok");
      const cancel = $("#confirm-cancel");
      ok.textContent = okText;
      cancel.textContent = cancelText;
      ok.className = `btn ${danger ? "btn-danger" : "btn-primary"}`;
      state.confirmResolver = resolve;
      openDialog(dialog);
    });
  }

  function resolveConfirm(value) {
    const dialog = $("#confirm-dialog");
    if (dialog && dialog.open) closeDialog(dialog);
    if (state.confirmResolver) {
      const resolve = state.confirmResolver;
      state.confirmResolver = null;
      resolve(value);
    }
  }

  // ---------------------------------------------------------------------
  // Math rendering
  // ---------------------------------------------------------------------

  function normalizeMathText(text) {
    let value = String(text || "");
    // Some models double-escape LaTeX inside JSON. Reduce two backslashes
    // before a command/delimiter to the single backslash KaTeX expects.
    for (let i = 0; i < 2; i += 1) {
      value = value.replace(/\\\\(?=[A-Za-z(\[\]])/g, "\\");
    }
    return value;
  }

  function formatAnswerMath(text) {
    const value = normalizeMathText(text).replace(/\s+/g, " ").trim();
    if (!value) return value;
    if (/\$|\\\(|\\\[/.test(value)) return value;
    const cjk = value.search(/[\u4e00-\u9fff]/);
    if (cjk > 0) {
      const head = value.slice(0, cjk).trim();
      const tail = value.slice(cjk).trim();
      if (head && /[\\^_=\[\]()]|T|f/.test(head)) return `$${head}$ ${tail}`;
      return value;
    }
    if (/\\|[\^_]/.test(value)) return `$${value}$`;
    return value;
  }

  function renderMath(node, options = {}) {
    if (!node) return;
    node.textContent = options.answer
      ? formatAnswerMath(node.textContent)
      : normalizeMathText(node.textContent);
    if (typeof window.renderMathInElement !== "function") return;
    try {
      window.renderMathInElement(node, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "\\[", right: "\\]", display: true },
          { left: "\\(", right: "\\)", display: false },
          { left: "$", right: "$", display: false },
        ],
        throwOnError: false,
        errorColor: "#b33a2b",
        strict: false,
        trust: false,
        ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code", "option"],
      });
    } catch (err) {
      console.warn("Math render skipped", err);
    }
  }

  // ---------------------------------------------------------------------
  // Stats, heatmap, tags
  // ---------------------------------------------------------------------

  async function refreshStats() {
    try {
      const stats = await api("/api/stats");
      state.stats = stats;
      renderStats(stats);
    } catch (err) {
      handleError(err);
    }
  }

  function renderStats(stats) {
    if (!stats) return;
    setText($("#stat-total"), stats.total || 0);
    setText($("#stat-due"), stats.due || 0);
    setText($("#stat-analysis"), (stats.by_subject && stats.by_subject.analysis) || 0);
    setText($("#stat-linear"), (stats.by_subject && stats.by_subject.linear) || 0);
    setText($("#sf-all"), stats.total || 0);
    setText($("#sf-analysis"), (stats.by_subject && stats.by_subject.analysis) || 0);
    setText($("#sf-linear"), (stats.by_subject && stats.by_subject.linear) || 0);
    state.subjects.forEach(subject => {
      setText($(`[data-subject-count="${subject.id}"]`), stats.by_subject?.[subject.id] || 0);
      setText($(`[data-stat="${subject.id}"] strong`), stats.by_subject?.[subject.id] || 0);
    });
    setText($("#intro-count"), stats.total || 0);
    setText($("#dash-total"), stats.total || 0);
    setText($("#dash-due"), stats.due || 0);
    setText($("#dash-ai"), stats.ai_solved || 0);
    setText($("#hero-total"), stats.total || 0);
    setText($("#hero-due"), stats.due || 0);
    setText($("#mobile-due"), stats.due > 99 ? "99+" : stats.due || 0);
    $("#mobile-due").hidden = !stats.due;
    setText($("#side-due"), stats.due || 0);
    const aiFoot = $(".hero-ai");
    if (aiFoot) {
      if (stats.ai_ready) {
        aiFoot.innerHTML = '<span class="ai-spark">✦</span> AI 自动解析已就绪';
      } else if (state.user && state.user.role === "admin") {
        aiFoot.innerHTML = '<span class="ai-spark">✦</span> <a href="/admin">配置 AI 自动解析</a>';
      } else {
        aiFoot.innerHTML = '<span class="ai-spark">✦</span> AI 由管理员配置';
      }
    }

    for (const status of STATUS_ORDER) {
      setText($(`#st-${status}`), (stats.by_status && stats.by_status[status]) || 0);
    }

    if (stats.streak > 0) {
      setText($("#streak-text"), `连续记录 ${stats.streak} 天 · 保持节奏`);
    } else if (stats.entries_today > 0) {
      setText($("#streak-text"), `今天已记录 ${stats.entries_today} 道题`);
    } else {
      setText($("#streak-text"), "从今天开始记录");
    }

    if (stats.due > 0) {
      setText($("#due-title"), `${stats.due} 道题等待复习`);
      setText(
        $("#due-sub"),
        stats.overdue > 0 ? `其中 ${stats.overdue} 道已逾期，先复习它们` : "按遗忘曲线，今天到期"
      );
    } else if (stats.total > 0) {
      setText($("#due-title"), "今天没有待复习");
      setText($("#due-sub"), "复习会按遗忘曲线自动安排");
    } else {
      setText($("#due-title"), "还没有题目");
      setText($("#due-sub"), "记录第一道题，开始建立时间线");
    }

    renderHeatmap(stats);
    renderTagCloud(stats.tags || []);
    updateTopbarDate();
  }

  function renderHeatmap(stats) {
    const root = $("#heatmap");
    if (!root) return;
    clear(root);
    let start = parseLocalDate(stats.activity_start) || addDays(todayDate(), -118);
    // Align the first row to Monday so each column reads as one week.
    const mondayOffset = (start.getDay() + 6) % 7;
    start = addDays(start, -mondayOffset);
    const activity = stats.activity || {};
    const totalDays = 119 + mondayOffset;
    for (let i = 0; i < totalDays; i += 1) {
      const d = addDays(start, i);
      const key = dateKey(d);
      const count = activity[key] || 0;
      let level = 0;
      if (count >= 6) level = 4;
      else if (count >= 4) level = 3;
      else if (count >= 2) level = 2;
      else if (count >= 1) level = 1;
      const cell = el("i", {
        dataset: { level: String(level) },
        title: `${formatDateFull(key)} · ${count} 条记录`,
      });
      root.appendChild(cell);
    }
  }

  function renderTagCloud(tags) {
    const root = $("#tag-cloud");
    if (!root) return;
    clear(root);
    if (!tags.length) {
      root.appendChild(el("p", { class: "side-empty", text: "添加题目后，标签会汇总在这里。" }));
      setText($("#clear-tags"), "");
      $("#clear-tags").hidden = true;
      return;
    }
    for (const tag of tags) {
      const button = el(
        "button",
        {
          class: `tag-chip${state.filters.tag === tag.name ? " active" : ""}`,
          type: "button",
          dataset: { tag: tag.name },
          title: `${tag.name} · ${tag.count} 道`,
        },
        el("span", { text: tag.name }),
        el("b", { text: String(tag.count) })
      );
      root.appendChild(button);
    }
    $("#clear-tags").hidden = !state.filters.tag;
  }

  function updateTopbarDate() {
    const d = todayDate();
    setText($("#topbar-date"), `今天 · ${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAYS[d.getDay()]}`);
  }

  // ---------------------------------------------------------------------
  // Filters, URL, loading
  // ---------------------------------------------------------------------

  function hasFilters() {
    return Boolean(
      state.filters.subject !== "all" ||
        state.filters.status !== "all" ||
        state.filters.tag ||
        state.filters.q ||
        state.filters.due
    );
  }

  function activeFilterCount() {
    let count = 0;
    if (state.filters.subject !== "all") count += 1;
    if (state.filters.status !== "all") count += 1;
    if (state.filters.tag) count += 1;
    if (state.filters.q) count += 1;
    if (state.filters.due) count += 1;
    return count;
  }

  function applyFiltersToUI() {
    $$("[data-quick-subject]").forEach((btn) => {
      const active = btn.dataset.quickSubject === state.filters.subject;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", String(active));
    });
    $$("#subject-filter .side-filter").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.subject === state.filters.subject);
    });
    $$("#status-filter .side-filter").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.status === state.filters.status);
    });
    $$(".tag-chip").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tag === state.filters.tag);
    });
    $$(".stat-cell").forEach((btn) => {
      btn.classList.toggle(
        "active",
        (btn.dataset.stat === "all" && !hasFilters()) ||
          (btn.dataset.stat === state.filters.subject) ||
          (btn.dataset.stat === "due" && state.filters.due)
      );
    });
    const badge = $("#filter-badge");
    const count = activeFilterCount();
    if (badge) {
      badge.hidden = count === 0;
      badge.textContent = String(count);
    }
    $("#clear-tags").hidden = !state.filters.tag;
    renderActiveFilters();
  }

  function renderActiveFilters() {
    const root = $("#active-filters");
    if (!root) return;
    clear(root);
    const chips = [];
    if (state.filters.subject !== "all") {
      chips.push({
        label: SUBJECT_LABEL[state.filters.subject],
        clear: () => {
          state.filters.subject = "all";
        },
      });
    }
    if (state.filters.status !== "all") {
      chips.push({
        label: STATUS_LABEL[state.filters.status],
        clear: () => {
          state.filters.status = "all";
        },
      });
    }
    if (state.filters.due) {
      chips.push({
        label: "待复习",
        clear: () => {
          state.filters.due = false;
        },
      });
    }
    if (state.filters.tag) {
      chips.push({
        label: `#${state.filters.tag}`,
        clear: () => {
          state.filters.tag = "";
        },
      });
    }
    if (state.filters.q) {
      chips.push({
        label: `搜索：${state.filters.q}`,
        clear: () => {
          state.filters.q = "";
          const input = $("#search-input");
          if (input) input.value = "";
        },
      });
    }
    for (const chip of chips) {
      root.appendChild(
        el(
          "span",
          { class: "active-filter" },
          el("span", { text: chip.label }),
          el(
            "button",
            {
              type: "button",
              "aria-label": `移除筛选 ${chip.label}`,
              onclick: () => {
                chip.clear();
                applyFiltersToUI();
                loadEntries();
              },
            },
            iconEl("x")
          )
        )
      );
    }
  }

  function updateURL() {
    const params = new URLSearchParams();
    if (state.filters.subject !== "all") params.set("subject", state.filters.subject);
    if (state.filters.status !== "all") params.set("status", state.filters.status);
    if (state.filters.due) params.set("due", "1");
    if (state.filters.tag) params.set("tag", state.filters.tag);
    if (state.filters.q) params.set("q", state.filters.q);
    if (state.sort !== "newest") params.set("sort", state.sort);
    if (state.mode !== "solutions") params.set("mode", state.mode);
    const query = params.toString();
    const next = `${location.pathname}${query ? `?${query}` : ""}`;
    history.replaceState(history.state, "", next);
  }

  function readURL() {
    const params = new URLSearchParams(location.search);
    const subject = params.get("subject");
    state.filters.subject = /^(analysis|linear|s_[0-9a-f]{32})$/.test(subject || "") ? subject : "all";
    const status = params.get("status");
    state.filters.status = STATUS_ORDER.includes(status) ? status : "all";
    state.filters.due = params.get("due") === "1";
    state.filters.tag = params.get("tag") || "";
    state.filters.q = params.get("q") || "";
    state.sort = "newest";
    const sort = params.get("sort");
    if (["newest", "oldest", "due", "difficulty", "updated"].includes(sort)) state.sort = sort;
    if (params.get("mode") === "practice") state.mode = "practice";
    else if (params.get("mode") === "solutions") state.mode = "solutions";
  }

  async function loadEntries({ silent = false } = {}) {
    const seq = ++state.loadSeq;
    state.loading = true;
    if (!silent) {
      const timeline = $("#timeline");
      if (!timeline.querySelector(".entry-card") && !timeline.querySelector(".empty-state")) {
        timeline.innerHTML =
          '<div class="skeleton-wrap"><div class="skeleton-line short"></div><div class="skeleton-card"></div><div class="skeleton-card"></div></div>';
      }
    }
    const params = new URLSearchParams();
    params.set("solutions", state.mode === "solutions" ? "1" : "0");
    params.set("sort", state.sort);
    params.set("limit", "400");
    if (state.filters.subject !== "all") params.set("subject", state.filters.subject);
    if (state.filters.status !== "all") params.set("status", state.filters.status);
    if (state.filters.due) params.set("due", "1");
    if (state.filters.tag) params.set("tag", state.filters.tag);
    if (state.filters.q) params.set("q", state.filters.q);

    try {
      const data = await api(`/api/entries?${params.toString()}`);
      if (seq !== state.loadSeq) return;
      state.entries = data.entries || [];
      state.total = data.total || 0;
      renderTimeline();
      updateCounts();
      updateURL();
      scheduleAiPoll();
    } catch (err) {
      if (seq !== state.loadSeq) return;
      handleError(err);
      renderLoadError(err);
    } finally {
      if (seq === state.loadSeq) state.loading = false;
    }
  }

  function updateCounts() {
    const filtered = hasFilters();
    const count = state.entries.length;
    setText($("#result-count"), count < state.total ? `已显示 ${count} / ${state.total} 道题` : filtered ? `找到 ${count} 道题` : `共 ${count} 道题`);
    setText($("#end-count"), count);
    $("#timeline-end").hidden = count === 0;
    applyFiltersToUI();
  }

  function hasPendingAi() {
    return Boolean(state.stats?.ai_pending) || state.entries.some((entry) => entry.ai_status === "pending" || entry.ai_status === "generating");
  }

  function scheduleAiPoll() {
    window.clearTimeout(state.aiPoll);
    if (!hasPendingAi()) return;
    state.aiPoll = window.setTimeout(async () => {
      const detailId = state.detail && state.detail.id;
      const before = detailId ? state.detail.ai_status : null;
      await Promise.all([refreshStats(), loadEntries({ silent: true })]);
      if (detailId) {
        const latest = state.entries.find((entry) => entry.id === detailId);
        if (latest && before !== latest.ai_status && ["done", "error"].includes(latest.ai_status)) {
          try {
            const detail = await api(`/api/entries/${detailId}`);
            state.detail = detail;
            renderDetail(detail, { revealed: state.detailRevealed });
            loadChatIfNeeded(detailId);
          } catch (err) {
            // Keep the current detail; the next poll can retry.
          }
        }
      }
    }, 3600);
  }

  async function retryAi(id) {
    try {
      const data = await api(`/api/entries/${id}/ai/solve`, { method: "POST", body: {} });
      const entry = state.entries.find((item) => item.id === id);
      if (entry) Object.assign(entry, data.entry);
      if (state.detail && state.detail.id === id) {
        state.detail = data.entry;
        renderDetail(data.entry, { revealed: state.detailRevealed });
      }
      renderTimeline();
      scheduleAiPoll();
      toast(data.entry?.manual_has_solution ? "正在重新识别题目并整理知识点" : "AI 正在重新生成解析", "info");
    } catch (err) {
      handleError(err);
    }
  }

  // ---------------------------------------------------------------------
  // Timeline rendering
  // ---------------------------------------------------------------------

  function renderTimeline() {
    const root = $("#timeline");
    if (!root) return;
    clear(root);
    if (!state.entries.length) {
      root.appendChild(renderEmptyState());
      $("#timeline-end").hidden = true;
      return;
    }

    let currentMonth = "";
    let currentDay = "";
    let dayEntries = null;

    for (const entry of state.entries) {
      const occurred = entry.occurred_at || (entry.created_at || "").slice(0, 10);
      const month = occurred.slice(0, 7);
      if (month !== currentMonth) {
        currentMonth = month;
        root.appendChild(
          el(
            "div",
            { class: "month-divider" },
            el("b", { text: monthLabel(occurred) }),
            el("span", { text: "" })
          )
        );
        currentDay = "";
      }
      if (occurred !== currentDay) {
        currentDay = occurred;
        const group = el("section", { class: "day-group", dataset: { day: occurred } });
        const label = el(
          "div",
          { class: "day-label" },
          el("span", { class: "day-date", text: dayLabel(occurred) }),
          el("span", { class: "day-week", text: weekdayLabel(occurred) }),
          el("span", { class: "day-count", text: "" })
        );
        dayEntries = el("div", { class: "day-entries" });
        group.appendChild(label);
        group.appendChild(dayEntries);
        root.appendChild(group);
      }
      dayEntries.appendChild(renderCard(entry));
      const countEl = dayEntries.parentElement.querySelector(".day-count");
      if (countEl) {
        const n = dayEntries.querySelectorAll(".entry-card").length;
        countEl.textContent = `${n} 道`;
      }
    }

    $("#timeline-end").hidden = false;
    requestAnimationFrame(enhanceProblemClamps);
  }

  function renderEmptyState() {
    const filtered = hasFilters();
    const wrap = el("div", { class: "empty-state" });
    wrap.appendChild(el("div", { class: "empty-mark", text: filtered ? "∅" : "∫" }));
    if (filtered) {
      wrap.appendChild(el("h2", { text: "没有符合条件的题目" }));
      wrap.appendChild(
        el("p", {
          text: "换个筛选条件试试，或者清除筛选，回到完整的时间线。",
        })
      );
      const actions = el("div", { class: "empty-actions" });
      actions.appendChild(
        el(
          "button",
          {
            class: "btn btn-primary",
            type: "button",
            onclick: () => {
              clearFilters();
              loadEntries();
            },
          },
          iconEl("refresh"),
          el("span", { text: "清除筛选" })
        )
      );
      wrap.appendChild(actions);
    } else {
      wrap.appendChild(el("h2", { text: "时间线还是空的" }));
      wrap.appendChild(
        el("p", {
          text: "把第一道不会的题记下来。原题、错因、解答和复习节奏，会从这里开始积累。",
        })
      );
      const actions = el("div", { class: "empty-actions" });
      actions.appendChild(
        el(
          "button",
          {
            class: "btn btn-primary",
            type: "button",
            onclick: () => openEditor(),
          },
          iconEl("plus"),
          el("span", { text: "记录第一道题" })
        )
      );
      actions.appendChild(
        el(
          "button",
          {
            class: "btn btn-ghost",
            type: "button",
            onclick: () => $("#import-file").click(),
          },
          iconEl("upload"),
          el("span", { text: "导入备份" })
        )
      );
      wrap.appendChild(actions);
      wrap.appendChild(el("p", { class: "empty-tip", text: "支持 LaTeX · 图片粘贴 · 含解答 / 无解答" }));
    }
    return wrap;
  }

  function renderLoadError(err) {
    const root = $("#timeline");
    if (!root) return;
    clear(root);
    const wrap = el("div", { class: "empty-state" });
    wrap.appendChild(el("div", { class: "empty-mark", text: "!" }));
    wrap.appendChild(el("h2", { text: "题目没有载入" }));
    wrap.appendChild(el("p", { text: err.message || "请检查服务器状态后重试。" }));
    wrap.appendChild(
      el(
        "button",
        { class: "btn btn-primary", type: "button", onclick: () => loadEntries() },
        iconEl("refresh"),
        el("span", { text: "重新载入" })
      )
    );
    root.appendChild(wrap);
  }

  function renderCard(entry) {
    const card = el("article", {
      class: `entry-card entry-compact${state.selected.has(entry.id) ? " is-selected" : ""}${entry.starred ? " is-starred" : ""}`,
      dataset: { id: entry.id, subject: entry.subject },
    });
    const checkbox = el("input", { type: "checkbox", checked: state.selected.has(entry.id), "aria-label": "选择这道题" });
    checkbox.addEventListener("change", (event) => { event.stopPropagation(); toggleSelected(entry.id, checkbox.checked); });
    card.appendChild(el("label", { class: "entry-select" }, checkbox));
    const top = el("div", { class: "entry-top" },
      el("span", { class: `chip chip-subject-${entry.subject}`, text: SUBJECT_LABEL[entry.subject] }),
      el("span", { class: `chip chip-status-${entry.status}`, text: STATUS_LABEL[entry.status] }));
    if (["pending", "generating"].includes(entry.ai_status)) top.appendChild(el("span", { class: "compact-ai-status", text: "整理中…" }));
    if (["error", "unconfigured"].includes(entry.ai_status)) top.appendChild(el("button", { class: "text-btn compact-retry", type: "button", "data-action": "ai-retry", text: "处理失败 · 重试" }));
    top.appendChild(el("button", {
      class: `star-btn${entry.starred ? " on" : ""}`, type: "button", "data-action": "star",
      "aria-label": entry.starred ? "取消重点" : "标记为重点", title: entry.starred ? "取消重点" : "标记为重点",
    }, iconEl("star")));
    card.appendChild(top);
    const title = el("span", { class: "entry-title", text: entry.title || "图片题目" });
    renderMath(title);
    const images = (entry.attachments || []).filter(a => (a.kind || "problem") === "problem").length;
    const brief = [entry.chapter || (entry.tags || []).slice(0, 2).join("、") || "章节待整理"];
    if (images) brief.push(`${images} 张题图`);
    if (entry.manual_has_solution) brief.push("自带解析");
    else if (entry.has_solution) brief.push("有解答");
    const label = el("span", { class: "entry-toggle-label", text: "展开" });
    const button = el("button", {
      class: "entry-summary-button", type: "button", "aria-expanded": "false", "aria-controls": `entry-body-${entry.id}`,
    }, el("span", { class: "entry-summary-copy" }, title, el("span", { class: "entry-summary-line", text: brief.join(" · ") })),
      el("span", { class: "entry-toggle-mark" }, label, iconEl("arrow-right")));
    card.appendChild(el("h3", { class: "entry-compact-heading" }, button));
    const body = el("div", { class: "entry-card-body", id: `entry-body-${entry.id}`, hidden: true });
    card.appendChild(body);
    let built = false;
    function setExpanded(open, returnFocus = false) {
      if (open && !built) {
        const full = renderFullCard(entry);
        for (const child of Array.from(full.children)) {
          if (!child.matches(".entry-select, .entry-top, .entry-title")) body.appendChild(child);
        }
        const collapse = el("button", { class: "btn btn-ghost btn-sm entry-collapse-bottom", type: "button", text: "收起这道题",
          onclick: (event) => { event.stopPropagation(); setExpanded(false, true); } });
        body.appendChild(collapse);
        built = true;
      }
      if (open) state.expanded.add(entry.id); else state.expanded.delete(entry.id);
      body.hidden = !open;
      card.classList.toggle("is-expanded", open);
      button.setAttribute("aria-expanded", String(open));
      label.textContent = open ? "收起" : "展开";
      if (returnFocus) button.focus();
    }
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (state.selectMode) toggleSelected(entry.id); else setExpanded(!state.expanded.has(entry.id));
    });
    card.addEventListener("click", (event) => {
      if (event.target.closest("button, a, input, label, .entry-card-body") || window.getSelection()?.toString()) return;
      if (state.selectMode) toggleSelected(entry.id); else setExpanded(!state.expanded.has(entry.id));
    });
    if (state.expanded.has(entry.id)) setExpanded(true);
    return card;
  }

  function renderFullCard(entry) {
    const card = el("article", {
      class: `entry-card${state.selected.has(entry.id) ? " is-selected" : ""}${
        entry.starred ? " is-starred" : ""
      }`,
      dataset: { id: entry.id, subject: entry.subject },
    });

    // Selection checkbox
    const checkbox = el("input", {
      type: "checkbox",
      checked: state.selected.has(entry.id),
      "aria-label": "选择这道题",
    });
    checkbox.addEventListener("change", (event) => {
      event.stopPropagation();
      toggleSelected(entry.id, checkbox.checked);
    });
    card.appendChild(el("label", { class: "entry-select" }, checkbox));

    // Header
    const top = el("div", { class: "entry-top" });
    top.appendChild(
      el("span", {
        class: `chip chip-subject-${entry.subject}`,
        text: subjectLabel(entry.subject),
      })
    );
    top.appendChild(
      el("span", {
        class: `chip chip-status-${entry.status}`,
        text: STATUS_LABEL[entry.status] || entry.status,
      })
    );
    if (entry.error_type) {
      top.appendChild(el("span", { class: "chip chip-ghost", text: entry.error_type }));
    }
    top.appendChild(el("span", { class: "entry-time", text: formatTime(entry.created_at) }));
    const star = el(
      "button",
      {
        class: `star-btn${entry.starred ? " on" : ""}`,
        type: "button",
        "data-action": "star",
        "aria-label": entry.starred ? "取消重点" : "标记为重点",
        title: entry.starred ? "取消重点" : "标记为重点",
      },
      iconEl("star")
    );
    top.appendChild(star);
    card.appendChild(top);

    if (entry.has_solution && entry.solution && ["pending", "generating", "error", "unconfigured"].includes(entry.ai_status)) {
      const pending = ["pending", "generating"].includes(entry.ai_status);
      const notice = el("div", { class: pending ? "ai-pending" : "ai-error" },
        iconEl(pending ? "refresh" : "alert"),
        el("span", { text: pending ? (entry.manual_has_solution ? "正在识别题目并整理知识点…" : "正在自动解析并整理知识点…") : entry.ai_error || "自动处理暂未完成" }));
      if (!pending) notice.appendChild(el("button", { class: "text-btn", type: "button", "data-action": "ai-retry" }, "重试"));
      card.appendChild(notice);
    }

    // Title
    const title = el("h3", { class: "entry-title", text: entry.title || "未命名题目" });
    renderMath(title);
    title.addEventListener("click", (event) => {
      if (state.selectMode) return;
      event.stopPropagation();
      openDetail(entry.id);
    });
    card.appendChild(title);

    // Problem
    if (entry.problem) {
      const problem = el("div", { class: "entry-problem", text: entry.problem });
      card.appendChild(problem);
      renderMath(problem);
    }

    const problemImages = (entry.attachments || []).filter((a) => (a.kind || "problem") === "problem");
    if (problemImages.length) {
      card.appendChild(buildThumbs(problemImages));
    }

    // Solution
    if (entry.has_solution) {
      if (state.mode === "solutions") {
        card.appendChild(buildSolutionBlock(entry));
        if (
          !entry.solution &&
          (entry.ai_status === "pending" || entry.ai_status === "generating")
        ) {
          card.appendChild(
            el(
              "div",
              { class: "ai-pending" },
              el("span", { class: "ai-orbit" }),
              el("span", { text: entry.manual_has_solution ? "正在识别题目并整理知识点…" : "AI 正在补充完整解析…" })
            )
          );
        } else if (!entry.solution && entry.ai_status === "error") {
          card.appendChild(
            el(
              "div",
              { class: "ai-error" },
              iconEl("alert"),
              el("span", { text: entry.ai_error || "AI 生成失败" }),
              el(
                "button",
                { class: "text-btn", type: "button", "data-action": "ai-retry" },
                "重试"
              )
            )
          );
        }
      } else {
        card.appendChild(buildHiddenSolution(entry));
      }
    } else if (entry.ai_status === "pending" || entry.ai_status === "generating") {
      card.appendChild(
        el(
          "div",
          { class: "ai-pending" },
          el("span", { class: "ai-orbit" }),
          el("span", { text: "AI 正在读题并生成解答…" })
        )
      );
    } else if (entry.ai_status === "error") {
      card.appendChild(
        el(
          "div",
          { class: "ai-error" },
          iconEl("alert"),
          el("span", { text: entry.ai_error || "AI 生成失败" }),
          el(
            "button",
            { class: "text-btn", type: "button", "data-action": "ai-retry" },
            "重试"
          )
        )
      );
    } else if (entry.ai_status === "unconfigured") {
      card.appendChild(
        el(
          "div",
          { class: "ai-unconfigured" },
          iconEl("spark"),
          el("span", { text: "还没有配置 AI，暂时不能自动生成解答。" }),
          state.user && state.user.role === "admin"
            ? el("a", { href: "/admin", text: "去配置 →" })
            : el("span", { class: "settings-inline-note", text: "请联系管理员" }),
          el(
            "button",
            { class: "text-btn", type: "button", "data-action": "ai-retry" },
            "重试"
          )
        )
      );
    } else if (!entry.has_solution) {
      card.appendChild(
        el(
          "div",
          { class: "ai-unconfigured" },
          iconEl("spark"),
          el("span", { text: "这道题还没有解答。" }),
          el(
            "button",
            { class: "text-btn", type: "button", "data-action": "ai-retry" },
            "让 AI 生成 →"
          )
        )
      );
    }

    // Meta
    const meta = el("div", { class: "entry-meta" });
    if (entry.source) {
      meta.appendChild(
        el("span", { class: "meta-item" }, iconEl("book"), el("span", { text: entry.source }))
      );
    }
    if (entry.chapter) {
      meta.appendChild(
        el("span", { class: "meta-item" }, iconEl("tag"), el("span", { text: entry.chapter }))
      );
    }
    if (entry.source_detail) {
      meta.appendChild(el("span", { class: "meta-item", text: entry.source_detail }));
    }
    meta.appendChild(buildDifficulty(entry.difficulty));
    if (entry.review_count > 0) {
      meta.appendChild(
        el(
          "span",
          { class: "meta-item" },
          iconEl("refresh"),
          el("span", { text: `复习 ${entry.review_count} 次` })
        )
      );
    }
    if (entry.next_review_at && entry.status !== "mastered") {
      meta.appendChild(
        el(
          "span",
          { class: "meta-item" },
          iconEl("clock"),
          el("span", { text: nextReviewText(entry.next_review_at) })
        )
      );
    }
    card.appendChild(meta);

    if (entry.tags && entry.tags.length) {
      const tags = el("div", { class: "entry-tags" });
      for (const tag of entry.tags.slice(0, 8)) {
        tags.appendChild(el("span", { class: "entry-tag", text: tag }));
      }
      card.appendChild(tags);
    }

    // Actions
    const actions = el("div", { class: "entry-actions" });
    actions.appendChild(
      el(
        "button",
        {
          class: "action-btn",
          type: "button",
          "data-action": "detail",
        },
        iconEl("external"),
        el("span", { text: "详情" })
      )
    );
    actions.appendChild(
      el(
        "button",
        {
          class: "action-btn",
          type: "button",
          "data-action": "review",
        },
        iconEl("refresh"),
        el("span", { text: "复习" })
      )
    );
    actions.appendChild(
      el(
        "button",
        {
          class: "action-btn",
          type: "button",
          "data-action": "edit",
        },
        iconEl("edit"),
        el("span", { text: "编辑" })
      )
    );
    actions.appendChild(
      el(
        "button",
        {
          class: "action-btn",
          type: "button",
          "data-action": "ask",
        },
        iconEl("spark"),
        el("span", { text: "问 AI" })
      )
    );
    actions.appendChild(el("span", { class: "action-spacer" }));
    card.appendChild(actions);

    if (state.selectMode) {
      card.addEventListener("click", (event) => {
        if (event.target.closest("button, a, input, label")) return;
        toggleSelected(entry.id);
      });
    }

    return card;
  }

  function buildThumbs(attachments) {
    const wrap = el("div", { class: "attachments" });
    for (const item of attachments.slice(0, 8)) {
      const button = el(
        "button",
        {
          class: "attachment-thumb",
          type: "button",
          "aria-label": item.name || "查看图片",
          onclick: (event) => {
            event.stopPropagation();
            openLightbox(item.url);
          },
        },
        el("img", {
          src: item.thumb || item.url,
          alt: item.name || "题目图片",
          loading: "lazy",
        }),
        item.kind === "solution" ? el("span", { text: "解" }) : null
      );
      wrap.appendChild(button);
    }
    return wrap;
  }

  function buildSolutionBlock(entry) {
    const block = el("div", { class: "entry-solution" });
    block.appendChild(
      el(
        "div",
        { class: "solution-head" },
        iconEl("lightbulb"),
        el("span", { class: "solution-label", text: "解答" }),
        entry.solution_source === "ai" ? el("span", { class: "ai-tag", text: "AI" }) : null,
        entry.review_count > 0
          ? el("span", { text: ` · 已复习 ${entry.review_count} 次` })
          : null
      )
    );
    if (entry.answer) {
      const answer = el("span", { text: entry.answer });
      renderMath(answer, { answer: true });
      block.appendChild(
        el("div", { class: "solution-answer" }, el("b", { text: "ANSWER" }), answer)
      );
    }
    if (entry.solution) {
      const body = el("div", { class: "solution-body", text: entry.solution });
      block.appendChild(body);
      renderMath(body);
    }
    const solutionImages = (entry.attachments || []).filter((a) => a.kind === "solution");
    if (solutionImages.length) {
      block.appendChild(buildThumbs(solutionImages));
    }
    if (!entry.answer && !entry.solution && !solutionImages.length) {
      block.appendChild(el("div", { class: "solution-body", text: "这道题还没有填写解答。" }));
    }
    return block;
  }

  function buildHiddenSolution(entry) {
    const wrap = el("div", { class: "solution-hidden" });
    wrap.appendChild(el("span", { class: "lock-icon" }, iconEl("lock")));
    const text = el(
      "div",
      { class: "solution-hidden-text" },
      el("strong", { text: "练习模式：解答已收起" }),
      el("small", { text: "先在草稿纸上做一遍，再对答案。" })
    );
    wrap.appendChild(text);
    wrap.appendChild(
      el(
        "button",
        {
          class: "btn btn-ghost btn-sm",
          type: "button",
          "data-action": "reveal",
        },
        "对答案"
      )
    );
    return wrap;
  }

  function buildDifficulty(level) {
    const wrap = el("span", { class: "meta-item", title: `难度 ${level} / 5` });
    const dots = el("span", { class: "difficulty-dots" });
    for (let i = 1; i <= 5; i += 1) {
      dots.appendChild(el("i", { class: i <= level ? "on" : "" }));
    }
    wrap.appendChild(dots);
    return wrap;
  }

  function enhanceProblemClamps() {
    $$(".entry-problem").forEach((problem) => {
      if (problem.dataset.enhanced === "1") return;
      problem.dataset.enhanced = "1";
      if (problem.scrollHeight > problem.clientHeight + 6) {
        problem.classList.add("is-long");
        const button = el("button", {
          class: "text-btn expand-problem",
          type: "button",
          text: "展开全文",
        });
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          const expanded = problem.classList.toggle("is-expanded");
          button.textContent = expanded ? "收起" : "展开全文";
        });
        problem.parentElement.insertBefore(button, problem.nextSibling);
      }
    });
  }

  // ---------------------------------------------------------------------
  // Timeline event delegation
  // ---------------------------------------------------------------------

  function bindTimeline() {
    const timeline = $("#timeline");
    timeline.addEventListener("click", async (event) => {
      const card = event.target.closest(".entry-card");
      if (!card) return;
      const id = card.dataset.id;
      const actionEl = event.target.closest("[data-action]");
      if (!actionEl) return;
      const action = actionEl.dataset.action;
      if (action === "star") {
        event.stopPropagation();
        await toggleStar(id);
        return;
      }
      if (action === "reveal") {
        event.stopPropagation();
        actionEl.textContent = "载入中…";
        actionEl.disabled = true;
        try {
          const entry = await api(`/api/entries/${id}`);
          const block = buildSolutionBlock(entry);
          const hidden = card.querySelector(".solution-hidden");
          if (hidden) hidden.replaceWith(block);
          enhanceProblemClamps();
        } catch (err) {
          handleError(err);
          actionEl.textContent = "对答案";
          actionEl.disabled = false;
        }
        return;
      }
      if (action === "detail") {
        event.stopPropagation();
        openDetail(id);
        return;
      }
      if (action === "edit") {
        event.stopPropagation();
        openEditorById(id);
        return;
      }
      if (action === "review") {
        event.stopPropagation();
        startReviewFor(id);
        return;
      }
      if (action === "ai-retry") {
        event.stopPropagation();
        retryAi(id);
        return;
      }
      if (action === "ask") {
        event.stopPropagation();
        openDetail(id, { scrollChat: true });
      }
    });

    timeline.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const card = event.target.closest(".entry-card");
      if (!card || event.target.closest("button, a, input")) return;
      if (state.selectMode) {
        event.preventDefault();
        toggleSelected(card.dataset.id);
      }
    });
  }

  async function toggleStar(id) {
    const entry = state.entries.find((item) => item.id === id);
    if (!entry) return;
    const next = !entry.starred;
    try {
      await api(`/api/entries/${id}/star`, { method: "POST", body: { starred: next } });
      entry.starred = next;
      const card = $(`.entry-card[data-id="${id}"]`);
      if (card) {
        card.classList.toggle("is-starred", next);
        const button = card.querySelector(".star-btn");
        if (button) {
          button.classList.toggle("on", next);
          button.setAttribute("aria-label", next ? "取消重点" : "标记为重点");
          button.title = next ? "取消重点" : "标记为重点";
        }
      }
      if (state.detail && state.detail.id === id) {
        state.detail.starred = next;
        renderDetail(state.detail, { revealed: state.detailRevealed });
      }
      toast(next ? "已标记为重点" : "已取消重点", "success", 1800);
    } catch (err) {
      handleError(err);
    }
  }

  // ---------------------------------------------------------------------
  // Detail modal
  // ---------------------------------------------------------------------

  async function openDetail(id, options = {}) {
    const dialog = $("#detail-dialog");
    const content = $("#detail-content");
    content.innerHTML = '<div class="sheet-loading" style="padding:80px 20px;text-align:center;color:var(--muted)">正在载入…</div>';
    openDialog(dialog);
    try {
      const entry = await api(`/api/entries/${id}`);
      state.detail = entry;
      state.detailRevealed = Boolean(options.revealed || state.mode === "solutions");
      state.chat = { entryId: id, messages: [], loading: false, sending: false, loaded: false };
      renderDetail(entry, { revealed: state.detailRevealed });
      if (options.scrollChat) {
        window.setTimeout(openChatDialog, 220);
      }
    } catch (err) {
      handleError(err);
      closeDialog(dialog);
    }
  }

  function subjectLabel(subjectId) {
    const hit = (state.subjects || []).find((item) => item.id === subjectId);
    return hit ? hit.name : SUBJECT_LABEL[subjectId] || "数学";
  }

  function subjectKind(subjectId) {
    const hit = (state.subjects || []).find((item) => item.id === subjectId);
    return hit ? hit.kind || "math" : "math";
  }

  function buildV3Bar(entry) {
    const bar = el("div", {
      class: "detail-v3-bar",
      style: { display: "flex", gap: "8px", flexWrap: "wrap", margin: "10px 0 0" },
    });
    const mk = (key, label) =>
      el("button", { class: "btn btn-ghost btn-sm", type: "button", dataset: { v3: key } }, label);
    bar.appendChild(mk("explain", "🎓 我来讲解"));
    bar.appendChild(mk("grade", "📷 拍照批阅"));
    if (subjectKind(entry.subject) === "cpp") bar.appendChild(mk("code", "💻 在线写代码"));
    bar.addEventListener("click", async (event) => {
      const btn = event.target.closest("[data-v3]");
      if (!btn) return;
      event.preventDefault();
      const action = btn.dataset.v3;
      if (action === "explain") return window.open(`/explain/${entry.id}`, "_blank");
      if (action === "code") return window.open(`/code?entry=${entry.id}`, "_blank");
      if (action === "grade") {
        btn.disabled = true;
        try {
          await gradeEntryPhoto(entry, bar);
        } catch (err) {
          toast(err.message || "批阅失败", "error");
        } finally {
          btn.disabled = false;
        }
      }
    });
    return bar;
  }

  function compressImageFile(file, maxSide = 1500) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("读取图片失败"));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("图片格式不支持"));
        img.onload = () => {
          const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.86));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function gradeEntryPhoto(entry, bar) {
    const file = await new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.addEventListener("change", () => resolve(input.files[0] || null));
      input.click();
    });
    if (!file) return;
    toast("AI 正在批阅你的解题过程…", "info", 6000);
    const image = await compressImageFile(file);
    const data = await api("/api/v3/grade", { method: "POST", body: { entry_id: entry.id, image } });
    renderGradeCard(bar, data.grade);
  }

  function renderGradeCard(anchor, grade) {
    const host = anchor.parentElement || anchor;
    const old = host.querySelector(".v3-grade-card");
    if (old) old.remove();
    const card = el("div", { class: "v3-grade-card" });
    card.style.cssText =
      "margin:10px 0 0;padding:12px 14px;border-radius:12px;background:#f3f8ff;border:1px solid #d7e7fa";
    const head = el("div", { style: { display: "flex", alignItems: "baseline", gap: "10px" } });
    head.appendChild(el("strong", { text: `${grade.score} 分`, style: { fontSize: "20px", color: grade.score >= 80 ? "#2f9e6a" : grade.score >= 60 ? "#d08a2f" : "#cf5f4c" } }));
    head.appendChild(el("span", { text: grade.verdict || "" }));
    if (grade.error_type) head.appendChild(el("span", { text: `· ${grade.error_type}` }));
    card.appendChild(head);
    if (grade.error_step) card.appendChild(el("p", { text: `错在：${grade.error_step}`, style: { margin: "6px 0 0" } }));
    if (grade.detail) card.appendChild(el("p", { text: grade.detail, style: { margin: "6px 0 0", color: "#4a6a8a" } }));
    if (grade.correct_solution) {
      const sol = el("p", { text: grade.correct_solution, style: { margin: "6px 0 0", color: "#4a6a8a" } });
      card.appendChild(sol);
      renderMath(sol);
    }
    host.appendChild(card);
  }

  function renderDetail(entry, { revealed = false } = {}) {
    const content = $("#detail-content");
    clear(content);
    content.dataset.entryId = entry.id;
    const wrap = el("div", { class: "detail-content" });

    // Head
    const head = el("div", { class: "detail-head" });
    const headMain = el("div", { class: "detail-head-main" });
    const chips = el("div", { class: "detail-chips" });
    chips.appendChild(
      el("span", {
        class: `chip chip-subject-${entry.subject}`,
        text: subjectLabel(entry.subject),
      })
    );
    chips.appendChild(
      el("span", {
        class: `chip chip-status-${entry.status}`,
        text: STATUS_LABEL[entry.status] || entry.status,
      })
    );
    if (entry.starred) {
      chips.appendChild(el("span", { class: "chip chip-ghost", text: "重点" }));
    }
    headMain.appendChild(chips);
    const title = el("h2", { class: "detail-title", text: entry.title || "未命名题目" });
    renderMath(title);
    headMain.appendChild(title);
    const sub = el("div", { class: "detail-sub" });
    sub.appendChild(el("span", { text: `记录于 ${formatDateTime(entry.created_at)}` }));
    sub.appendChild(el("span", { text: `更新于 ${formatDateTime(entry.updated_at)}` }));
    if (entry.occurred_at) sub.appendChild(el("span", { text: `题目日期 ${formatDateFull(entry.occurred_at)}` }));
    headMain.appendChild(sub);
    head.appendChild(headMain);

    const headActions = el("div", { class: "detail-head-actions" });
    headActions.appendChild(
      el(
        "button",
        {
          class: `icon-btn${entry.starred ? " on" : ""}`,
          type: "button",
          title: entry.starred ? "取消重点" : "标记为重点",
          dataset: { detailAction: "star" },
        },
        iconEl("star")
      )
    );
    headActions.appendChild(
      el(
        "button",
        { class: "icon-btn", type: "button", title: "关闭", dataset: { detailAction: "close" } },
        iconEl("x")
      )
    );
    head.appendChild(headActions);
    wrap.appendChild(head);

    const aiBar = el("div", { class: "detail-ai-bar" });
    const chatLauncher = el(
      "button",
      { class: "ai-chat-launcher", type: "button" },
      el("span", { class: "ai-orb", text: "✦" }),
      el(
        "span",
        { class: "ai-chat-launcher-copy" },
        el("strong", { text: "直接问 AI" }),
        el("small", { text: "会带上这道题的原题与解答，继续追问" })
      ),
      el("span", { class: "ai-chat-launcher-arrow", text: "↗" })
    );
    chatLauncher.addEventListener("click", openChatDialog);
    aiBar.appendChild(chatLauncher);
    wrap.appendChild(aiBar);

    // v3 quick actions: explain it back, grade a photo of the written work.
    wrap.appendChild(buildV3Bar(entry));

    // Body
    const body = el("div", { class: "detail-body" });

    const problemSection = el("section", { class: "detail-section" });
    problemSection.appendChild(
      el(
        "div",
        { class: "detail-section-head" },
        iconEl("function"),
        el("span", { text: "ORIGINAL PROBLEM · 原题" })
      )
    );
    if (entry.problem) {
      const text = el("div", { class: "detail-text", text: entry.problem });
      problemSection.appendChild(text);
      renderMath(text);
    }
    const problemImages = (entry.attachments || []).filter((a) => (a.kind || "problem") === "problem");
    if (problemImages.length) {
      problemSection.appendChild(buildDetailGallery(problemImages));
      problemSection.appendChild(
        el(
          "button",
          {
            class: "btn btn-ghost btn-sm",
            type: "button",
            style: { marginTop: "9px" },
            dataset: { detailAction: "ocr" },
          },
          iconEl("spark"),
          el("span", { text: entry.ocr_text ? "重新识别图片文字" : "AI 识别图片文字" })
        )
      );
    }
    if (!entry.problem && !problemImages.length) {
      problemSection.appendChild(el("p", { class: "detail-text", text: "没有记录题目内容。" }));
    }
    body.appendChild(problemSection);

    if (entry.ocr_text && entry.ocr_text.trim() && entry.ocr_text.trim() !== (entry.problem || "").trim()) {
      const ocrSection = el("section", { class: "detail-section" });
      ocrSection.appendChild(
        el(
          "div",
          { class: "detail-section-head" },
          iconEl("image"),
          el("span", { text: "OCR · 图片识别文字" })
        )
      );
      const ocrText = el("div", { class: "detail-text", text: entry.ocr_text });
      ocrSection.appendChild(ocrText);
      renderMath(ocrText);
      body.appendChild(ocrSection);
    }

    // Solution
    const solutionSection = el("section", { class: "detail-section" });
    solutionSection.appendChild(
      el(
        "div",
        { class: "detail-section-head" },
        iconEl("lightbulb"),
        el("span", { text: "SOLUTION · 解答与答案" }),
        entry.solution_source === "ai" ? el("span", { class: "ai-tag", text: "AI" }) : null
      )
    );
    if (!entry.has_solution) {
      if (entry.ai_status === "pending" || entry.ai_status === "generating") {
        solutionSection.appendChild(
          el(
            "div",
            { class: "ai-pending" },
            el("span", { class: "ai-orbit" }),
            el("span", { text: "AI 正在读题并生成解答，完成后会自动出现。" })
          )
        );
      } else if (entry.ai_status === "error") {
        solutionSection.appendChild(
          el(
            "div",
            { class: "ai-error" },
            iconEl("alert"),
            el("span", { text: entry.ai_error || "AI 生成失败" }),
            el(
              "button",
              { class: "text-btn", type: "button", "data-detail-action": "ai-retry" },
              "重试"
            )
          )
        );
      } else if (entry.ai_status === "unconfigured") {
        solutionSection.appendChild(
          el(
            "div",
            { class: "ai-unconfigured" },
            iconEl("spark"),
            el("span", { text: "AI 尚未配置，不能自动生成解答。" }),
            state.user && state.user.role === "admin"
              ? el("a", { href: "/admin", text: "去管理页配置 →" })
              : el("span", { class: "settings-inline-note", text: "请联系管理员" }),
            el(
              "button",
              { class: "text-btn", type: "button", "data-detail-action": "ai-retry" },
              "重试"
            )
          )
        );
      } else {
        solutionSection.appendChild(
          el(
            "div",
            { class: "ai-unconfigured" },
            iconEl("spark"),
            el("span", { text: "还没有填写解答，可以让 AI 读题后生成。" }),
            el(
              "button",
              { class: "text-btn", type: "button", "data-detail-action": "ai-retry" },
              "让 AI 生成 →"
            )
          )
        );
      }
    } else if (!revealed) {
      solutionSection.appendChild(buildRevealPanel());
    } else {
      if (entry.answer) {
        const answer = el("span", { text: entry.answer });
        renderMath(answer, { answer: true });
        solutionSection.appendChild(
          el("div", { class: "answer-banner" }, el("b", { text: "ANSWER" }), answer)
        );
      }
      if (entry.solution) {
        const panel = el("div", {
          class: `solution-panel${entry.subject === "linear" ? " linear" : ""}`,
        });
        const text = el("div", { class: "detail-text", text: entry.solution });
        panel.appendChild(text);
        renderMath(text);
        solutionSection.appendChild(panel);
      }
      const solutionImages = (entry.attachments || []).filter((a) => a.kind === "solution");
      if (solutionImages.length) solutionSection.appendChild(buildDetailGallery(solutionImages));
      if (
        !entry.solution &&
        (entry.ai_status === "pending" || entry.ai_status === "generating")
      ) {
        solutionSection.appendChild(
          el(
            "div",
            { class: "ai-pending" },
            el("span", { class: "ai-orbit" }),
            el("span", { text: entry.manual_has_solution ? "正在识别题目并整理知识点，完成后会自动更新。" : "AI 正在补充完整解析，完成后会自动出现。" })
          )
        );
      } else if (!entry.solution && entry.ai_status === "error") {
        solutionSection.appendChild(
          el(
            "div",
            { class: "ai-error" },
            iconEl("alert"),
            el("span", { text: entry.ai_error || "AI 生成失败" }),
            el(
              "button",
              { class: "text-btn", type: "button", "data-detail-action": "ai-retry" },
              "重试"
            )
          )
        );
      }
    }
    body.appendChild(solutionSection);

    // Meta
    const infoSection = el("section", { class: "detail-section" });
    infoSection.appendChild(
      el(
        "div",
        { class: "detail-section-head" },
        iconEl("tag"),
        el("span", { text: "CONTEXT · 分类与出处" })
      )
    );
    const grid = el("dl", { class: "detail-info-grid" });
    const infoLines = [
      ["学科", SUBJECT_LABEL[entry.subject] || "—"],
      ["状态", STATUS_LABEL[entry.status] || "—"],
      ["章节", entry.chapter || "—"],
      ["来源", [entry.source, entry.source_detail].filter(Boolean).join(" · ") || "—"],
      ["错因", entry.error_type || "—"],
      ["难度", `${entry.difficulty} / 5`],
      ["复习次数", `${entry.review_count || 0} 次`],
      ["下次复习", entry.next_review_at ? nextReviewText(entry.next_review_at) : "未安排"],
    ];
    for (const [label, value] of infoLines) {
      grid.appendChild(
        el(
          "div",
          { class: "info-line" },
          el("dt", { text: label }),
          el("dd", { text: value })
        )
      );
    }
    infoSection.appendChild(grid);
    if (entry.tags && entry.tags.length) {
      const tags = el("div", { class: "detail-tags" });
      for (const tag of entry.tags) tags.appendChild(el("span", { class: "detail-tag", text: tag }));
      infoSection.appendChild(tags);
    }
    body.appendChild(infoSection);

    // Review history
    const historySection = el("section", { class: "detail-section" });
    historySection.appendChild(
      el(
        "div",
        { class: "detail-section-head" },
        iconEl("clock"),
        el("span", { text: "复习记录" })
      )
    );
    const reviews = entry.reviews || [];
    if (!reviews.length) {
      historySection.appendChild(
        el("p", { class: "detail-text", text: "还没有复习记录。点击下方「复习」，开始第一次。" })
      );
    } else {
      const list = el("ul", { class: "review-history" });
      for (const review of reviews) {
        const meta = RESULT_META[review.result] || { label: review.result };
        list.appendChild(
          el(
            "li",
            null,
            el(
              "div",
              { class: "rh-head" },
              el("span", { class: "rh-result", text: meta.label }),
              el("span", { class: "rh-date", text: formatDateTime(review.reviewed_at) }),
              el("span", { class: "rh-date", text: `${review.interval_days} 天后` })
            ),
            review.note ? el("div", { class: "rh-note", text: review.note }) : null
          )
        );
      }
      historySection.appendChild(list);
    }
    body.appendChild(historySection);
    wrap.appendChild(body);

    // Footer
    const foot = el("div", { class: "detail-foot" });
    const statusMenu = el("div", { class: "status-menu" });
    for (const status of STATUS_ORDER) {
      statusMenu.appendChild(
        el("button", {
          type: "button",
          class: status === entry.status ? "active" : "",
          dataset: { detailStatus: status },
          text: STATUS_LABEL[status],
        })
      );
    }
    foot.appendChild(statusMenu);
    foot.appendChild(el("span", { class: "spacer" }));
    foot.appendChild(
      el(
        "button",
        { class: "btn btn-ghost btn-sm", type: "button", dataset: { detailAction: "edit" } },
        iconEl("edit"),
        el("span", { text: "编辑" })
      )
    );
    foot.appendChild(
      el(
        "button",
        { class: "btn btn-ghost btn-sm", type: "button", dataset: { detailAction: "delete" } },
        iconEl("trash"),
        el("span", { text: "删除" })
      )
    );
    foot.appendChild(
      el(
        "button",
        { class: "btn btn-primary btn-sm", type: "button", dataset: { detailAction: "review" } },
        iconEl("refresh"),
        el("span", { text: "复习" })
      )
    );
    wrap.appendChild(foot);
    content.appendChild(wrap);
  }

  function openChatDialog() {
    if (!state.detail) return;
    const dialog = $("#ai-chat-dialog");
    if (!dialog) return;
    setText($("#ai-chat-context"), state.detail.title || "继续追问这道题");
    openDialog(dialog);
    loadChatIfNeeded(state.detail.id);
    window.setTimeout(() => {
      const input = $("#ai-input");
      if (input) input.focus();
    }, 160);
  }

  function closeChatDialog() {
    const dialog = $("#ai-chat-dialog");
    if (dialog && dialog.open) closeDialog(dialog);
  }

  function renderChatThread() {
    const thread = $("#ai-thread");
    if (!thread) return;
    const chat = state.chat;
    clear(thread);
    if (chat.loading) {
      thread.appendChild(el("div", { class: "ai-empty", text: "正在载入对话…" }));
      return;
    }
    if (!chat.messages.length) {
      thread.appendChild(
        el("div", {
          class: "ai-empty",
          text: "还没有对话。问一个卡住的步骤，或者让它换一种讲法。",
        })
      );
    } else {
      for (const message of chat.messages) {
        const row = el("div", { class: `ai-msg ${message.role}` });
        row.appendChild(
          el("span", {
            class: "ai-avatar",
            text: message.role === "assistant" ? "AI" : "你",
          })
        );
        const bubble = el("div", { class: "ai-bubble", text: message.content });
        renderMath(bubble);
        row.appendChild(bubble);
        thread.appendChild(row);
      }
    }
    if (chat.sending) {
      thread.appendChild(
        el(
          "div",
          { class: "ai-typing" },
          el("i"),
          el("i"),
          el("i"),
          el("span", { text: "AI 正在思考…" })
        )
      );
    }
    thread.scrollTop = thread.scrollHeight;
  }

  async function loadChatIfNeeded(entryId) {
    if (state.chat.entryId !== entryId) {
      state.chat = { entryId, messages: [], loading: false, sending: false, loaded: false };
    }
    if (state.chat.loaded) {
      renderChatThread();
      return;
    }
    if (state.chat.loading) {
      renderChatThread();
      return;
    }
    state.chat.loading = true;
    renderChatThread();
    try {
      const data = await api(`/api/entries/${entryId}/ai/chat`);
      if (state.chat.entryId !== entryId) return;
      state.chat.messages = data.messages || [];
      state.chat.loading = false;
      state.chat.loaded = true;
      renderChatThread();
    } catch (err) {
      state.chat.loading = false;
      state.chat.loaded = true;
      renderChatThread();
      if (err.status && err.status !== 401) handleError(err);
    }
  }

  async function sendChat() {
    const input = $("#ai-input");
    if (!input || !state.detail) return;
    const message = input.value.trim();
    if (!message) return;
    if (state.chat.sending) return;
    const entryId = state.detail.id;
    // Do not let the background chat-history load overwrite an optimistic
    // user message while the first request is still in flight.
    while (state.chat.entryId === entryId && state.chat.loading) {
      await new Promise((resolve) => window.setTimeout(resolve, 80));
    }
    if (state.chat.entryId !== entryId) return;
    if (!state.chat.loaded) await loadChatIfNeeded(entryId);
    if (!state.chat.loaded) return;
    state.chat.sending = true;
    state.chat.messages.push({ role: "user", content: message });
    input.value = "";
    renderChatThread();
    try {
      const data = await api(`/api/entries/${entryId}/ai/chat`, {
        method: "POST",
        body: { message },
      });
      if (state.chat.entryId !== entryId) return;
      // The server stores the user message too; replace the optimistic copy
      // with the canonical pair when possible.
      const lastUser = state.chat.messages[state.chat.messages.length - 1];
      if (lastUser && lastUser.role === "user") {
        lastUser.id = data.user && data.user.id;
        lastUser.content = (data.user && data.user.content) || message;
      }
      state.chat.messages.push({
        id: data.assistant && data.assistant.id,
        role: "assistant",
        content: data.assistant.content,
      });
      state.chat.sending = false;
      state.chat.loaded = true;
      renderChatThread();
    } catch (err) {
      state.chat.sending = false;
      renderChatThread();
      handleError(err);
    }
  }

  async function clearChat() {
    if (!state.detail) return;
    const ok = await confirmAction({
      title: "清空这道题的 AI 对话？",
      message: "只删除对话记录，不会删除题目和解析。",
      okText: "清空",
    });
    if (!ok) return;
    try {
      await api(`/api/entries/${state.detail.id}/ai/chat`, { method: "DELETE" });
      state.chat.messages = [];
      state.chat.loaded = true;
      renderChatThread();
      toast("对话已清空", "success", 1800);
    } catch (err) {
      handleError(err);
    }
  }

  function buildRevealPanel() {
    const panel = el("div", { class: "reveal-panel" });
    panel.appendChild(el("span", { class: "lock-icon" }, iconEl("lock")));
    panel.appendChild(
      el(
        "div",
        null,
        el("strong", { text: "解答已收起" }),
        el("small", { text: "先自己写一遍，再展开对照。" })
      )
    );
    panel.appendChild(
      el(
        "button",
        { class: "btn btn-ghost btn-sm", type: "button", dataset: { detailAction: "reveal" } },
        iconEl("eye"),
        el("span", { text: "展开解答" })
      )
    );
    return panel;
  }

  function buildDetailGallery(attachments) {
    const gallery = el("div", { class: "detail-gallery" });
    for (const item of attachments) {
      gallery.appendChild(
        el(
          "button",
          {
            type: "button",
            "aria-label": item.name || "查看图片",
            onclick: () => openLightbox(item.url),
          },
          el("img", { src: item.thumb || item.url, alt: item.name || "题目图片", loading: "lazy" })
        )
      );
    }
    return gallery;
  }

  function bindChat() {
    const dialog = $("#ai-chat-dialog");
    if (!dialog) return;
    $("#ai-send")?.addEventListener("click", sendChat);
    $("#ai-chat-clear")?.addEventListener("click", clearChat);
    $$("[data-close-chat]").forEach((button) =>
      button.addEventListener("click", closeChatDialog)
    );
    const input = $("#ai-input");
    input?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        sendChat();
      }
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) closeChatDialog();
    });
    const detailDialog = $("#detail-dialog");
    detailDialog?.addEventListener("close", () => {
      if (dialog.open) closeChatDialog();
    });
  }

  function bindDetail() {
    const dialog = $("#detail-dialog");
    dialog.addEventListener("click", async (event) => {
      if (event.target === dialog) {
        closeDialog(dialog);
        return;
      }
      const actionEl = event.target.closest("[data-detail-action]");
      const statusEl = event.target.closest("[data-detail-status]");
      if (statusEl && state.detail) {
        event.preventDefault();
        await changeStatus(state.detail.id, statusEl.dataset.detailStatus);
        return;
      }
      if (!actionEl || !state.detail) return;
      const action = actionEl.dataset.detailAction;
      if (action === "close") closeDialog(dialog);
      else if (action === "edit") {
        const id = state.detail.id;
        closeDialog(dialog);
        openEditorById(id);
      } else if (action === "delete") {
        const id = state.detail.id;
        const title = state.detail.title;
        closeDialog(dialog);
        const ok = await confirmAction({
          title: "删除这道题？",
          message: `「${title}」及其解答、复习记录和图片都会删除，无法恢复。\n建议先导出 JSON 备份。`,
          okText: "删除",
        });
        if (!ok) return;
        try {
          await api(`/api/entries/${id}`, { method: "DELETE" });
          state.entries = state.entries.filter((item) => item.id !== id);
          state.selected.delete(id);
          renderTimeline();
          updateCounts();
          refreshStats();
          toast("题目已删除", "success");
        } catch (err) {
          handleError(err);
        }
      } else if (action === "review") {
        const id = state.detail.id;
        closeDialog(dialog);
        startReviewFor(id);
      } else if (action === "reveal") {
        state.detailRevealed = true;
        renderDetail(state.detail, { revealed: true });
      } else if (action === "star") {
        await toggleStar(state.detail.id);
      } else if (action === "ai-retry") {
        retryAi(state.detail.id);
      } else if (action === "ocr") {
        const label = actionEl.querySelector("span");
        const old = label ? label.textContent : "";
        actionEl.disabled = true;
        if (label) label.textContent = "识别中…";
        try {
          const data = await api(`/api/entries/${state.detail.id}/ai/ocr`, {
            method: "POST",
            body: {},
          });
          state.detail = data.entry;
          const listEntry = state.entries.find((item) => item.id === state.detail.id);
          if (listEntry) Object.assign(listEntry, data.entry);
          renderDetail(state.detail, { revealed: state.detailRevealed });
          renderTimeline();
          toast("图片文字已识别并保存", "success");
        } catch (err) {
          handleError(err);
          actionEl.disabled = false;
          if (label) label.textContent = old;
        }
      }
    });
  }

  async function changeStatus(id, status) {
    try {
      await api(`/api/entries/${id}/status`, { method: "POST", body: { status } });
      const entry = state.entries.find((item) => item.id === id);
      if (entry) entry.status = status;
      if (state.detail && state.detail.id === id) {
        state.detail.status = status;
        renderDetail(state.detail, { revealed: state.detailRevealed });
      }
      renderTimeline();
      refreshStats();
      toast(`状态已改为「${STATUS_LABEL[status]}」`, "success", 1800);
    } catch (err) {
      handleError(err);
    }
  }

  function openLightbox(url) {
    const dialog = $("#lightbox-dialog");
    const img = $("#lightbox-image");
    img.src = url;
    openDialog(dialog);
  }

  // ---------------------------------------------------------------------
  // Editor
  // ---------------------------------------------------------------------

  async function openEditorById(id) {
    try {
      const entry = await api(`/api/entries/${id}`);
      openEditor(entry);
    } catch (err) {
      handleError(err);
    }
  }

  function openEditor(entry = null) {
    const dialog = $("#editor-dialog");
    const form = $("#entry-form");
    for (const item of Object.values(state.editor?.attachments || {}).flat()) {
      if (item.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(item.previewUrl);
    }
    form.reset();
    clearMathPreviews();
    state.editor = {
      originalId: entry ? entry.id : null,
      subject: entry ? entry.subject : state.filters.subject !== "all" ? state.filters.subject : "analysis",
      status: entry ? entry.status : state.filters.status !== "all" ? state.filters.status : "unsolved",
      difficulty: entry ? entry.difficulty : 3,
      attachments: { problem: [], solution: [] },
      previews: { problem: false, solution: false },
      ocrText: entry ? entry.ocr_text || "" : "",
      saving: false,
      dirty: false,
    };

    setText($("#editor-eyebrow"), entry ? "修改记录" : "录入题目");
    setText($("#editor-title"), entry ? "编辑题目" : "记录一道题");
    setText($("#save-entry").querySelector("span"), entry ? "保存修改" : "保存题目");

    const manualSolution = entry
      ? entry.manual_solution ||
        (entry.solution_source === "manual" ? entry.solution || "" : "")
      : "";
    $("#f-problem").value = entry ? entry.problem || "" : "";
    $("#f-solution").value = manualSolution;
    $("#f-starred").checked = Boolean(entry && entry.starred);
    state.editor.occurred = entry ? entry.occurred_at : todayISO();

    const attachments = entry && entry.attachments ? entry.attachments : [];
    state.editor.attachments.problem = attachments
      .filter((item) => (item.kind || "problem") === "problem")
      .map((item) => ({ ...item, kind: "problem" }));
    state.editor.attachments.solution = attachments
      .filter((item) => item.kind === "solution")
      .map((item) => ({ ...item, kind: "solution" }));

    const hasSolution = Boolean(
      entry &&
        (manualSolution.trim() ||
          (entry.attachments || []).some((item) => item.kind === "solution"))
    );
    $("#f-has-solution").checked = hasSolution;
    toggleSolutionFields(hasSolution);

    setChips("subject-chips", state.editor.subject);
    setChips("status-chips", state.editor.status);
    setDifficulty(state.editor.difficulty);
    renderAttachments("problem");
    renderAttachments("solution");
    hideDraftNote();

    if (!entry) {
      const draft = readDraft();
      if (draft) restoreDraft(draft);
    }

    openDialog(dialog);
    if (!window.matchMedia("(pointer: coarse), (max-width: 760px)").matches) window.setTimeout(() => {
      if (!entry && !$("#f-problem").value) $("#f-problem").focus();
      else $("#f-problem").focus();
    }, 120);
  }

  function toggleSolutionFields(show) {
    const fields = $("#solution-fields");
    if (fields) fields.hidden = !show;
    if (!show) {
      const badge = $("#f-has-solution");
      if (badge) badge.checked = false;
    }
  }

  function setChips(containerId, value) {
    $$(`#${containerId} .choice-chip`).forEach((button) => {
      button.classList.toggle("active", button.dataset.value === value);
    });
  }

  function setDifficulty(level) {
    if (!state.editor) return;
    state.editor.difficulty = level;
    $$("#difficulty-picker button").forEach((button) => {
      button.classList.toggle("active", Number(button.dataset.value) === Number(level));
    });
  }

  function bindEditor() {
    const dialog = $("#editor-dialog");
    const form = $("#entry-form");

    $("#subject-chips").addEventListener("click", (event) => {
      const button = event.target.closest(".choice-chip");
      if (!button || !state.editor) return;
      state.editor.subject = button.dataset.value;
      setChips("subject-chips", state.editor.subject);
      markDirty();
    });

    $("#status-chips").addEventListener("click", (event) => {
      const button = event.target.closest(".choice-chip");
      if (!button || !state.editor) return;
      state.editor.status = button.dataset.value;
      setChips("status-chips", state.editor.status);
      markDirty();
    });

    $("#f-has-solution").addEventListener("change", (event) => {
      toggleSolutionFields(event.target.checked);
      markDirty();
    });

    $("#difficulty-picker").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-value]");
      if (!button) return;
      setDifficulty(Number(button.dataset.value));
      markDirty();
    });

    form.addEventListener("input", (event) => {
      markDirty();
      const target = event.target;
      if (target.id === "f-problem" && state.editor && state.editor.previews.problem) {
        schedulePreview("problem");
      }
      if (target.id === "f-solution" && state.editor && state.editor.previews.solution) {
        schedulePreview("solution");
      }
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      saveEditor();
    });

    $$(".preview-toggle").forEach((button) => {
      button.addEventListener("click", () => togglePreview(button.dataset.preview));
    });
    $("#editor-preview-all").addEventListener("click", () => {
      if (!state.editor) return;
      const anyHidden = !state.editor.previews.problem || !state.editor.previews.solution;
      if (anyHidden) {
        showPreview("problem");
        showPreview("solution");
      } else {
        hidePreview("problem");
        hidePreview("solution");
      }
    });

    $$(".math-toolbar button").forEach((button) => {
      button.addEventListener("click", () => {
        const toolbar = button.closest(".math-toolbar");
        const targetId = toolbar.dataset.toolbar === "problem" ? "f-problem" : "f-solution";
        insertMath($(`#${targetId}`), button);
      });
    });

    $("#ocr-problem-btn").addEventListener("click", async () => {
      if (!state.editor) return;
      const images = state.editor.attachments.problem.filter((item) => !item.loading);
      if (!images.length) {
        toast("先在「原题」下方添加题目图片", "info");
        return;
      }
      const button = $("#ocr-problem-btn");
      const label = button.querySelector("span");
      button.disabled = true;
      label.textContent = "识别中…";
      try {
        const payload = images.map((item) => ({
          data: item.data || undefined,
          url: item.url || undefined,
          name: item.name || "题目图片",
          kind: "problem",
        }));
        const data = await api("/api/ai/ocr", {
          method: "POST",
          body: { attachments: payload },
        });
        state.editor.ocrText = data.text || "";
        const field = $("#f-problem");
        if (!field.value.trim()) {
          field.value = state.editor.ocrText;
          toast("图片文字已识别并填入题目", "success");
        } else {
          toast("文字已识别并保存为 OCR 结果；题干已有内容，未覆盖", "success", 4200);
        }
        if (state.editor.previews.problem) showPreview("problem", false);
        markDirty();
      } catch (err) {
        handleError(err);
      } finally {
        button.disabled = false;
      label.textContent = "立即识别图片";
      }
    });

    // Dropzones
    for (const kind of ["problem", "solution"]) {
      const zone = $(`#dz-${kind}`);
      const input = zone.querySelector('input[type="file"]');
      zone.addEventListener("click", (event) => {
        if (event.target.closest("button, .dz-thumb")) return;
        input.click();
      });
      zone.addEventListener("keydown", (event) => {
        if (event.target !== zone) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          input.click();
        }
      });
      input.addEventListener("change", () => {
        addFiles(input.files, kind);
        input.value = "";
      });
      zone.addEventListener("dragover", (event) => {
        event.preventDefault();
        zone.classList.add("is-dragover");
      });
      zone.addEventListener("dragleave", () => zone.classList.remove("is-dragover"));
      zone.addEventListener("drop", (event) => {
        event.preventDefault();
        zone.classList.remove("is-dragover");
        if (event.dataTransfer && event.dataTransfer.files.length) {
          addFiles(event.dataTransfer.files, kind);
        }
      });
      zone.addEventListener("focusin", () => {
        state.lastImageKind = kind;
      });
    }

    $("#f-solution").addEventListener("focus", () => {
      state.lastImageKind = "solution";
    });
    $("#f-problem").addEventListener("focus", () => {
      state.lastImageKind = "problem";
    });

    document.addEventListener("paste", (event) => {
      if (!dialog.open || state.imageEditing) return;
      const files = Array.from(event.clipboardData ? event.clipboardData.files : []).filter((file) =>
        file.type.startsWith("image/")
      );
      if (!files.length) return;
      event.preventDefault();
      const kind = document.activeElement === $("#f-solution") ? "solution" : state.lastImageKind;
      addFiles(files, kind);
    });

    document.addEventListener("keydown", (event) => {
      if (!dialog.open || state.imageEditing) return;
      if ((event.ctrlKey || event.metaKey) && (event.key === "Enter" || event.key === "s")) {
        event.preventDefault();
        saveEditor();
      }
    });
  }

  // ---------------------------------------------------------------------
  // Announcements
  // ---------------------------------------------------------------------

  function announcementSeen(key, version) {
    try {
      return window.localStorage.getItem(key) === String(version || "");
    } catch (err) {
      return false;
    }
  }

  function markAnnouncementSeen(key, version) {
    try {
      window.localStorage.setItem(key, String(version || ""));
    } catch (err) {
      // Private mode or blocked storage: still allow the announcement to close.
    }
  }

  async function loadAnnouncement() {
    let data;
    try {
      data = await api("/api/announcement");
    } catch (err) {
      return;
    }
    const version = data.version || "0";
    state.announcementVersion = version;
    const banner = data.banner;
    const bannerNode = $("#site-announcement");
    if (bannerNode) {
      if (banner && banner.text && !announcementSeen(ANNOUNCEMENT_BANNER_KEY, version)) {
        setText($("#site-announcement-text"), banner.text);
        bannerNode.hidden = false;
      } else {
        bannerNode.hidden = true;
      }
    }
    const popup = data.popup;
    if (
      popup &&
      (popup.title || popup.body) &&
      !announcementSeen(ANNOUNCEMENT_POPUP_KEY, version) &&
      !document.querySelector("dialog[open]")
    ) {
      setText($("#announcement-dialog-title"), popup.title || "公告");
      setText($("#announcement-dialog-body"), popup.body || "");
      const dialog = $("#announcement-dialog");
      if (dialog) {
        openDialog(dialog);
        window.setTimeout(() => {
          if (dialog.open && !announcementSeen(ANNOUNCEMENT_POPUP_KEY, version)) {
            markAnnouncementSeen(ANNOUNCEMENT_POPUP_KEY, version);
          }
        }, 1000);
      }
    }
  }

  function bindAnnouncement() {
    $("#announcement-dismiss")?.addEventListener("click", () => {
      const node = $("#site-announcement");
      if (node) node.hidden = true;
      const version = state.announcementVersion || "0";
      markAnnouncementSeen(ANNOUNCEMENT_BANNER_KEY, version);
    });
    const dialog = $("#announcement-dialog");
    if (!dialog) return;
    const close = () => {
      if (dialog.open) closeDialog(dialog);
    };
    $("#announcement-dialog-close")?.addEventListener("click", close);
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) close();
    });
    dialog.addEventListener("close", () => {
      markAnnouncementSeen(ANNOUNCEMENT_POPUP_KEY, state.announcementVersion || "0");
    });
  }

  function markDirty() {
    if (!state.editor) return;
    state.editor.dirty = true;
    setText($("#save-hint"), "未保存");
    scheduleDraft();
  }

  function scheduleDraft() {
    if (!state.editor || state.editor.originalId) return;
    window.clearTimeout(state.draftsTimer);
    state.draftsTimer = window.setTimeout(saveDraft, 700);
  }

  function saveDraft() {
    if (!state.editor || state.editor.originalId || state.editor.saving || !state.editor.dirty) return;
    const draft = {
      savedAt: Date.now(),
      subject: state.editor.subject,
      status: state.editor.status,
      difficulty: state.editor.difficulty,
      starred: $("#f-starred").checked,
      hasSolution: $("#f-has-solution").checked,
      ocrText: state.editor.ocrText || "",
      problem: $("#f-problem").value,
      solution: $("#f-solution").value,
    };
    try {
      localStorage.setItem(draftKey(), JSON.stringify(draft));
      showDraftNote("文字草稿已保存，图片需另行保存");
    } catch (err) {
      // Storage may be full; drafts are optional.
    }
  }

  function readDraft() {
    try {
      const raw = localStorage.getItem(draftKey());
      if (!raw) return null;
      const draft = JSON.parse(raw);
      if (!draft || Date.now() - Number(draft.savedAt || 0) > 7 * 86400000) {
        localStorage.removeItem(draftKey());
        return null;
      }
      return draft;
    } catch (err) {
      return null;
    }
  }

  function restoreDraft(draft) {
    if (!state.editor || state.editor.originalId) return;
    state.editor.subject = SUBJECT_LABEL[draft.subject] ? draft.subject : state.editor.subject;
    state.editor.status = draft.status || state.editor.status;
    state.editor.difficulty = Number(draft.difficulty) || 3;
    setChips("subject-chips", state.editor.subject);
    setChips("status-chips", state.editor.status);
    setDifficulty(state.editor.difficulty);
    state.editor.ocrText = draft.ocrText || "";
    $("#f-problem").value = draft.problem || "";
    $("#f-solution").value = draft.solution || "";
    $("#f-starred").checked = Boolean(draft.starred);
    $("#f-has-solution").checked = Boolean(draft.hasSolution);
    toggleSolutionFields(Boolean(draft.hasSolution));
    state.editor.dirty = true;
    showDraftNote("已恢复文字草稿；图片请重新添加");
  }

  function showDraftNote(message) {
    const note = $("#draft-note");
    note.hidden = false;
    setText(note.querySelector("span"), message);
    if (!note.querySelector(".draft-clear")) {
      const clearButton = el("button", {
        class: "text-btn tiny draft-clear",
        type: "button",
        text: "清除",
        style: { marginLeft: "4px" },
      });
      clearButton.addEventListener("click", () => {
        clearDraft();
        toast("草稿已清除", "success", 1600);
      });
      note.appendChild(clearButton);
    }
  }

  function hideDraftNote() {
    $("#draft-note").hidden = true;
  }

  function clearDraft() {
    window.clearTimeout(state.draftsTimer);
    if (state.editor) state.editor.dirty = false;
    localStorage.removeItem(draftKey());
    hideDraftNote();
  }

  function addFiles(fileList, kind) {
    if (!state.editor) return;
    const files = Array.from(fileList || []).filter((file) => file.type.startsWith("image/"));
    if (!files.length) {
      toast("请选择图片文件", "error");
      return;
    }
    const editor = state.editor;
    const total = state.editor.attachments.problem.length + state.editor.attachments.solution.length;
    const room = MAX_ATTACHMENTS - total;
    if (room <= 0) {
      toast(`每道题最多 ${MAX_ATTACHMENTS} 张图片`, "error");
      return;
    }
    for (const file of files.slice(0, room)) {
      const placeholder = {
        id: `new-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: file.name || "粘贴的图片",
        kind,
        loading: true,
        previewUrl: "",
        data: "",
      };
      state.editor.attachments[kind].push(placeholder);
      renderAttachments(kind);
      prepareImage(file)
        .then((prepared) => {
          if (state.editor !== editor || !editor.attachments[kind].includes(placeholder)) {
            if (prepared.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(prepared.previewUrl);
            return;
          }
          Object.assign(placeholder, prepared, { loading: false, kind });
          renderAttachments(kind);
          markDirty();
        })
        .catch((err) => {
          if (state.editor !== editor) return;
          const list = state.editor.attachments[kind];
          const index = list.indexOf(placeholder);
          if (index >= 0) list.splice(index, 1);
          renderAttachments(kind);
          toast(err.message || "图片处理失败", "error");
        });
    }
    if (files.length > room) toast(`只添加了前 ${room} 张，已达上限`, "info");
  }

  async function prepareImage(file, options = {}) {
    if (!file.type.startsWith("image/")) throw new Error("不是图片文件");
    if (file.size > 12 * 1024 * 1024) throw new Error("单张图片不能超过 12MB");
    const original = await readFileAsDataURL(file);
    try {
      const img = await loadImage(original);
      const maxSide = Number(options.maxSide) || 2200;
      const quality = Number(options.quality) || 0.9;
      let width = img.naturalWidth || img.width;
      let height = img.naturalHeight || img.height;
      if (!width || !height) throw new Error("无法读取图片尺寸");
      const scale = Math.min(1, maxSide / Math.max(width, height));
      width = Math.round(width * scale);
      height = Math.round(height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      let blob = await canvasToBlob(canvas, "image/webp", quality);
      if (!blob) blob = await canvasToBlob(canvas, "image/jpeg", quality);
      if (!blob) throw new Error("图片压缩失败");
      const data = await readBlobAsDataURL(blob);
      return {
        name: (file.name || "题目图片").replace(/\.[^.]+$/, "") + ".webp",
        data,
        previewUrl: URL.createObjectURL(blob),
        w: width,
        h: height,
        size: blob.size,
      };
    } catch (err) {
      // Browser cannot decode (e.g. HEIC): let the server try.
      if (original.length > 18 * 1024 * 1024) throw new Error("图片过大，请压缩后重试");
      return {
        name: file.name || "题目图片",
        data: original,
        previewUrl: original,
        w: 0,
        h: 0,
        size: file.size,
      };
    }
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("读取图片失败"));
      reader.readAsDataURL(file);
    });
  }

  function readBlobAsDataURL(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("读取图片失败"));
      reader.readAsDataURL(blob);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("图片解码失败"));
      img.src = src;
    });
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => {
      if (!canvas.toBlob) return resolve(null);
      canvas.toBlob((blob) => resolve(blob), type, quality);
    });
  }

  async function openAttachmentEditor(item, kind) {
    const editor = state.editor;
    if (!editor || editor.saving || item.loading || state.imageEditing) return;
    state.imageEditing = true;
    try {
      const result = await window.MathImageEditor.open({
        src: item.data || item.url || item.previewUrl,
        name: item.name,
        show: openDialog, close: closeDialog,
        isCurrent: () => state.editor === editor && $("#editor-dialog").open,
      });
      if (!result) return;
      if (state.editor !== editor || !editor.attachments[kind].includes(item)) {
        URL.revokeObjectURL(result.previewUrl);
        return;
      }
      if (item.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(item.previewUrl);
      Object.assign(item, result);
      if (kind === "problem") editor.ocrText = "";
      renderAttachments(kind);
      markDirty();
      toast("图片已调整，保存题目后生效", "success", 2200);
    } catch (err) {
      handleError(err);
    } finally {
      state.imageEditing = false;
    }
  }

  function renderAttachments(kind) {
    if (!state.editor) return;
    const zone = $(`#dz-${kind}`);
    const thumbs = zone.querySelector(".dz-thumbs");
    clear(thumbs);
    const list = state.editor.attachments[kind];
    for (const item of list) {
      const thumb = el("div", { class: `dz-thumb${item.loading ? " is-loading" : ""}` });
      const edit = el("button", {
        class: "dz-edit", type: "button", disabled: Boolean(item.loading),
        "aria-label": `裁剪或旋转${kind === "problem" ? "题目" : "解析"}图片：${item.name || "图片"}`,
        onclick: (event) => { event.stopPropagation(); openAttachmentEditor(item, kind); },
      });
      if (item.previewUrl || item.thumb || item.url) {
        edit.appendChild(
          el("img", {
            src: item.previewUrl || item.thumb || item.url,
            alt: item.name || "图片",
          })
        );
      }
      edit.appendChild(el("span", { class: "dz-edit-label", text: "裁剪 / 旋转" }));
      thumb.appendChild(edit);
      const remove = el(
        "button",
        {
          class: "dz-remove",
          type: "button",
          "aria-label": "移除图片",
          onclick: (event) => {
            event.stopPropagation();
            const index = list.indexOf(item);
            if (index >= 0) list.splice(index, 1);
            if (item.previewUrl && item.previewUrl.startsWith("blob:")) URL.revokeObjectURL(item.previewUrl);
            renderAttachments(kind);
            markDirty();
          },
        },
        iconEl("x")
      );
      thumb.appendChild(remove);
      thumb.appendChild(el("span", { class: "dz-name", text: item.name || "图片" }));
      thumbs.appendChild(thumb);
    }
    const editor = state.editor;
    const total = state.editor.attachments.problem.length + state.editor.attachments.solution.length;
    if (total < MAX_ATTACHMENTS) {
      thumbs.appendChild(
        el(
          "button",
          {
            class: "dz-add",
            type: "button",
            "aria-label": "添加图片",
            onclick: (event) => {
              event.stopPropagation();
              zone.querySelector('input[type="file"]').click();
            },
          },
          iconEl("plus")
        )
      );
    }
    zone.classList.toggle("has-files", list.length > 0);
  }

  function collectEditorPayload() {
    const problem = $("#f-problem").value.trim();
    const hasSolution = $("#f-has-solution").checked;
    const solution = hasSolution ? $("#f-solution").value.trim() : "";
    const attachments = [];
    for (const kind of ["problem", "solution"]) {
      if (kind === "solution" && !hasSolution) continue;
      for (const item of state.editor.attachments[kind]) {
        if (item.loading) throw new Error("图片还在处理中，请稍候");
        if (item.data) {
          attachments.push({ data: item.data, name: item.name, kind });
        } else if (item.url) {
          attachments.push({
            id: item.id,
            name: item.name,
            url: item.url,
            thumb: item.thumb,
            w: item.w,
            h: item.h,
            size: item.size,
            kind,
          });
        }
      }
    }
    if (!problem && !attachments.some((item) => item.kind === "problem")) {
      throw new Error("请填写题目，或至少上传一张题目图片");
    }
    return {
      subject: state.editor.subject,
      status: state.editor.status,
      problem,
      solution,
      difficulty: state.editor.difficulty,
      starred: $("#f-starred").checked,
      occurred_at: state.editor.occurred || todayISO(),
      attachments,
      ocr_text: state.editor.ocrText || "",
    };
  }

  async function saveEditor() {
    if (!state.editor || state.editor.saving || state.imageEditing) return;
    let payload;
    try {
      payload = collectEditorPayload();
    } catch (err) {
      toast(err.message, "error");
      return;
    }
    state.editor.saving = true;
    const button = $("#save-entry");
    const label = button.querySelector("span");
    const oldText = label.textContent;
    button.disabled = true;
    label.textContent = "保存中…";
    try {
      const id = state.editor.originalId;
      const entry = await api(id ? `/api/entries/${id}` : "/api/entries", {
        method: id ? "PUT" : "POST",
        body: payload,
      });
      state.editor.saving = false;
      button.disabled = false;
      label.textContent = oldText;
      if (!id) clearDraft();
      else state.editor.dirty = false;
      closeDialog($("#editor-dialog"));
      if (!entry.has_solution && (entry.ai_status === "pending" || entry.ai_status === "generating")) {
        toast("题目已保存，AI 正在生成解答…", "info", 4200);
      } else if (entry.ai_status === "unconfigured" && !entry.has_solution) {
        toast("题目已保存；配置 AI 后会自动补全解答", "info", 4200);
      } else {
        toast(id ? "修改已保存" : "题目已加入时间线", "success");
      }
      await Promise.all([refreshStats(), loadEntries({ silent: true })]);
      if (id && state.detail && state.detail.id === id) state.detail = entry;
    } catch (err) {
      state.editor.saving = false;
      button.disabled = false;
      label.textContent = oldText;
      handleError(err);
    }
  }

  // Math preview -----------------------------------------------------------

  function schedulePreview(kind) {
    window.clearTimeout(state.previewTimers[kind]);
    state.previewTimers[kind] = window.setTimeout(() => showPreview(kind, false), 220);
  }

  function togglePreview(kind) {
    if (!state.editor) return;
    if (state.editor.previews[kind]) hidePreview(kind);
    else showPreview(kind);
  }

  function showPreview(kind, updateState = true) {
    if (!state.editor) return;
    if (updateState) state.editor.previews[kind] = true;
    const preview = $(`#preview-${kind}`);
    const textarea = kind === "problem" ? $("#f-problem") : $("#f-solution");
    preview.hidden = false;
    preview.textContent = textarea.value;
    renderMath(preview);
    const button = $(`.preview-toggle[data-preview="${kind}"]`);
    if (button) {
      button.querySelector("span").textContent = "隐藏预览";
      button.classList.add("active");
    }
  }

  function hidePreview(kind) {
    if (!state.editor) return;
    state.editor.previews[kind] = false;
    const preview = $(`#preview-${kind}`);
    if (preview) {
      preview.hidden = true;
      clear(preview);
    }
    const button = $(`.preview-toggle[data-preview="${kind}"]`);
    if (button) {
      button.querySelector("span").textContent = "预览公式";
      button.classList.remove("active");
    }
  }

  function clearMathPreviews() {
    for (const kind of ["problem", "solution"]) {
      const preview = $(`#preview-${kind}`);
      if (preview) {
        preview.hidden = true;
        clear(preview);
      }
      const button = $(`.preview-toggle[data-preview="${kind}"]`);
      if (button) {
        button.querySelector("span").textContent = "预览公式";
        button.classList.remove("active");
      }
    }
  }

  function insertMath(textarea, button) {
    if (!textarea) return;
    const before = button.dataset.before || "";
    const after = button.dataset.after || "";
    const placeholder = button.dataset.placeholder || "";
    const insert = button.dataset.insert || "";
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? textarea.value.length;
    const selected = textarea.value.slice(start, end);
    let text;
    let selectStart;
    let selectEnd;
    if (insert) {
      text = insert;
      textarea.setRangeText(insert, start, end, "end");
      selectStart = selectEnd = start + insert.length;
    } else {
      const inner = selected || placeholder;
      text = before + inner + after;
      textarea.setRangeText(text, start, end, "end");
      selectStart = start + before.length;
      selectEnd = selectStart + inner.length;
    }
    textarea.focus();
    textarea.setSelectionRange(selectStart, selectEnd);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // ---------------------------------------------------------------------
  // Review
  // ---------------------------------------------------------------------

  async function startReviewFor(id) {
    try {
      const entry = await api(`/api/entries/${id}`);
      state.review = {
        queue: [entry],
        index: 0,
        entry,
        revealed: false,
        result: null,
        note: "",
        reviewed: 0,
        total: 1,
      };
      openDialog($("#review-dialog"));
      renderReview();
    } catch (err) {
      handleError(err);
    }
  }

  async function startDueReview() {
    try {
      const data = await api("/api/entries?due=1&solutions=0&sort=due&limit=100");
      const queue = data.entries || [];
      if (!queue.length) {
        state.review = {
          queue: [],
          index: 0,
          entry: null,
          revealed: false,
          result: null,
          note: "",
          reviewed: 0,
          total: 0,
          empty: true,
        };
        openDialog($("#review-dialog"));
        renderReview();
        return;
      }
      state.review = {
        queue,
        index: 0,
        entry: queue[0],
        revealed: false,
        result: null,
        note: "",
        reviewed: 0,
        total: queue.length,
        empty: false,
      };
      openDialog($("#review-dialog"));
      renderReview();
    } catch (err) {
      handleError(err);
    }
  }

  async function ensureReviewEntryDetail() {
    if (!state.review || !state.review.entry) return;
    if (state.review.entry.solution !== undefined && state.review.entry.answer !== undefined) return;
    const id = state.review.entry.id;
    const entry = await api(`/api/entries/${id}`);
    state.review.entry = entry;
    const idx = state.review.queue.findIndex((item) => item.id === id);
    if (idx >= 0) state.review.queue[idx] = entry;
  }

  function renderReview() {
    const root = $("#review-content");
    if (!root) return;
    clear(root);
    if (!state.review) return;
    if (state.review.empty || state.review.index >= state.review.queue.length) {
      renderReviewDone(root);
      return;
    }
    const entry = state.review.entry;
    const review = state.review;
    root.dataset.entryId = entry.id;

    const head = el("div", { class: "review-head" });
    const headMain = el("div", null);
    headMain.appendChild(el("div", { class: "review-kicker", text: `复习进度 · ${review.index + 1} / ${review.total}` }));
    const reviewTitle = el("h2", { class: "review-title", text: entry.title || "未命名题目" });
    renderMath(reviewTitle);
    headMain.appendChild(reviewTitle);
    head.appendChild(headMain);
    head.appendChild(
      el(
        "button",
        { class: "icon-btn", type: "button", "aria-label": "关闭", onclick: () => closeDialog($("#review-dialog")) },
        iconEl("x")
      )
    );
    root.appendChild(head);

    const body = el("div", { class: "review-body" });
    const question = el("div", { class: "review-question" });
    const chips = el("div", { class: "detail-chips" });
    chips.appendChild(
      el("span", {
        class: `chip chip-subject-${entry.subject}`,
        text: subjectLabel(entry.subject),
      })
    );
    chips.appendChild(
      el("span", {
        class: `chip chip-status-${entry.status}`,
        text: STATUS_LABEL[entry.status] || entry.status,
      })
    );
    if (entry.source || entry.chapter) {
      chips.appendChild(
        el("span", { class: "chip chip-ghost", text: [entry.source, entry.chapter].filter(Boolean).join(" · ") })
      );
    }
    question.appendChild(chips);
    if (entry.problem) {
      const text = el("div", { class: "detail-text", text: entry.problem, style: { marginTop: "8px" } });
      question.appendChild(text);
      renderMath(text);
    }
    const problemImages = (entry.attachments || []).filter((a) => (a.kind || "problem") === "problem");
    if (problemImages.length) question.appendChild(buildDetailGallery(problemImages));
    body.appendChild(question);

    if (!review.revealed) {
      const zone = el("div", { class: "review-answer-zone" });
      zone.appendChild(
        el(
          "button",
          {
            class: "btn btn-primary",
            type: "button",
            onclick: () => revealReview(),
          },
          iconEl("eye"),
          el("span", { text: "查看答案与解析" })
        )
      );
      zone.appendChild(
        el("p", {
          class: "settings-note",
          text: "先在草稿纸上写出思路，再看答案。评分才会更准确。",
          style: { marginTop: "8px" },
        })
      );
      body.appendChild(zone);
    } else {
      const answerZone = el("div", { class: "review-answer-zone" });
      if (entry.answer) {
        const answer = el("span", { text: entry.answer });
        renderMath(answer, { answer: true });
        answerZone.appendChild(
          el("div", { class: "answer-banner" }, el("b", { text: "ANSWER" }), answer)
        );
      }
      if (entry.solution) {
        const panel = el("div", {
          class: `solution-panel${entry.subject === "linear" ? " linear" : ""}`,
          style: { marginTop: "9px" },
        });
        const text = el("div", { class: "detail-text", text: entry.solution });
        panel.appendChild(text);
        renderMath(text);
        answerZone.appendChild(panel);
      }
      const solutionImages = (entry.attachments || []).filter((a) => a.kind === "solution");
      if (solutionImages.length) answerZone.appendChild(buildDetailGallery(solutionImages));
      if (!entry.answer && !entry.solution && !solutionImages.length) {
        answerZone.appendChild(
          el("p", { class: "detail-text", text: "这道题还没有填写解答，可以直接凭记忆评分。" })
        );
      }

      const resultLabel = el("div", { class: "side-panel-title", text: "这次回忆得怎么样？", style: { marginTop: "16px" } });
      answerZone.appendChild(resultLabel);
      const results = el("div", { class: "review-results" });
      for (const [key, meta] of Object.entries(RESULT_META)) {
        results.appendChild(
          el(
            "button",
            {
              class: `result-btn${review.result === key ? " active" : ""}`,
              type: "button",
              dataset: { result: key },
              "aria-pressed": String(review.result === key),
              onclick: () => {
                review.result = key;
                $$(".result-btn", root).forEach((button) => {
                  const active = button.dataset.result === key;
                  button.classList.toggle("active", active);
                  button.setAttribute("aria-pressed", String(active));
                });
                $(".review-foot .btn-primary", root).disabled = false;
              },
            },
            el("strong", { text: meta.label }),
            el("small", { text: meta.hint })
          )
        );
      }
      answerZone.appendChild(results);

      const v3Zone = el("div", {
        class: "review-v3-zone",
        style: { display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px" },
      });
      v3Zone.appendChild(
        el("button", { class: "btn btn-ghost btn-sm", type: "button", dataset: { v3: "grade" } }, "📷 拍照给 AI 批阅")
      );
      v3Zone.appendChild(
        el("button", { class: "btn btn-ghost btn-sm", type: "button", dataset: { v3: "explain" } }, "🎓 我来讲解")
      );
      v3Zone.addEventListener("click", async (event) => {
        const btn = event.target.closest("[data-v3]");
        if (!btn) return;
        if (btn.dataset.v3 === "explain") return window.open(`/explain/${entry.id}`, "_blank");
        btn.disabled = true;
        try {
          await gradeEntryPhoto(entry, v3Zone);
        } catch (err) {
          toast(err.message || "批阅失败", "error");
        } finally {
          btn.disabled = false;
        }
      });
      answerZone.appendChild(v3Zone);

      const noteWrap = el("div", { class: "review-note" });
      const note = el("textarea", {
        placeholder: "备注：卡在哪一步？下次要注意什么？（可留空）",
        maxlength: "1000",
      });
      note.value = review.note || "";
      note.addEventListener("input", () => {
        review.note = note.value;
      });
      noteWrap.appendChild(note);
      answerZone.appendChild(noteWrap);
      body.appendChild(answerZone);
    }
    root.appendChild(body);

    const foot = el("div", { class: "review-foot" });
    foot.appendChild(
      el("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => closeDialog($("#review-dialog")) }, "稍后")
    );
    foot.appendChild(el("span", { class: "spacer" }));
    foot.appendChild(
      el(
        "button",
        { class: "btn btn-ghost btn-sm", type: "button", onclick: () => skipReview() },
        "跳过"
      )
    );
    if (review.revealed) {
      const submit = el(
        "button",
        {
          class: "btn btn-primary btn-sm",
          type: "button",
          disabled: !review.result,
          onclick: () => submitReview(),
        },
        iconEl("check"),
        el("span", { text: "提交并继续" })
      );
      foot.appendChild(submit);
    }
    root.appendChild(foot);
  }

  async function revealReview() {
    try {
      await ensureReviewEntryDetail();
      state.review.revealed = true;
      renderReview();
    } catch (err) {
      handleError(err);
    }
  }

  function skipReview() {
    if (!state.review) return;
    state.review.index += 1;
    state.review.revealed = false;
    state.review.result = null;
    state.review.note = "";
    state.review.entry = state.review.queue[state.review.index] || null;
    renderReview();
  }

  async function submitReview() {
    if (!state.review || !state.review.entry || !state.review.result) return;
    const current = state.review;
    const id = current.entry.id;
    try {
      const data = await api(`/api/entries/${id}/review`, {
        method: "POST",
        body: { result: current.result, note: current.note || "" },
      });
      current.reviewed += 1;
      const index = current.queue.findIndex((item) => item.id === id);
      if (index >= 0) current.queue[index] = data.entry;
      const timelineEntry = state.entries.find((item) => item.id === id);
      if (timelineEntry) Object.assign(timelineEntry, data.entry);
      toast(`已记录：${RESULT_META[current.result].label}，${data.interval_days} 天后再见`, "success", 2600);
      current.index += 1;
      current.revealed = false;
      current.result = null;
      current.note = "";
      current.entry = current.queue[current.index] || null;
      renderReview();
      refreshStats();
    } catch (err) {
      handleError(err);
    }
  }

  function renderReviewDone(root) {
    const reviewed = state.review ? state.review.reviewed : 0;
    root.appendChild(
      el(
        "div",
        { class: "review-empty" },
        el("div", { class: "empty-mark", text: "✓" }),
        el("h3", { text: reviewed > 0 ? "本轮复习完成" : "今天没有到期的题目" }),
        el(
          "p",
          {
            text:
              reviewed > 0
                ? `完成了 ${reviewed} 道题。下次复习时间已经按你的评分安排好。`
                : "可以主动从时间线里挑一道题复习，或者继续记录新题。",
          }
        ),
        el(
          "button",
          {
            class: "btn btn-primary",
            type: "button",
            onclick: () => {
              closeDialog($("#review-dialog"));
              refreshStats();
              loadEntries({ silent: true });
            },
          },
          iconEl("check"),
          el("span", { text: "回到时间线" })
        )
      )
    );
  }

  // ---------------------------------------------------------------------
  // Selection & print
  // ---------------------------------------------------------------------

  function toggleSelected(id, force) {
    const selected = typeof force === "boolean" ? force : !state.selected.has(id);
    if (selected) state.selected.add(id);
    else state.selected.delete(id);
    const card = $(`.entry-card[data-id="${id}"]`);
    if (card) {
      card.classList.toggle("is-selected", selected);
      const checkbox = card.querySelector(".entry-select input");
      if (checkbox) checkbox.checked = selected;
    }
    updateSelectionBar();
  }

  function updateSelectionBar() {
    const bar = $("#selection-bar");
    if (!bar) return;
    if (!state.selectMode || state.selected.size === 0) {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    setText($("#selected-count"), state.selected.size);
  }

  function setSelectMode(on) {
    state.selectMode = on;
    document.body.classList.toggle("select-mode", on);
    const button = $("#select-mode-btn");
    button.classList.toggle("active", on);
    button.classList.toggle("btn-primary", on);
    button.classList.toggle("btn-ghost", !on);
    if (!on) {
      state.selected.clear();
      $$(".entry-card.is-selected").forEach((card) => card.classList.remove("is-selected"));
      $$(".entry-select input").forEach((input) => { input.checked = false; });
    }
    updateSelectionBar();
  }

  function clearSelection() {
    state.selected.clear();
    $$(".entry-card.is-selected").forEach((card) => card.classList.remove("is-selected"));
    $$(".entry-select input").forEach((input) => {
      input.checked = false;
    });
    updateSelectionBar();
  }

  function openPrintFor(entries, withSolutions) {
    if (!entries.length) {
      toast("当前没有可打印的题目", "info");
      return;
    }
    if (entries.length > MAX_PRINT) {
      toast(`一次最多打印 ${MAX_PRINT} 道，请先筛选或选题`, "error");
      return;
    }
    const ids = entries.map((entry) => entry.id).join(",");
    const title = printTitle();
    // The URL is the primary channel; localStorage is a fallback for very
    // long selections and for browsers that drop the query on popup.
    try {
      localStorage.setItem(
        "math.print",
        JSON.stringify({ ids, withSolutions, title, at: Date.now() })
      );
    } catch (err) {
      // Printing still works through the URL.
    }
    const params = new URLSearchParams({
      ids,
      solutions: withSolutions ? "1" : "0",
      title,
    });
    window.open(`/print?${params.toString()}`, "_blank", "noopener");
  }

  async function printSelected(withSolutions) {
    let entries = state.entries.filter((entry) => state.selected.has(entry.id));
    // Selection may survive a filter change; fetch the selected entries that
    // are not in the current result page.
    if (!entries.length && state.selected.size) {
      const fetched = await Promise.all(
        Array.from(state.selected).map((id) =>
          api(`/api/entries/${id}`).catch(() => null)
        )
      );
      entries = fetched.filter(Boolean);
    }
    openPrintFor(entries, withSolutions);
  }

  function printTitle() {
    const parts = [];
    if (state.filters.subject !== "all") parts.push(SUBJECT_LABEL[state.filters.subject]);
    else parts.push("数学错题");
    if (state.filters.status === "wrong") parts.push("错题");
    if (state.filters.status === "unsolved") parts.push("不会的题");
    if (state.filters.due) parts.push("复习题");
    if (state.filters.tag) parts.push(`#${state.filters.tag}`);
    return `${parts.join(" · ")}练习`;
  }

  function bindSelection() {
    $("#select-mode-btn").addEventListener("click", () => setSelectMode(!state.selectMode));
    $("#select-all-btn").addEventListener("click", () => {
      state.entries.forEach((entry) => state.selected.add(entry.id));
      renderTimeline();
      updateSelectionBar();
    });
    $("#clear-selection-btn").addEventListener("click", clearSelection);
    $("#print-selected-practice").addEventListener("click", () => {
      printSelected(false);
    });
    $("#print-selected-solutions").addEventListener("click", () => {
      printSelected(true);
    });
    $("#header-export").addEventListener("click", () => {
      openPrintFor(state.entries, state.mode === "solutions");
    });
  }

  // ---------------------------------------------------------------------
  // Settings, export, import, backup
  // ---------------------------------------------------------------------

  function renderSubjects(subjects) {
    if (!Array.isArray(subjects) || !subjects.length) return;
    state.subjects = subjects;
    Object.keys(SUBJECT_LABEL).forEach(key => delete SUBJECT_LABEL[key]);
    subjects.forEach(s => { SUBJECT_LABEL[s.id] = s.name; });
    if (state.filters.subject !== "all" && !SUBJECT_LABEL[state.filters.subject]) state.filters.subject = "all";
    const tabs = $(".subject-tabs"), sidebar = $("#subject-filter"), chips = $("#subject-chips"), stats = $(".stat-grid");
    tabs.replaceChildren(el("button", {type:"button", dataset:{quickSubject:"all"}, text:"全部题目"}));
    sidebar.replaceChildren(el("button", {class:"side-filter", type:"button", dataset:{subject:"all"}},
      el("span",{class:"sf-dot dot-all"}),el("span",{text:"全部"}),el("em",{id:"sf-all",text:state.stats?.total || 0})));
    chips.replaceChildren();
    $$("[data-stat]", stats).filter(n => !["all","due"].includes(n.dataset.stat)).forEach(n => n.remove());
    subjects.forEach(s => {
      tabs.append(el("button", {type:"button",dataset:{quickSubject:s.id},text:s.name}));
      sidebar.append(el("button", {class:"side-filter",type:"button",dataset:{subject:s.id}},
        el("span",{class:`sf-dot dot-${s.id === "linear" ? "linear" : "analysis"}`}),el("span",{class:"subject-name",text:s.name}),
        el("em",{dataset:{subjectCount:s.id},text:state.stats?.by_subject?.[s.id] || 0})));
      chips.append(el("button",{type:"button",class:`choice-chip subject-${s.id === "linear" ? "linear" : "analysis"}`,dataset:{value:s.id},text:s.name}));
      stats.append(el("button",{type:"button",class:"stat-cell",dataset:{stat:s.id}},
        el("strong",{text:state.stats?.by_subject?.[s.id] || 0}),el("span",{text:s.name})));
    });
    if (state.editor) setChips("subject-chips",state.editor.subject);
    applyFiltersToUI();
    renderSubjectManager();
  }

  function renderSubjectManager(editId = null) {
    const root = $("#subject-manager");
    root.replaceChildren();
    state.subjects.forEach(s => {
      if (s.id === editId) {
        const input = el("input",{type:"text",value:s.name,maxlength:"24",required:true,"aria-label":"修改科目名称",autocomplete:"off"});
        const kind = el("select",{"aria-label":"科目类型"});
        Object.entries(KIND_LABEL).forEach(([value,label])=>{
          const option = el("option",{value,text:value === "cpp" ? "程序设计（可编译判题）" : label});
          if ((s.kind || "math") === value) option.selected = true;
          kind.append(option);
        });
        const save = el("button",{type:"submit",class:"btn btn-primary btn-sm",text:"保存"});
        const cancel = el("button",{type:"button",class:"btn btn-ghost btn-sm",text:"取消"});
        const form = el("form",{class:"subject-row subject-edit-row"},input,kind,save,cancel);
        cancel.addEventListener("click",()=>renderSubjectManager());
        form.addEventListener("submit",event=>{
          event.preventDefault(); saveSubject(s.id,input.value,form,kind.value);
        });
        root.append(form); input.focus(); input.select();
      } else {
        const edit = el("button",{type:"button",class:"btn btn-ghost btn-sm",dataset:{subjectEdit:s.id},text:"编辑","aria-label":`编辑${s.name}`});
        edit.addEventListener("click",()=>renderSubjectManager(s.id));
        root.append(el("div",{class:"subject-row"},
          el("span",{class:"subject-name",text:s.name}),
          el("span",{class:"chip chip-ghost",text:KIND_LABEL[s.kind || "math"] || "数学"}),
          edit));
      }
    });
  }

  async function saveSubject(id, name, form, kind) {
    const buttons = $$("button",form);
    buttons.forEach(b=>{b.disabled=true;});
    const message = $("#subject-message");
    message.textContent = "正在保存…";
    message.classList.remove("error");
    try {
      const result = await api(id ? `/api/subjects/${id}` : "/api/subjects", {method:id ? "PUT" : "POST",body:{name, kind}});
      renderSubjects(result.subjects);
      if (!id) $("#subject-add-form").reset();
      message.textContent = id ? "科目已更新，已有题目已同步。" : "科目已添加，记题时可以直接选择。";
      if (id) $(`[data-subject-edit="${id}"]`).focus();
      else $("#subject-new-name").focus();
      await Promise.all([refreshStats(), loadEntries({silent:true})]);
    } catch (error) {
      message.textContent = error.message || "保存失败，请重试";
      message.classList.add("error");
    } finally {
      buttons.forEach(b=>{b.disabled=false;});
    }
  }

  function openSettings() {
    openDialog($("#settings-dialog"));
    api("/api/settings")
      .then((settings) => {
        renderSubjects(settings.subjects);
        setText(
          $("#settings-backup-meta"),
          settings.is_admin
            ? `服务器上已有 ${settings.backup_count} 个备份 · 版本 ${settings.version}`
            : "普通账号可导出自己的数据；服务器备份由管理员维护。"
        );
      })
      .catch(handleError);
  }

  function bindSettings() {
    $("#open-settings").addEventListener("click", openSettings);
    $("#subject-add-form").addEventListener("submit",event=>{
      event.preventDefault();
      const kindInput = $("#subject-new-kind");
      saveSubject(null,$("#subject-new-name").value,event.currentTarget,kindInput ? kindInput.value : "math");
    });

    $("#password-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const current = $("#password-current").value;
      const next = $("#password-new").value;
      const confirm = $("#password-confirm").value;
      if (next.length < 8) {
        toast("新密码至少 8 位", "error");
        return;
      }
      if (next !== confirm) {
        toast("两次输入的新密码不一致", "error");
        return;
      }
      try {
        await api("/api/account/password", { method: "POST", body: { current, new: next } });
        $("#password-form").reset();
        toast("密码已更新，其他设备需要重新登录", "success", 4200);
      } catch (err) {
        handleError(err);
      }
    });

    $("#settings-export").addEventListener("click", exportData);
    $("#export-data").addEventListener("click", exportData);
    $("#settings-import").addEventListener("click", () => $("#import-file").click());
    $("#import-data").addEventListener("click", () => $("#import-file").click());
    $("#settings-backup").addEventListener("click", createServerBackup);
    $("#backup-now").addEventListener("click", createServerBackup);

    $("#import-file").addEventListener("change", importDataFile);

    $("#logout-btn").addEventListener("click", async () => {
      const ok = await confirmAction({
        title: "退出登录？",
        message: "这台设备需要重新输入用户名和密码。",
        okText: "退出",
        danger: false,
      });
      if (!ok) return;
      try {
        await api("/api/logout", { method: "POST", body: {} });
        location.href = "/login";
      } catch (err) {
        handleError(err);
      }
    });

    $("#logout-all-btn").addEventListener("click", async () => {
      const ok = await confirmAction({
        title: "退出所有设备？",
        message: "所有已登录设备都会失效，包括当前设备。需要重新输入密码。",
        okText: "全部退出",
      });
      if (!ok) return;
      try {
        await api("/api/settings/logout-all", { method: "POST", body: {} });
        location.href = "/login";
      } catch (err) {
        handleError(err);
      }
    });
  }

  function exportData() {
    location.href = "/api/export";
    toast("正在下载 JSON 备份", "info", 2000);
  }

  async function createServerBackup() {
    const buttons = [$("#settings-backup"), $("#backup-now")].filter(Boolean);
    buttons.forEach((button) => {
      button.disabled = true;
    });
    try {
      const data = await api("/api/backup", { method: "POST", body: {} });
      const size = data.size ? `${(data.size / 1024 / 1024).toFixed(1)} MB` : "";
      toast(`服务器备份已创建 ${size}`.trim(), "success", 4200);
      setText($("#settings-backup-meta"), `最近备份：${data.filename} · ${size}`);
    } catch (err) {
      handleError(err);
    } finally {
      buttons.forEach((button) => {
        button.disabled = false;
      });
    }
  }

  async function importDataFile(event) {
    const input = event.target;
    const file = input.files && input.files[0];
    input.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data || data.app !== "math-notes" || !Array.isArray(data.entries)) {
        throw new Error("这不是 math-notes 的备份文件");
      }
      const ok = await confirmAction({
        title: "导入备份？",
        message: `将合并 ${data.entries.length} 道题。已存在的题目会跳过，不会覆盖当前数据。`,
        okText: "开始导入",
        danger: false,
      });
      if (!ok) return;
      const result = await api("/api/import", { method: "POST", body: { entries: data.entries, subjects: data.subjects || [] } });
      toast(
        `导入完成：新增 ${result.imported} 道，跳过 ${result.skipped} 道`,
        "success",
        5000
      );
      if (result.errors && result.errors.length) {
        console.warn("Import warnings", result.errors);
      }
      const subjects = await api("/api/subjects");
      renderSubjects(subjects.subjects);
      await Promise.all([refreshStats(), loadEntries({ silent: true })]);
      closeDialog($("#settings-dialog"));
    } catch (err) {
      if (err instanceof SyntaxError) toast("备份文件不是有效的 JSON", "error");
      else handleError(err);
    }
  }

  // ---------------------------------------------------------------------
  // Filter bindings
  // ---------------------------------------------------------------------

  function clearFilters() {
    state.filters = { subject: "all", status: "all", q: "", tag: "", due: false };
    const search = $("#search-input");
    if (search) search.value = "";
    applyFiltersToUI();
  }

  function closeMobileSidebar() {
    if (!window.matchMedia("(max-width: 1020px)").matches) return;
    setSidebarOpen(false);
  }

  function setSidebarOpen(open) {
    document.body.classList.toggle("sidebar-open", open);
    $("#sidebar-scrim").hidden = !open;
    $("#sidebar").inert = !open && window.matchMedia("(max-width: 1020px)").matches;
    for (const id of ["#sidebar-toggle", "#filter-toggle"]) {
      $(id).setAttribute("aria-expanded", String(open));
      $(id).setAttribute("aria-controls", "sidebar");
    }
    if (open) $("#sidebar-close").focus();
  }

  function bindFilters() {
    $(".subject-tabs").addEventListener("click", (event) => {
      const button = event.target.closest("[data-quick-subject]");
      if (!button) return;
      state.filters.subject = button.dataset.quickSubject;
      applyFiltersToUI();
      loadEntries();
    });
    $("#subject-filter").addEventListener("click", (event) => {
      const button = event.target.closest("[data-subject]");
      if (!button) return;
      state.filters.subject = button.dataset.subject;
      applyFiltersToUI();
      closeMobileSidebar();
      loadEntries();
    });

    $("#status-filter").addEventListener("click", (event) => {
      const button = event.target.closest("[data-status]");
      if (!button) return;
      state.filters.status = button.dataset.status;
      applyFiltersToUI();
      closeMobileSidebar();
      loadEntries();
    });

    $(".stat-grid").addEventListener("click", (event) => {
        const button = event.target.closest(".stat-cell");
        if (!button) return;
        const stat = button.dataset.stat;
        if (stat === "all") {
          clearFilters();
        } else if (stat === "due") {
          if (state.stats && state.stats.due > 0) {
            closeMobileSidebar();
            startDueReview();
            return;
          }
          toast(
            state.stats && state.stats.total > 0
              ? "今天没有到期的题目，可以主动挑一道复习"
              : "先记录第一道题，复习计划会自动开始",
            "info"
          );
          if (!state.stats || state.stats.total === 0) openEditor();
          return;
        } else {
          state.filters.subject = stat;
          state.filters.due = false;
        }
        applyFiltersToUI();
        closeMobileSidebar();
        loadEntries();
    });

    $("#tag-cloud").addEventListener("click", (event) => {
      const button = event.target.closest("[data-tag]");
      if (!button) return;
      const tag = button.dataset.tag;
      state.filters.tag = state.filters.tag === tag ? "" : tag;
      applyFiltersToUI();
      closeMobileSidebar();
      loadEntries();
    });

    $("#clear-tags").addEventListener("click", () => {
      state.filters.tag = "";
      applyFiltersToUI();
      loadEntries();
    });

    $("#due-panel").addEventListener("click", () => {
      if (!state.stats || state.stats.total === 0) {
        openEditor();
        return;
      }
      if (state.stats.due > 0) {
        closeMobileSidebar();
        startDueReview();
        return;
      }
      toast("今天没有到期的题目，可以主动挑一道复习", "info");
    });
    $("#due-panel").addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        $("#due-panel").click();
      }
    });

    let searchTimer = null;
    $("#search-input").addEventListener("input", (event) => {
      window.clearTimeout(searchTimer);
      const value = event.target.value.trim();
      searchTimer = window.setTimeout(() => {
        state.filters.q = value;
        applyFiltersToUI();
        loadEntries();
      }, 260);
    });

    $("#sort-select").addEventListener("change", (event) => {
      state.sort = event.target.value;
      loadEntries();
    });

    $("#mode-switch").addEventListener("click", (event) => {
      const button = event.target.closest("[data-mode]");
      if (!button) return;
      const mode = button.dataset.mode;
      if (mode === state.mode) return;
      state.mode = mode;
      try { localStorage.setItem(MODE_KEY, mode); } catch { /* Optional preference. */ }
      $$("#mode-switch button").forEach((item) => {
        item.classList.toggle("active", item.dataset.mode === mode);
      });
      loadEntries();
    });

    $("#refresh-btn").addEventListener("click", async () => {
      await Promise.all([refreshStats(), loadEntries({ silent: true })]);
      toast("已刷新", "success", 1600);
    });
  }

  // ---------------------------------------------------------------------
  // Sidebar / global UI
  // ---------------------------------------------------------------------

  function bindGlobal() {
    setSidebarOpen(false);
    window.matchMedia("(max-width: 1020px)").addEventListener("change", () => setSidebarOpen(false));
    const syncViewport = () => {
      const viewport = window.visualViewport;
      if (!viewport) return;
      document.documentElement.style.setProperty("--app-viewport-height", `${viewport.height}px`);
      document.documentElement.style.setProperty("--app-viewport-top", `${viewport.offsetTop}px`);
    };
    window.visualViewport?.addEventListener("resize", syncViewport);
    window.visualViewport?.addEventListener("scroll", syncViewport);
    syncViewport();
    $("#sidebar-close").addEventListener("click", closeMobileSidebar);
    $("#mobile-add").addEventListener("click", () => openEditor());
    $("#mobile-review").addEventListener("click", startDueReview);
    $("#mobile-settings").addEventListener("click", openSettings);
    $("#mobile-home").addEventListener("click", () => {
      closeMobileSidebar();
      clearFilters();
      loadEntries();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) saveDraft();
    });
    // Delegated close handler: works for static and dynamically rendered
    // [data-close-dialog] buttons, including the settings header ×.
    document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-close-dialog]");
      if (!button) return;
      const dialog = button.closest("dialog");
      if (dialog) closeDialog(dialog);
    });
    $("#header-add").addEventListener("click", () => openEditor());
    $("#hero-add").addEventListener("click", () => openEditor());
    ["#hero-review", "#nav-review", "#side-review"].forEach((selector) => {
      const button = $(selector);
      if (button) button.addEventListener("click", () => startDueReview());
    });
    const navMenuBtn = $("#nav-menu-btn");
    if (navMenuBtn) {
      navMenuBtn.addEventListener("click", () => {
        const open = document.body.classList.toggle("nav-open");
        navMenuBtn.setAttribute("aria-expanded", String(open));
      });
    }
    $$("#nav-links a, #nav-links button").forEach((link) => {
      link.addEventListener("click", () => {
        document.body.classList.remove("nav-open");
        if (navMenuBtn) navMenuBtn.setAttribute("aria-expanded", "false");
      });
    });
    $("#user-chip").addEventListener("click", openSettings);
    $("#sidebar-toggle").addEventListener("click", () => {
      setSidebarOpen(!document.body.classList.contains("sidebar-open"));
    });
    $("#sidebar-scrim").addEventListener("click", () => {
      setSidebarOpen(false);
    });
    $("#filter-toggle").addEventListener("click", () => {
      setSidebarOpen(!document.body.classList.contains("sidebar-open"));
    });

    $("#confirm-cancel").addEventListener("click", () => resolveConfirm(false));
    $("#confirm-ok").addEventListener("click", () => resolveConfirm(true));
    $("#confirm-dialog").addEventListener("cancel", (event) => {
      event.preventDefault();
      resolveConfirm(false);
    });
    $("#confirm-dialog").addEventListener("click", (event) => {
      if (event.target === $("#confirm-dialog")) resolveConfirm(false);
    });

    $("#lightbox-dialog").addEventListener("click", (event) => {
      if (event.target === $("#lightbox-dialog") || event.target.closest(".lightbox-close")) {
        closeDialog($("#lightbox-dialog"));
        $("#lightbox-image").src = "";
      }
    });

    // Close detail / review / settings on backdrop; editor stays open to protect edits.
    for (const id of ["detail-dialog", "review-dialog", "settings-dialog"]) {
      const dialog = $(`#${id}`);
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) closeDialog(dialog);
      });
    }

    // Native Esc / close() does not run our helpers, so unlock the page here.
    for (const dialog of $$("dialog")) {
      dialog.addEventListener("close", () => {
        if (dialog.id === "editor-dialog") {
          window.clearTimeout(state.draftsTimer);
          saveDraft();
        }
        if (dialog.dataset.historyEntry) {
          delete dialog.dataset.historyEntry;
          if (history.state?.mathDialog === dialog.id) history.back();
        }
        if (!document.querySelector("dialog[open]")) document.body.classList.remove("has-dialog");
        if (dialog.id === "confirm-dialog" && state.confirmResolver) {
          const resolve = state.confirmResolver;
          state.confirmResolver = null;
          resolve(false);
        }
      });
    }

    document.addEventListener("keydown", (event) => {
      const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable;
      const anyDialog = document.querySelector("dialog[open]");
      if (event.key === "Escape" && document.body.classList.contains("sidebar-open")) {
        setSidebarOpen(false);
      }
      if (anyDialog) return;
      if (event.key === "/" && !inField) {
        event.preventDefault();
        $("#search-input").focus();
      } else if ((event.key === "n" || event.key === "N") && !inField && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        openEditor();
      }
    });

    window.addEventListener("popstate", (event) => {
      const dialogs = $$("dialog[open]");
      const top = dialogs[dialogs.length - 1];
      if (top && top.dataset.historyEntry && top.id !== event.state?.mathDialog) {
        delete top.dataset.historyEntry;
        closeDialog(top);
        return;
      }
      readURL();
      syncFilterInputs();
      applyFiltersToUI();
      loadEntries();
    });
  }

  function syncFilterInputs() {
    const search = $("#search-input");
    if (search) search.value = state.filters.q;
    const sort = $("#sort-select");
    if (sort) sort.value = state.sort;
    $$("#mode-switch button").forEach((button) => {
      button.classList.toggle("active", button.dataset.mode === state.mode);
    });
  }

  // ---------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------

  function applyUser(user) {
    state.user = user;
    const isAdmin = user && user.role === "admin";
    setText($("#user-name"), user ? user.username : "");
    setText($("#user-avatar"), user ? user.username.slice(0, 1).toUpperCase() : "?");
    setText($("#account-name"), user ? user.username : "—");
    setText($("#account-role"), isAdmin ? "管理员" : "用户");
    $$("[data-admin-only]").forEach((node) => {
      node.hidden = !isAdmin;
    });
    const note = $("#ai-user-note");
    if (note) note.hidden = isAdmin;
  }

  async function init() {
    const startupAction = new URLSearchParams(location.search).get("action");
    updateTopbarDate();
    readURL();
    syncFilterInputs();
    applyFiltersToUI();

    bindTimeline();
    bindDetail();
    bindEditor();
    bindChat();
    bindAnnouncement();
    bindSelection();
    bindSettings();
    bindFilters();
    bindGlobal();

    try {
      const me = await api("/api/me");
      if (!me.authenticated) {
        location.replace("/login");
        return;
      }
      state.csrf = me.csrf;
      applyUser(me.user);
      renderSubjects(me.subjects);
    } catch (err) {
      return;
    }
    await Promise.all([refreshStats(), loadEntries()]);
    loadAnnouncement();
    if (startupAction === "add") openEditor();
    else if (startupAction === "review") startDueReview();
    else if (startupAction === "settings") openSettings();
  }

  // Small bridge for the v3 pages / bookmarklets that need the core helpers.
  window.MN = {
    api,
    toast,
    state,
    openDetail,
    subjectLabel,
    subjectKind,
    openChat(entry) {
      state.detail = entry;
      openChatDialog();
    },
    refresh: () => refreshStats().then(loadEntries),
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
