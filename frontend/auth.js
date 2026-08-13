// Handles login/register forms and keeps the nav in sync with session state.
// Loaded on every page (after config.js, before script.js).
(function () {
  const TOKEN_KEY = "mmc_token";
  const USER_KEY = "mmc_user";

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }
  function getStoredUser() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || "null");
    } catch {
      return null;
    }
  }
  function setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  function apiBase() {
    return window.MMC_API_BASE || "";
  }

  // --- Nav: reflect logged-in state on every page ---
  function renderLoggedInNav(user) {
    const actions = document.getElementById("navActions");
    if (!actions) return;
    actions.innerHTML = `
      <span class="nav-user-pill">Hi, ${escapeHtml(firstName(user.name))}
        <button type="button" class="nav-logout-btn" id="navLogoutBtn">Log out</button>
      </span>
    `;
    const logoutBtn = document.getElementById("navLogoutBtn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => {
        clearSession();
        window.location.href = "index.html";
      });
    }
  }

  function firstName(name) {
    return String(name || "").trim().split(/\s+/)[0] || "there";
  }
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  async function syncNavWithSession() {
    const token = getToken();
    if (!token) return;

    // Optimistically show the cached name immediately, then confirm with the server.
    const cached = getStoredUser();
    if (cached) renderLoggedInNav(cached);

    try {
      const res = await fetch(`${apiBase()}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setSession(token, data.user);
        renderLoggedInNav(data.user);
      } else {
        clearSession();
      }
    } catch {
      // Network hiccup — keep showing the cached session rather than
      // bouncing the user back to logged-out state.
    }
  }

  // --- Register form ---
  function wireRegisterForm() {
    const form = document.getElementById("registerForm");
    if (!form) return;

    const errorBanner = document.getElementById("registerError");
    const success = document.getElementById("registerSuccess");
    const submitBtn = document.getElementById("registerSubmit");

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearFieldErrors(form);
      errorBanner.classList.remove("show");

      const name = form.elements.name.value.trim();
      const email = form.elements.email.value.trim();
      const password = form.elements.password.value;
      const confirmPassword = form.elements.confirmPassword.value;

      if (password !== confirmPassword) {
        showFieldError(form, "confirmPassword", "Passwords do not match.");
        return;
      }

      submitBtn.disabled = true;
      try {
        const res = await fetch(`${apiBase()}/api/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password }),
        });
        const data = await res.json();

        if (res.ok && data.ok) {
          setSession(data.token, data.user);
          success.classList.add("show");
          setTimeout(() => { window.location.href = "home.html"; }, 900);
        } else if (data.errors) {
          Object.entries(data.errors).forEach(([field, msg]) => showFieldError(form, field, msg));
        } else {
          errorBanner.textContent = data.error || "Something went wrong. Please try again.";
          errorBanner.classList.add("show");
        }
      } catch {
        errorBanner.textContent = "Network error — please check your connection and try again.";
        errorBanner.classList.add("show");
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  // --- Login form ---
  function wireLoginForm() {
    const form = document.getElementById("loginForm");
    if (!form) return;

    const errorBanner = document.getElementById("loginError");
    const success = document.getElementById("loginSuccess");
    const submitBtn = document.getElementById("loginSubmit");

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearFieldErrors(form);
      errorBanner.classList.remove("show");

      const email = form.elements.email.value.trim();
      const password = form.elements.password.value;

      submitBtn.disabled = true;
      try {
        const res = await fetch(`${apiBase()}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();

        if (res.ok && data.ok) {
          setSession(data.token, data.user);
          success.classList.add("show");
          setTimeout(() => { window.location.href = "home.html"; }, 700);
        } else {
          errorBanner.textContent = data.error || "Something went wrong. Please try again.";
          errorBanner.classList.add("show");
        }
      } catch {
        errorBanner.textContent = "Network error — please check your connection and try again.";
        errorBanner.classList.add("show");
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  // --- Forgot password form ---
  function wireForgotPasswordForm() {
    const form = document.getElementById("forgotForm");
    if (!form) return;

    const errorBanner = document.getElementById("forgotError");
    const success = document.getElementById("forgotSuccess");
    const submitBtn = document.getElementById("forgotSubmit");

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearFieldErrors(form);
      errorBanner.classList.remove("show");
      success.classList.remove("show");

      const email = form.elements.email.value.trim();

      submitBtn.disabled = true;
      try {
        const res = await fetch(`${apiBase()}/api/auth/forgot-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const data = await res.json();

        // The backend always returns ok:true here by design (so we never
        // reveal whether the email exists) — just show the generic message.
        if (res.ok && data.ok) {
          success.textContent = data.message || "If an account exists for that email, a reset link has been sent.";
          success.classList.add("show");
          form.reset();
        } else {
          errorBanner.textContent = data.error || "Something went wrong. Please try again.";
          errorBanner.classList.add("show");
        }
      } catch {
        errorBanner.textContent = "Network error — please check your connection and try again.";
        errorBanner.classList.add("show");
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  // --- Reset password form ---
  function wireResetPasswordForm() {
    const form = document.getElementById("resetForm");
    if (!form) return;

    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const noTokenBanner = document.getElementById("resetNoToken");

    if (!token) {
      if (noTokenBanner) noTokenBanner.style.display = "block";
      form.querySelectorAll("input, button").forEach((el) => { el.disabled = true; });
      return;
    }

    const errorBanner = document.getElementById("resetError");
    const success = document.getElementById("resetSuccess");
    const submitBtn = document.getElementById("resetSubmit");

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearFieldErrors(form);
      errorBanner.classList.remove("show");

      const password = form.elements.password.value;
      const confirmPassword = form.elements.confirmPassword.value;

      if (password !== confirmPassword) {
        showFieldError(form, "confirmPassword", "Passwords do not match.");
        return;
      }

      submitBtn.disabled = true;
      try {
        const res = await fetch(`${apiBase()}/api/auth/reset-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, password }),
        });
        const data = await res.json();

        if (res.ok && data.ok) {
          success.classList.add("show");
          form.reset();
          setTimeout(() => { window.location.href = "login.html"; }, 1200);
        } else if (data.errors) {
          Object.entries(data.errors).forEach(([field, msg]) => showFieldError(form, field, msg));
        } else {
          errorBanner.textContent = data.error || "Something went wrong. Please try again.";
          errorBanner.classList.add("show");
        }
      } catch {
        errorBanner.textContent = "Network error — please check your connection and try again.";
        errorBanner.classList.add("show");
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  function showFieldError(form, fieldName, message) {
    const input = form.elements[fieldName];
    const errorEl = form.querySelector(`[data-error="${fieldName}"]`);
    if (input && errorEl) {
      input.closest(".field").classList.add("invalid");
      errorEl.textContent = message;
    }
  }
  function clearFieldErrors(form) {
    form.querySelectorAll(".field").forEach((f) => f.classList.remove("invalid"));
    form.querySelectorAll(".field-error").forEach((e) => { e.textContent = ""; });
  }

  document.addEventListener("DOMContentLoaded", () => {
    syncNavWithSession();
    wireRegisterForm();
    wireLoginForm();
    wireForgotPasswordForm();
    wireResetPasswordForm();
  });
})();
