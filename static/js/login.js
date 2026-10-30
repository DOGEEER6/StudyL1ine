(() => {
  "use strict";

  const nextUrl = document.body.dataset.next || "/";
  const tabLogin = document.getElementById("tab-login");
  const tabRegister = document.getElementById("tab-register");
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  const loginError = document.getElementById("login-error");
  const registerError = document.getElementById("register-error");
  const inviteHelp = document.getElementById("invite-help");
  const inviteHelpBtn = document.getElementById("invite-help-btn");

  function showError(box, message) {
    box.textContent = message;
    box.hidden = false;
    document.body.classList.remove("is-error");
    void document.body.offsetWidth;
    document.body.classList.add("is-error");
  }

  function clearError(box) {
    box.hidden = true;
    box.textContent = "";
    document.body.classList.remove("is-error");
  }

  function setTab(which) {
    const isLogin = which === "login";
    tabLogin.classList.toggle("active", isLogin);
    tabRegister.classList.toggle("active", !isLogin);
    tabLogin.setAttribute("aria-selected", String(isLogin));
    tabRegister.setAttribute("aria-selected", String(!isLogin));
    loginForm.hidden = !isLogin;
    registerForm.hidden = isLogin;
    clearError(loginError);
    clearError(registerError);
    const focus = isLogin
      ? document.getElementById("login-username")
      : document.getElementById("register-username");
    if (focus) focus.focus();
  }

  tabLogin.addEventListener("click", () => setTab("login"));
  tabRegister.addEventListener("click", () => setTab("register"));

  if (inviteHelpBtn && inviteHelp) {
    inviteHelpBtn.addEventListener("click", () => {
      inviteHelp.hidden = !inviteHelp.hidden;
      if (!inviteHelp.hidden) {
        const input = document.getElementById("register-invite");
        if (input) input.focus();
      }
    });
  }

  const inviteCopyBtn = document.getElementById("invite-copy-btn");
  if (inviteCopyBtn) {
    inviteCopyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText("k1696783681");
        inviteCopyBtn.textContent = "已复制";
        window.setTimeout(() => { inviteCopyBtn.textContent = "复制微信号"; }, 1600);
      } catch (err) {
        window.prompt("复制微信号", "k1696783681");
      }
    });
  }

  document.querySelectorAll("[data-toggle-password]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.getElementById(button.dataset.togglePassword);
      if (!input) return;
      const visible = input.type === "text";
      input.type = visible ? "password" : "text";
      button.setAttribute("aria-label", visible ? "显示密码" : "隐藏密码");
      const use = button.querySelector("use");
      if (use) use.setAttribute("href", visible ? "#i-eye" : "#i-eye-off");
      input.focus();
    });
  });

  async function submit(path, body, button, errorBox, label) {
    clearError(errorBox);
    button.disabled = true;
    const span = button.querySelector("span");
    const old = span.textContent;
    span.textContent = "请稍候…";
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "请求失败");
      span.textContent = "进入中…";
      location.replace(data.redirect || nextUrl || "/");
    } catch (err) {
      button.disabled = false;
      span.textContent = old;
      showError(errorBox, err.message || "请求失败，请稍后重试");
    }
  }

  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const username = document.getElementById("login-username").value.trim();
    const password = document.getElementById("login-password").value;
    if (!username || !password) {
      showError(loginError, "请输入用户名和密码");
      return;
    }
    submit(
      "/api/login",
      { username, password, remember: document.getElementById("remember").checked, next: nextUrl },
      document.getElementById("login-submit"),
      loginError,
      "登录"
    );
  });

  registerForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const username = document.getElementById("register-username").value.trim();
    const password = document.getElementById("register-password").value;
    const confirm = document.getElementById("register-confirm").value;
    const inviteCode = document.getElementById("register-invite").value.trim().toUpperCase();
    if (password.length < 8) {
      showError(registerError, "密码至少 8 位");
      return;
    }
    if (password !== confirm) {
      showError(registerError, "两次输入的密码不一致");
      return;
    }
    if (!inviteCode) {
      showError(registerError, "请填写邀请码；没有邀请码可以点「获取邀请码」");
      if (inviteHelp) inviteHelp.hidden = false;
      return;
    }
    submit(
      "/api/register",
      { username, password, invite_code: inviteCode, remember: true, next: nextUrl },
      document.getElementById("register-submit"),
      registerError,
      "注册"
    );
  });
})();
