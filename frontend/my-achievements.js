(function () {
  function apiBase() { return window.MMC_API_BASE || ""; }
  function getToken() { return localStorage.getItem("mmc_token"); }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
  function formatDate(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  }

  async function authedFetch(path, opts) {
    const res = await fetch(`${apiBase()}${path}`, {
      ...opts,
      headers: {
        Authorization: `Bearer ${getToken()}`,
        ...(opts && opts.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error || "Request failed");
    }
    return data;
  }

  function renderSummary(user) {
    const el = document.getElementById("myPointsSummary");
    el.innerHTML = `
      <div class="admin-stat"><div class="num">${(user.points_balance ?? 0).toLocaleString()}</div><div class="label">Points balance</div></div>
      <div class="admin-stat"><div class="num">${escapeHtml(user.member_id || "—")}</div><div class="label">Member ID</div></div>
      <div class="admin-stat"><div class="num" style="text-transform:capitalize;">${escapeHtml(user.status || "—")}</div><div class="label">Status</div></div>
    `;
  }

  async function loadGoals(userId) {
    const el = document.getElementById("goalsTableWrap");
    try {
      const data = await authedFetch("/api/goals/?status=active");
      const goals = data.results;
      if (!goals.length) {
        el.innerHTML = `<p class="admin-empty">No active goals right now — check back soon.</p>`;
        return;
      }
      const body = goals
        .map((g) => `
          <tr>
            <td>${escapeHtml(g.name)}</td>
            <td>${escapeHtml(g.target)}</td>
            <td>${escapeHtml(g.points)}</td>
            <td>
              <div class="admin-row-actions">
                <input type="number" step="any" class="admin-progress-input" data-progress-for="${g.id}" placeholder="Progress" style="width:90px;">
                <button class="admin-btn admin-btn-approve" data-submit-goal="${g.id}">Submit</button>
              </div>
            </td>
          </tr>`)
        .join("");
      el.innerHTML = `<table class="admin-table"><thead><tr>
        <th>Goal</th><th>Target</th><th>Points</th><th>Submit progress</th>
      </tr></thead><tbody>${body}</tbody></table>`;

      el.querySelectorAll("[data-submit-goal]").forEach((btn) =>
        btn.addEventListener("click", () => submitProgress(btn.dataset.submitGoal))
      );
    } catch (err) {
      el.innerHTML = `<p class="admin-empty">${escapeHtml(err.message)}</p>`;
    }
  }

  async function submitProgress(goalId) {
    const input = document.querySelector(`[data-progress-for="${goalId}"]`);
    const progress = input ? input.value : "";
    if (!progress) {
      alert("Enter a progress value first.");
      return;
    }
    try {
      await authedFetch(`/api/goals/${goalId}/achievements/`, {
        method: "POST",
        body: JSON.stringify({ progress }),
      });
      if (input) input.value = "";
      loadMyAchievements();
    } catch (err) {
      alert(err.message);
    }
  }

  async function loadMyAchievements() {
    const el = document.getElementById("myAchievementsTableWrap");
    try {
      const data = await authedFetch("/api/achievements/");
      const rows = data.results;
      if (!rows.length) {
        el.innerHTML = `<p class="admin-empty">You haven't submitted anything yet.</p>`;
        return;
      }
      const body = rows
        .map((r) => `
          <tr>
            <td>${formatDate(r.submitted_at)}</td>
            <td>${escapeHtml(r.goal_name || r.goal)}</td>
            <td>${escapeHtml(r.progress)}</td>
            <td><span class="admin-status-badge ${r.approval_status}">${escapeHtml(r.approval_status)}</span></td>
          </tr>`)
        .join("");
      el.innerHTML = `<table class="admin-table"><thead><tr>
        <th>Submitted</th><th>Goal</th><th>Progress</th><th>Status</th>
      </tr></thead><tbody>${body}</tbody></table>`;
    } catch (err) {
      el.innerHTML = `<p class="admin-empty">${escapeHtml(err.message)}</p>`;
    }
  }

  async function loadMyIncome(userId) {
    const el = document.getElementById("myIncomeTableWrap");
    try {
      const data = await authedFetch(`/api/members/${userId}/income/history/`);
      const rows = data.results;
      if (!rows.length) {
        el.innerHTML = `<p class="admin-empty">No income records yet.</p>`;
        return;
      }
      const body = rows
        .map((r) => `
          <tr>
            <td>${formatDate(r.created_at)}</td>
            <td>${escapeHtml(r.amount)}</td>
            <td><span class="admin-status-badge ${r.status}">${escapeHtml(r.status)}</span></td>
          </tr>`)
        .join("");
      el.innerHTML = `<table class="admin-table"><thead><tr>
        <th>Created</th><th>Amount</th><th>Status</th>
      </tr></thead><tbody>${body}</tbody></table>`;
    } catch (err) {
      el.innerHTML = `<p class="admin-empty">${escapeHtml(err.message)}</p>`;
    }
  }

  async function init() {
    const token = getToken();
    const shell = document.getElementById("myAchievementsShell");
    const denied = document.getElementById("myAchievementsDenied");

    if (!token) {
      denied.style.display = "block";
      return;
    }

    try {
      const data = await authedFetch("/api/auth/me");
      shell.style.display = "block";
      renderSummary(data.user);
      loadGoals(data.user.id);
      loadMyAchievements();
      loadMyIncome(data.user.id);
    } catch {
      denied.style.display = "block";
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
