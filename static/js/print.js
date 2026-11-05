(() => {
  "use strict";

  const SUBJECT_LABEL = { analysis: "工科数学分析", linear: "线性代数" };
  const params = new URLSearchParams(location.search);
  let withSolutions = params.get("solutions") === "1";
  let ids = params.get("ids") || "";
  let requestedTitle = params.get("title") || "数学错题练习";
  let savedPrint = null;
  try {
    savedPrint = JSON.parse(localStorage.getItem("math.print") || "null");
    if (savedPrint && Date.now() - Number(savedPrint.at || 0) < 10 * 60 * 1000) {
      if (!ids && savedPrint.ids) ids = savedPrint.ids;
      if (!params.has("solutions")) withSolutions = Boolean(savedPrint.withSolutions);
      if (!params.has("title") && savedPrint.title) requestedTitle = savedPrint.title;
    } else {
      savedPrint = null;
    }
  } catch (err) {
    savedPrint = null;
  }
  const root = document.getElementById("print-root");

  function el(tag, props, ...children) {
    const node = document.createElement(tag);
    if (props) {
      for (const [key, value] of Object.entries(props)) {
        if (value === null || value === undefined || value === false) continue;
        if (key === "class") node.className = value;
        else if (key === "text") node.textContent = String(value);
        else if (key === "dataset") Object.assign(node.dataset, value);
        else if (key === "style") Object.assign(node.style, value);
        else if (key === "checked" || key === "value" || key === "disabled") node[key] = value;
        else node.setAttribute(key, value === true ? "" : value);
      }
    }
    for (const child of children.flat(Infinity)) {
      if (child === null || child === undefined || child === false) continue;
      node.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function renderMath(node) {
    if (!node || typeof window.renderMathInElement !== "function") return;
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

  function formatDate(value) {
    if (!value) return "";
    const [y, m, d] = value.slice(0, 10).split("-").map(Number);
    if (!y || !m || !d) return value;
    return `${y} 年 ${m} 月 ${d} 日`;
  }

  function todayText() {
    const d = new Date();
    return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
  }

  function subjectSummary(entries) {
    const subjects = new Set(entries.map((entry) => entry.subject));
    return [...new Set(entries.map(entry => entry.subject_label || SUBJECT_LABEL[entry.subject] || "未命名科目"))].join(" / ");
  }

  function buildHeader(entries) {
    const mode = withSolutions ? "含解答 · 复盘版" : "无解答 · 练习版";
    const head = el("header", { class: "sheet-head" });
    const top = el("div", { class: "sheet-topline" });
    top.appendChild(
      el(
        "span",
        { class: "sheet-brand" },
        el("span", { text: "∫" }),
        el("span", { text: "StudyL1ne" })
      )
    );
    top.appendChild(el("span", { text: `PRACTICE SHEET · ${mode}` }));
    top.appendChild(el("span", { text: todayText() }));
    head.appendChild(top);
    head.appendChild(el("h1", { class: "sheet-title", text: requestedTitle }));
    const sub = el("div", { class: "sheet-sub" });
    sub.appendChild(el("span", { text: `${subjectSummary(entries)} · 共 ${entries.length} 道` }));
    sub.appendChild(el("span", { text: withSolutions ? "先独立完成，再对照解析" : "姓名 ____________　日期 ____________　得分 ____________" }));
    head.appendChild(sub);
    const rule = el("div", { class: "sheet-rule" });
    rule.appendChild(el("span", { text: "按记录日期排序" }));
    rule.appendChild(el("span", { class: "sheet-rule-line" }));
    rule.appendChild(el("span", { text: withSolutions ? "解析附后" : "请在空白处写出关键步骤" }));
    head.appendChild(rule);
    return head;
  }

  function buildQuestion(entry, index) {
    const q = el("section", { class: "question" });
    q.appendChild(el("span", { class: "q-number", text: String(index + 1) }));
    const head = el("div", { class: "q-head" });
    head.appendChild(
      el("span", {
        class: `q-subject ${entry.subject}`,
        text: entry.subject_label || SUBJECT_LABEL[entry.subject] || "未命名科目",
      })
    );
    const source = [entry.source, entry.chapter, entry.source_detail].filter(Boolean).join(" · ");
    if (source) head.appendChild(el("span", { class: "q-source", text: source }));
    q.appendChild(head);
    if (entry.title) q.appendChild(el("h2", { class: "q-title", text: entry.title }));
    if (entry.problem) {
      const problem = el("div", { class: "q-problem", text: entry.problem });
      q.appendChild(problem);
      renderMath(problem);
    }
    const images = (entry.attachments || []).filter((item) => (item.kind || "problem") === "problem");
    if (images.length) {
      const gallery = el("div", { class: "q-images" });
      for (const item of images) {
        gallery.appendChild(el("img", { src: item.url, alt: item.name || "题目图片" }));
      }
      q.appendChild(gallery);
    }
    if (!withSolutions) {
      const space = el("div", {
        class: `answer-space${entry.difficulty <= 2 ? " short" : ""}`,
        "aria-label": "答题区域",
      });
      q.appendChild(space);
    }
    return q;
  }

  function buildSolution(entry, index) {
    const item = el("section", { class: "solution-item" });
    item.appendChild(el("span", { class: "q-number", text: String(index + 1) }));
    item.appendChild(el("h3", { class: "solution-title", text: entry.title || "未命名题目" }));
    if (entry.answer) {
      const answer = el("span", { text: entry.answer });
      const box = el("div", { class: "solution-answer" }, el("span", { text: "答案：" }), answer);
      item.appendChild(box);
      renderMath(answer);
    }
    if (entry.solution) {
      const text = el("div", { class: "solution-text", text: entry.solution });
      item.appendChild(text);
      renderMath(text);
    }
    const images = (entry.attachments || []).filter((item) => item.kind === "solution");
    if (images.length) {
      const gallery = el("div", { class: "solution-images" });
      for (const image of images) {
        gallery.appendChild(el("img", { src: image.url, alt: image.name || "解答图片" }));
      }
      item.appendChild(gallery);
    }
    if (!entry.answer && !entry.solution && !images.length) {
      item.appendChild(el("p", { class: "solution-empty", text: "这道题还没有记录解答。" }));
    }
    return item;
  }

  function buildFooter(entries) {
    const foot = el("footer", { class: "sheet-foot" });
    foot.appendChild(el("span", { text: `StudyL1ne · math.dogeeer.cn · ${todayText()}` }));
    foot.appendChild(el("span", { text: `共 ${entries.length} 道 · ${withSolutions ? "含解答" : "无解答"}` }));
    return foot;
  }

  function render(entries) {
    clear(root);
    if (!entries.length) {
      const empty = el("div", { class: "sheet-empty" });
      empty.appendChild(el("h2", { text: "没有找到题目" }));
      empty.appendChild(el("p", { text: "返回时间线选择题目，再导出练习卷。" }));
      root.appendChild(empty);
      return;
    }

    document.title = `${requestedTitle} · ${withSolutions ? "含解答" : "无解答"}`;
    root.appendChild(buildHeader(entries));

    const questions = el("div", { class: "questions" });
    entries.forEach((entry, index) => questions.appendChild(buildQuestion(entry, index)));
    root.appendChild(questions);

    if (withSolutions) {
      const solutions = el("section", { class: "solutions" });
      const head = el("div", { class: "solutions-head" });
      head.appendChild(el("h2", { text: "参考答案与解析" }));
      head.appendChild(el("span", { text: `${entries.length} 道 · 复盘时使用` }));
      solutions.appendChild(head);
      entries.forEach((entry, index) => solutions.appendChild(buildSolution(entry, index)));
      root.appendChild(solutions);
    }

    root.appendChild(buildFooter(entries));
  }

  async function load() {
    try {
      const query = new URLSearchParams();
      query.set("solutions", "1");
      query.set("limit", "200");
      query.set("sort", "oldest");
      if (ids) query.set("ids", ids);
      const response = await fetch(`/api/entries?${query.toString()}`, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (response.status === 401) {
        location.replace(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
        return;
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "载入失败");
      let entries = data.entries || [];
      // A stale or truncated URL is recovered from the selection handoff.
      if (!entries.length && savedPrint && savedPrint.ids && savedPrint.ids !== ids) {
        const retry = new URLSearchParams({ solutions: "1", limit: "200", sort: "oldest", ids: savedPrint.ids });
        const again = await fetch(`/api/entries?${retry.toString()}`, {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });
        if (again.ok) {
          const retryData = await again.json();
          entries = retryData.entries || [];
          if (entries.length) withSolutions = Boolean(savedPrint.withSolutions);
        }
      }
      render(entries);
    } catch (err) {
      clear(root);
      const empty = el("div", { class: "sheet-empty" });
      empty.appendChild(el("h2", { text: "练习卷载入失败" }));
      empty.appendChild(el("p", { text: err.message || "请刷新后重试。" }));
      root.appendChild(empty);
    }
  }

  document.getElementById("print-btn").addEventListener("click", () => window.print());
  load();
})();
