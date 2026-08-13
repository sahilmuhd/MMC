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

  async function authedFetch(path) {
    const res = await fetch(`${apiBase()}${path}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
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

  async function loadDashboard() {
    try {
      const [summary, contacts, newsletter, users] = await Promise.all([
        authedFetch("/api/admin/summary"),
        authedFetch("/api/admin/contacts"),
        authedFetch("/api/admin/newsletter"),
        authedFetch("/api/admin/users"),
      ]);

      renderSummary(summary.counts);

      renderTable(
        "contactsTableWrap",
        contacts.contacts,
        [
          { key: "created_at", label: "Date", render: (r) => formatDate(r.created_at) },
          { key: "name", label: "Name" },
          { key: "email", label: "Email" },
          { key: "phone", label: "Phone" },
          { key: "message", label: "Message", wrap: true },
        ],
        "No contact submissions yet."
      );

      renderTable(
        "subscribersTableWrap",
        newsletter.subscribers,
        [
          { key: "created_at", label: "Date", render: (r) => formatDate(r.created_at) },
          { key: "email", label: "Email" },
        ],
        "No newsletter subscribers yet."
      );

      renderTable(
        "usersTableWrap",
        users.users,
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
    } catch (err) {
      document.getElementById("adminShell").innerHTML =
        `<p class="admin-empty">Failed to load dashboard data: ${escapeHtml(err.message)}</p>`;
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
      loadDashboard();
    } catch {
      denied.style.display = "block";
    }
  }

  document.addEventListener("DOMContentLoaded", checkAccessAndLoad);
})();
