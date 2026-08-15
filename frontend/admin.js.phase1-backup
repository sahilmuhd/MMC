(function () {
  function apiBase() { return window.MMC_API_BASE || ""; }
  function getToken() { return localStorage.getItem("mmc_token"); }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
  function formatDate(iso) {
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
        ...(opts && opts.headers ? opts.headers : {}),
      },
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error || "Request failed");
    }
    return data;
  }

  function renderSummary(counts) {
    const el = document.getElementById("adminSummary");
    el.innerHTML = `
      <div class="admin-stat"><div class="num">${counts.contacts}</div><div class="label">Contact submissions</div></div>
      <div class="admin-stat"><div class="num">${counts.subscribers}</div><div class="label">Newsletter subscribers</div></div>
      <div class="admin-stat"><div class="num">${counts.users}</div><div class="label">Registered users</div></div>
    `;
  }

  function renderTable(containerId, rows, columns, emptyLabel) {
    const el = document.getElementById(containerId);
    if (!rows.length) {
      el.innerHTML = `<p class="admin-empty">${emptyLabel}</p>`;
      return;
    }
    const head = columns.map((c) => `<th>${c.label}</th>`).join("");
    const body = rows
      .slice()
      .reverse()
      .map((row) => {
        const cells = columns
          .map((c) => `<td class="${c.wrap ? "wrap" : ""}">${c.render ? c.render(row) : escapeHtml(row[c.key] ?? "")}</td>`)
          .join("");
        return `<tr>${cells}</tr>`;
      })
      .join("");
    el.innerHTML = `<table class="admin-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  }

  async function loadDashboard(role) {
    try {
      const summary = await authedFetch("/api/admin/summary");
      renderSummary(summary.counts);
    } catch (err) {
      document.getElementById("adminShell").innerHTML =
        `<p class="admin-empty">Failed to load dashboard data: ${escapeHtml(err.message)}</p>`;
      return;
    }

    // Each panel loads independently -- a permission-limited admin can
    // still see the panels they have access to, even if others 403.
    loadContacts();
    loadSubscribers();
    loadUsers();
    loadAchievements();
    loadIncome();
    if (role === "super_admin") loadPermissions();
  }

  async function loadContacts() {
    try {
      const data = await authedFetch("/api/admin/contacts");
      renderTable(
        "contactsTableWrap",
        data.contacts,
        [
          { key: "created_at", label: "Date", render: (r) => formatDate(r.created_at) },
          { key: "name", label: "Name" },
          { key: "email", label: "Email" },
          { key: "phone", label: "Phone" },
          { key: "message", label: "Message", wrap: true },
        ],
        "No contact submissions yet."
      );
    } catch (err) {
      document.getElementById("contactsTableWrap").innerHTML =
        `<p class="admin-empty">${escapeHtml(err.message)}</p>`;
    }
  }

  async function loadSubscribers() {
    try {
      const data = await authedFetch("/api/admin/newsletter");
      renderTable(
        "subscribersTableWrap",
        data.subscribers,
        [
          { key: "created_at", label: "Date", render: (r) => formatDate(r.created_at) },
          { key: "email", label: "Email" },
        ],
        "No newsletter subscribers yet."
      );
    } catch (err) {
      document.getElementById("subscribersTableWrap").innerHTML =
        `<p class="admin-empty">${escapeHtml(err.message)}</p>`;
    }
  }

  let cachedUsers = [];

  async function loadUsers() {
    try {
      const data = await authedFetch("/api/admin/users");
      cachedUsers = data.users;
      renderTable(
        "usersTableWrap",
        data.users,
        [
          { key: "created_at", label: "Date", render: (r) => formatDate(r.created_at) },
          { key: "name", label: "Name" },
          { key: "email", label: "Email" },
          {
            key: "role",
            label: "Role",
            render: (r) => `<span class="admin-role-badge ${r.role}">${escapeHtml(r.role)}</span>`,
          },
        ],
        "No registered users yet."
      );
      populatePermMemberSelect(data.users);
    } catch (err) {
      document.getElementById("usersTableWrap").innerHTML =
        `<p class="admin-empty">${escapeHtml(err.message)}</p>`;
    }
  }

  async function loadAchievements() {
    const el = document.getElementById("achievementsTableWrap");
    try {
      const data = await authedFetch("/api/achievements/?status=submitted");
      const rows = data.results;
      if (!rows.length) {
        el.innerHTML = `<p class="admin-empty">No achievements waiting for review.</p>`;
        return;
      }
      const body = rows
        .map((r) => `
          <tr>
            <td>${formatDate(r.submitted_at)}</td>
            <td>${escapeHtml(r.member_name || r.member)}</td>
            <td>${escapeHtml(r.goal_name || r.goal)}</td>
            <td>${escapeHtml(r.progress)}</td>
            <td><span class="admin-status-badge ${r.approval_status}">${escapeHtml(r.approval_status)}</span></td>
            <td>
              <div class="admin-row-actions">
                <button class="admin-btn admin-btn-approve" data-approve="${r.id}">Approve</button>
                <button class="admin-btn admin-btn-reject" data-reject="${r.id}">Reject</button>
              </div>
            </td>
          </tr>`)
        .join("");
      el.innerHTML = `<table class="admin-table"><thead><tr>
        <th>Submitted</th><th>Member</th><th>Goal</th><th>Progress</th><th>Status</th><th></th>
      </tr></thead><tbody>${body}</tbody></table>`;

      el.querySelectorAll("[data-approve]").forEach((btn) =>
        btn.addEventListener("click", () => approveAchievement(btn.dataset.approve))
      );
      el.querySelectorAll("[data-reject]").forEach((btn) =>
        btn.addEventListener("click", () => rejectAchievement(btn.dataset.reject))
      );
    } catch (err) {
      el.innerHTML = `<p class="admin-empty">${escapeHtml(err.message)}</p>`;
    }
  }

  async function approveAchievement(id) {
    try {
      await authedFetch(`/api/admin/achievements/${id}/approve/`, { method: "POST", body: "{}" });
      loadAchievements();
      loadIncome();
    } catch (err) {
      alert(err.message);
    }
  }

  async function rejectAchievement(id) {
    try {
      await authedFetch(`/api/admin/achievements/${id}/reject/`, { method: "POST", body: "{}" });
      loadAchievements();
    } catch (err) {
      alert(err.message);
    }
  }

  const INCOME_STATUSES = ["pending", "approved", "paid", "rejected"];

  async function loadIncome() {
    const el = document.getElementById("incomeTableWrap");
    try {
      const data = await authedFetch("/api/admin/income/");
      const rows = data.results;
      if (!rows.length) {
        el.innerHTML = `<p class="admin-empty">No income records yet.</p>`;
        return;
      }
      const body = rows
        .map((r) => `
          <tr>
            <td>${formatDate(r.created_at)}</td>
            <td>${escapeHtml(r.member_name || r.member)}</td>
            <td>${escapeHtml(r.amount)}</td>
            <td><span class="admin-status-badge ${r.status}">${escapeHtml(r.status)}</span></td>
            <td>
              <select class="admin-status-select" data-income="${r.id}">
                ${INCOME_STATUSES.map((s) => `<option value="${s}" ${s === r.status ? "selected" : ""}>${s}</option>`).join("")}
              </select>
            </td>
          </tr>`)
        .join("");
      el.innerHTML = `<table class="admin-table"><thead><tr>
        <th>Created</th><th>Member</th><th>Amount</th><th>Status</th><th>Update</th>
      </tr></thead><tbody>${body}</tbody></table>`;

      el.querySelectorAll("[data-income]").forEach((sel) =>
        sel.addEventListener("change", () => updateIncomeStatus(sel.dataset.income, sel.value))
      );
    } catch (err) {
      el.innerHTML = `<p class="admin-empty">${escapeHtml(err.message)}</p>`;
    }
  }

  async function updateIncomeStatus(id, status) {
    try {
      await authedFetch(`/api/admin/income/${id}/`, { method: "PATCH", body: JSON.stringify({ status }) });
      loadIncome();
    } catch (err) {
      alert(err.message);
      loadIncome();
    }
  }

  function populatePermMemberSelect(users) {
    const select = document.getElementById("permMemberSelect");
    if (!select) return;
    const admins = users.filter((u) => u.role === "admin" || u.role === "super_admin");
    if (!admins.length) return;
    select.innerHTML = admins
      .map((u) => `<option value="${u.id}">${escapeHtml(u.name)} (${escapeHtml(u.role)})</option>`)
      .join("");
    select.onchange = () => loadPermissionsFor(select.value);
    loadPermissionsFor(select.value);
  }

  async function loadPermissions() {
    document.getElementById("permissionsPanel").style.display = "block";
    if (cachedUsers.length) populatePermMemberSelect(cachedUsers);
  }

  async function loadPermissionsFor(memberId) {
    const el = document.getElementById("permissionsTableWrap");
    if (!memberId) return;
    try {
      const data = await authedFetch(`/api/admin/permissions/?member=${memberId}`);
      const body = data.permissions
        .map((p) => `
          <tr>
            <td>${escapeHtml(p.codename)}</td>
            <td>
              <button class="admin-perm-toggle ${p.granted ? "granted" : "revoked"}" data-perm="${p.codename}">
                ${p.granted ? "Granted" : "Revoked"}
              </button>
            </td>
          </tr>`)
        .join("");
      el.innerHTML = `<table class="admin-table"><thead><tr><th>Permission</th><th>Status</th></tr></thead><tbody>${body}</tbody></table>`;

      el.querySelectorAll("[data-perm]").forEach((btn) =>
        btn.addEventListener("click", () => togglePermission(memberId, btn.dataset.perm, btn.classList.contains("granted")))
      );
    } catch (err) {
      el.innerHTML = `<p class="admin-empty">${escapeHtml(err.message)}</p>`;
    }
  }

  async function togglePermission(memberId, codename, currentlyGranted) {
    try {
      await authedFetch("/api/admin/permissions/assign/", {
        method: "POST",
        body: JSON.stringify({ member: memberId, codename, action: currentlyGranted ? "revoke" : "grant" }),
      });
      loadPermissionsFor(memberId);
    } catch (err) {
      alert(err.message);
    }
  }

  async function checkAccessAndLoad() {
    const token = getToken();
    const shell = document.getElementById("adminShell");
    const denied = document.getElementById("adminDenied");

    if (!token) {
      denied.style.display = "block";
      return;
    }

    try {
      const res = await fetch(`${apiBase()}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (!res.ok || !data.ok || !["admin", "super_admin"].includes(data.user.role)) {
        denied.style.display = "block";
        return;
      }

      shell.style.display = "block";
      loadDashboard(data.user.role);
    } catch {
      denied.style.display = "block";
    }
  }

  document.addEventListener("DOMContentLoaded", checkAccessAndLoad);
})();
