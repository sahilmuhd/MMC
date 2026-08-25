(function () {
  function apiBase() { return window.MMC_API_BASE || ""; }
  function getToken() { return localStorage.getItem("mmc_token"); }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
  function formatDate(iso) {
    try { return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
    catch { return iso; }
  }
  function initials(name) {
    return String(name || "?").trim().split(/\s+/).slice(0, 2).map((s) => s[0] || "").join("").toUpperCase();
  }

  async function authedFetch(path, opts) {
    const isFormData = opts && opts.body instanceof FormData;
    const res = await fetch(`${apiBase()}${path}`, {
      ...opts,
      headers: {
        Authorization: `Bearer ${getToken()}`,
        ...(opts && opts.body && !isFormData ? { "Content-Type": "application/json" } : {}),
        ...(opts && opts.headers ? opts.headers : {}),
      },
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  // ---------------------------------------------------------------------
  // Toast / modal / confirm (replace browser alert()/confirm() everywhere)
  // ---------------------------------------------------------------------

  function toast(message, type) {
    const stack = document.getElementById("toastStack");
    const el = document.createElement("div");
    el.className = `adm-toast ${type || ""}`;
    el.textContent = message;
    stack.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  function openModal(html) {
    document.getElementById("modalBody").innerHTML = html;
    document.getElementById("modalOverlay").classList.add("open");
  }
  function closeModal() {
    document.getElementById("modalOverlay").classList.remove("open");
    document.getElementById("modalBody").innerHTML = "";
  }
  document.getElementById("modalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "modalOverlay") closeModal();
  });

  function confirmDialog(title, body, confirmLabel, danger) {
    return new Promise((resolve) => {
      openModal(`
        <h3>${escapeHtml(title)}</h3>
        <p style="color:var(--adm-text-dim); font-size:.88rem; line-height:1.6;">${escapeHtml(body)}</p>
        <div class="adm-modal-actions">
          <button class="adm-btn" id="confirmCancel">Cancel</button>
          <button class="adm-btn ${danger ? "danger" : "primary"}" id="confirmOk">${escapeHtml(confirmLabel || "Confirm")}</button>
        </div>
      `);
      document.getElementById("confirmCancel").onclick = () => { closeModal(); resolve(false); };
      document.getElementById("confirmOk").onclick = () => { closeModal(); resolve(true); };
    });
  }

  // ---------------------------------------------------------------------
  // Session / permission-aware nav
  // ---------------------------------------------------------------------

  let currentUser = null; // {role, permissions: [...], ...}

  function hasPerm(codename) {
    if (!currentUser) return false;
    if (codename === "__any__") return true;
    if (codename === "__super_admin_only__") return currentUser.role === "super_admin";
    if (currentUser.role === "super_admin") return true;
    return (currentUser.permissions || []).includes(codename);
  }

  function applyPermissionsToNav() {
    document.querySelectorAll(".adm-nav-link[data-perm]").forEach((btn) => {
      const perm = btn.dataset.perm;
      if (!hasPerm(perm)) {
        btn.setAttribute("disabled", "disabled");
        btn.title = "You don't have permission to access this section.";
      }
    });
  }

  const SECTION_META = {
    dashboard: { title: "Overview", sub: "Live snapshot of the MMC network." },
    members: { title: "Members", sub: "Search, filter, and manage every member." },
    network: { title: "MLM Network", sub: "Interactive network / hierarchy view." },
    goals: { title: "Goals", sub: "Manage active and past goals." },
    achievements: { title: "Achievements", sub: "Review member submissions." },
    points: { title: "Points", sub: "Balances, adjustments, and transaction history." },
    income: { title: "Income", sub: "Pending, approved, and paid income records." },
    content: { title: "Site Content", sub: "Manage the public-facing site." },
    messages: { title: "Messages", sub: "Contact form submissions." },
    reports: { title: "Reports", sub: "Export data across the system." },
    permissions: { title: "Permissions", sub: "Grant or revoke admin access." },
    audit: { title: "Audit Logs", sub: "Every tracked admin action." },
    settings: { title: "Settings", sub: "Your account settings." },
  };

  function showSection(name) {
    if (!SECTION_META[name]) name = "dashboard";
    const link = document.querySelector(`.adm-nav-link[data-section="${name}"]`);
    if (link && link.hasAttribute("disabled")) name = "dashboard"; // no silent access to a hidden section

    document.querySelectorAll(".adm-section").forEach((s) => s.classList.remove("active"));
    document.querySelectorAll(".adm-nav-link[data-section]").forEach((b) => b.classList.remove("active"));

    const section = document.getElementById(`section-${name}`);
    if (section) section.classList.add("active");
    const activeLink = document.querySelector(`.adm-nav-link[data-section="${name}"]`);
    if (activeLink) activeLink.classList.add("active");

    const meta = SECTION_META[name];
    document.getElementById("admPageTitle").textContent = meta.title;
    document.getElementById("admPageSub").textContent = meta.sub;

    if (name === "dashboard") loadDashboard();
    if (name === "members") loadMembers();
    if (name === "network") loadNetworkSection();
    if (name === "goals") loadGoals();
    if (name === "achievements") loadAchievements();
    if (name === "points") loadPointsSection();
    if (name === "income") loadIncomeSection();
    if (name === "content") loadContentSection();
    if (name === "messages") loadMessages();
    if (name === "reports") loadReportsSection();
    if (name === "permissions") loadPermissionsSection();
    if (name === "audit") loadAuditLogs();
    if (name === "settings") loadSettingsSection();
    window.location.hash = name;
  }

  function closeMobileSidebar() {
    document.getElementById("admSide").classList.remove("open");
    document.getElementById("admSideBackdrop").classList.remove("open");
  }

  function wireNav() {
    document.querySelectorAll(".adm-nav-link[data-section]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.hasAttribute("disabled")) return;
        showSection(btn.dataset.section);
        closeMobileSidebar(); // picking a section on mobile should close the menu, not leave it covering the screen
      });
    });
    document.getElementById("logoutBtn").addEventListener("click", () => {
      localStorage.removeItem("mmc_token");
      window.location.href = "login.html";
    });
    document.getElementById("admBell").addEventListener("click", loadNotificationsPreview);

    document.getElementById("admHamburger").addEventListener("click", () => {
      document.getElementById("admSide").classList.add("open");
      document.getElementById("admSideBackdrop").classList.add("open");
    });
    document.getElementById("admSideBackdrop").addEventListener("click", closeMobileSidebar);
  }

  // ---------------------------------------------------------------------
  // Dashboard
  // ---------------------------------------------------------------------

  let charts = {};
  function destroyChart(key) {
    if (charts[key]) { charts[key].destroy(); delete charts[key]; }
  }

  function renderKpis(counts) {
    const cards = [
      ["Total Members", counts.total_members],
      ["Active Members", counts.active_members],
      ["Inactive Members", counts.inactive_members],
      ["Pending Achievements", counts.pending_achievements],
      ["Total Points", counts.total_points],
      ["Pending Income", `₹${counts.pending_income}`],
      ["Paid Income", `₹${counts.paid_income}`],
      ["Total Income", `₹${counts.total_income}`],
    ];
    document.getElementById("admKpiGrid").innerHTML = cards
      .map(([label, val]) => `<div class="adm-kpi"><b>${escapeHtml(val)}</b><div class="label">${escapeHtml(label)}</div></div>`)
      .join("");

    const pendingBadge = document.getElementById("navPendingCount");
    if (counts.pending_achievements > 0) {
      pendingBadge.style.display = "inline-block";
      pendingBadge.textContent = counts.pending_achievements;
    } else {
      pendingBadge.style.display = "none";
    }
  }

  function renderStatusChart(active, inactive) {
    destroyChart("status");
    const ctx = document.getElementById("statusChart");
    charts.status = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: ["Active", "Inactive"],
        datasets: [{ data: [active, inactive], backgroundColor: ["#5B8C5A", "#B5533C"], borderWidth: 0 }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: "68%" },
    });
  }

  function renderGrowthChart(members) {
    // Bucket recent members by month from the `recent_members` sample --
    // this is a lightweight trend from what the dashboard endpoint already
    // returns, not a full historical query.
    const buckets = {};
    members.forEach((m) => {
      if (!m.created_at) return;
      const d = new Date(m.created_at);
      const key = d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
      buckets[key] = (buckets[key] || 0) + 1;
    });
    const labels = Object.keys(buckets);
    const data = Object.values(buckets);
    destroyChart("growth");
    charts.growth = new Chart(document.getElementById("growthChart"), {
      type: "bar",
      data: { labels: labels.length ? labels : ["No data yet"], datasets: [{ data: data.length ? data : [0], backgroundColor: "#D4AF37", borderRadius: 4 }] },
      options: {
        responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
        scales: { x: { grid: { display: false }, ticks: { color: "#8A867E" } }, y: { grid: { color: "rgba(212,175,55,.08)" }, ticks: { color: "#8A867E" }, beginAtZero: true } },
      },
    });
  }

  function renderAchievementChart(recentAchievements) {
    const counts = { submitted: 0, approved: 0, rejected: 0 };
    recentAchievements.forEach((a) => { if (counts[a.approval_status] !== undefined) counts[a.approval_status]++; });
    destroyChart("ach");
    charts.ach = new Chart(document.getElementById("achChart"), {
      type: "bar",
      data: {
        labels: ["Pending", "Approved", "Rejected"],
        datasets: [{ data: [counts.submitted, counts.approved, counts.rejected], backgroundColor: ["#C99A3E", "#5B8C5A", "#B5533C"], borderRadius: 4 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: "y",
        plugins: { legend: { display: false } },
        scales: { x: { grid: { color: "rgba(212,175,55,.08)" }, ticks: { color: "#8A867E" }, beginAtZero: true }, y: { grid: { display: false }, ticks: { color: "#8A867E" } } },
      },
    });
  }

  async function renderIncomeChart() {
    // Pull the 4 income-status counts directly so the chart reflects the
    // whole table, not just the dashboard's 5-item recent-achievements sample.
    destroyChart("income");
    const statuses = ["pending", "approved", "paid", "rejected"];
    let counts = [0, 0, 0, 0];
    try {
      const results = await Promise.all(
        statuses.map((s) => authedFetch(`/api/admin/income/?status=${s}&page_size=1`).then((d) => d.total).catch(() => 0))
      );
      counts = results;
    } catch { /* leave zeros if the endpoint isn't reachable */ }
    charts.income = new Chart(document.getElementById("incomeChart"), {
      type: "doughnut",
      data: { labels: ["Pending", "Approved", "Paid", "Rejected"], datasets: [{ data: counts, backgroundColor: ["#C99A3E", "#8B6914", "#5B8C5A", "#B5533C"], borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { color: "#B9B5AC", boxWidth: 10, font: { size: 11 } } } }, cutout: "60%" },
    });
  }

  function renderRecentMembers(members) {
    const el = document.getElementById("recentMembersWrap");
    if (!members.length) { el.innerHTML = `<div class="adm-empty">No members yet.</div>`; return; }
    const rows = members.map((m) => `
      <tr>
        <td><div class="adm-row-member">${memberAvatarHtml(m)}${escapeHtml(m.name)}</div></td>
        <td>${escapeHtml(m.member_id)}</td>
        <td>${escapeHtml(m.email)}</td>
        <td><span class="adm-badge ${escapeHtml(m.status)}">${escapeHtml(m.status)}</span></td>
      </tr>`).join("");
    el.innerHTML = `<table class="adm-table"><thead><tr><th>Member</th><th>ID</th><th>Email</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  function renderRecentAchievements(items) {
    const el = document.getElementById("recentAchievementsWrap");
    if (!items.length) { el.innerHTML = `<div class="adm-empty">No submissions yet.</div>`; return; }
    const rows = items.map((a) => `
      <tr>
        <td>${escapeHtml(a.member_name)}</td>
        <td>${escapeHtml(a.goal_name)}</td>
        <td>${formatDate(a.submitted_at)}</td>
        <td><span class="adm-badge ${escapeHtml(a.approval_status)}">${escapeHtml(a.approval_status)}</span></td>
      </tr>`).join("");
    el.innerHTML = `<table class="adm-table"><thead><tr><th>Member</th><th>Goal</th><th>Submitted</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  function renderRecentActivity(items) {
    const el = document.getElementById("recentActivityWrap");
    if (!items.length) { el.innerHTML = `<div class="adm-empty">No activity recorded yet.</div>`; return; }
    const rows = items.map((a) => `
      <tr>
        <td>${escapeHtml(a.actor_name || "System")}</td>
        <td>${escapeHtml(a.action.replace(/_/g, " "))}</td>
        <td>${escapeHtml(a.target_model || "—")} ${a.target_id ? "#" + escapeHtml(a.target_id) : ""}</td>
        <td>${formatDate(a.created_at)}</td>
      </tr>`).join("");
    el.innerHTML = `<table class="adm-table"><thead><tr><th>Admin</th><th>Action</th><th>Target</th><th>When</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  async function loadDashboard() {
    if (!hasPerm("view_reports")) {
      document.getElementById("admKpiGrid").innerHTML = `<div class="adm-empty" style="grid-column:1/-1;">You don't have permission to view the dashboard.</div>`;
      return;
    }
    try {
      const data = await authedFetch("/api/admin/dashboard/summary/");
      renderKpis(data.counts);
      renderStatusChart(data.counts.active_members, data.counts.inactive_members);
      renderGrowthChart(data.recent_members);
      renderAchievementChart(data.recent_achievements);
      renderRecentMembers(data.recent_members);
      renderRecentAchievements(data.recent_achievements);
      renderRecentActivity(data.recent_activity);
      renderIncomeChart();
    } catch (err) {
      document.getElementById("admKpiGrid").innerHTML = `<div class="adm-empty" style="grid-column:1/-1;">${escapeHtml(err.message)}</div>`;
    }
  }

  // ---------------------------------------------------------------------
  // Notifications (bell)
  // ---------------------------------------------------------------------

  async function refreshUnreadDot() {
    try {
      const data = await authedFetch("/api/notifications/?unread=1&page_size=1");
      const bell = document.getElementById("admBell");
      bell.classList.toggle("has-unread", (data.unread_count || 0) > 0);
    } catch { /* non-fatal -- bell just stays without a dot */ }
  }

  async function loadNotificationsPreview() {
    try {
      const data = await authedFetch("/api/notifications/?page_size=8");
      if (!data.results.length) { toast("No notifications yet."); return; }
      const items = data.results.map((n) => `
        <div style="padding:10px 0; border-bottom:1px solid var(--adm-line);">
          <div style="font-size:.85rem; ${n.is_read ? "" : "font-weight:600;"}">${escapeHtml(n.title)}</div>
          ${n.body ? `<div style="font-size:.76rem; color:var(--adm-gray); margin-top:2px;">${escapeHtml(n.body)}</div>` : ""}
          <div style="font-size:.68rem; color:var(--adm-gray); margin-top:3px;">${formatDate(n.created_at)}</div>
        </div>`).join("");
      openModal(`
        <h3>Notifications</h3>
        <div style="max-height:50vh; overflow-y:auto;">${items}</div>
        <div class="adm-modal-actions"><button class="adm-btn primary" id="closeNotifModal">Close</button></div>
      `);
      document.getElementById("closeNotifModal").onclick = closeModal;
      await authedFetch("/api/notifications/mark-all-read/", { method: "PUT", body: "{}" });
      refreshUnreadDot();
    } catch (err) {
      toast(err.message, "error");
    }
  }

  // ---------------------------------------------------------------------
  // Members list
  // ---------------------------------------------------------------------

  const memberState = { page: 1, search: "", status: "", role: "", ordering: "-created_at" };

  function statusBadge(status) { return `<span class="adm-badge ${escapeHtml(status)}">${escapeHtml(status)}</span>`; }
  function roleBadge(role) { return `<span class="adm-badge ${escapeHtml(role)}">${escapeHtml(role.replace("_", " "))}</span>`; }
  function rankBadge(rank) {
    if (!rank) return "—";
    const slug = `rank-${rank.toLowerCase().replace(/\s+/g, "-")}`;
    return `<span class="adm-badge ${escapeHtml(slug)}">${escapeHtml(rank)}</span>`;
  }
  function memberAvatarHtml(m) {
    if (m.profile_photo) {
      return `<img src="${proofUrl(m.profile_photo)}" alt="" class="ph" style="object-fit:cover;">`;
    }
    return `<div class="ph">${escapeHtml(initials(m.name))}</div>`;
  }

  // ---------------------------------------------------------------------
  // Shared member typeahead -- turns a text input + hidden id field into
  // a live-search "pick a member" widget. Used anywhere an admin needs
  // to choose a sponsor (Add/Edit Member, Reassign Sponsor) instead of
  // typing a raw internal ID from memory.
  // ---------------------------------------------------------------------

  function memberTypeaheadHtml(fieldId, label, placeholder, initialLabel, initialId) {
    return `
      <div class="adm-form-field">
        <label>${escapeHtml(label)}</label>
        <input class="adm-input" id="${fieldId}_display" placeholder="${escapeHtml(placeholder)}" autocomplete="off" value="${escapeHtml(initialLabel || "")}">
        <input type="hidden" id="${fieldId}_id" value="${escapeHtml(initialId || "")}">
        <div class="adm-search-dropdown full-width" id="${fieldId}_results"></div>
      </div>`;
  }

  function wireMemberTypeahead(fieldId, { excludeId, onPick } = {}) {
    const input = document.getElementById(`${fieldId}_display`);
    const hidden = document.getElementById(`${fieldId}_id`);
    const dropdown = document.getElementById(`${fieldId}_results`);
    let t;

    input.addEventListener("input", (e) => {
      hidden.value = ""; // typing invalidates whatever was previously picked
      clearTimeout(t);
      const q = e.target.value.trim();
      if (!q) { dropdown.classList.remove("open"); return; }
      t = setTimeout(async () => {
        try {
          const data = await authedFetch(`/api/admin/members/?search=${encodeURIComponent(q)}&page_size=8`);
          const results = data.results.filter((m) => String(m.id) !== String(excludeId));
          dropdown.innerHTML = results.length
            ? results.map((m) => `
                <div class="adm-search-item" data-id="${m.id}" data-name="${escapeHtml(m.name)}" data-member-id="${escapeHtml(m.member_id)}">
                  <div class="n">${escapeHtml(m.name)}</div>
                  <div class="m">${escapeHtml(m.member_id)} · ${escapeHtml(m.email)}</div>
                </div>`).join("")
            : `<div class="adm-search-empty">No matches.</div>`;
          dropdown.classList.add("open");
          dropdown.querySelectorAll("[data-id]").forEach((el) => {
            el.addEventListener("click", () => {
              hidden.value = el.dataset.id;
              input.value = `${el.dataset.name} (${el.dataset.memberId})`;
              dropdown.classList.remove("open");
              if (onPick) onPick(el.dataset.id, el.dataset.name);
            });
          });
        } catch (err) { toast(err.message, "error"); }
      }, 300);
    });

    document.addEventListener("click", (e) => {
      if (!e.target.closest(`#${fieldId}_display`) && !e.target.closest(`#${fieldId}_results`)) {
        dropdown.classList.remove("open");
      }
    });

    // "clear" support: if the field is emptied entirely, treat it as "no sponsor / root"
    input.addEventListener("blur", () => {
      if (!input.value.trim()) hidden.value = "";
    });
  }

  function memberTypeaheadValue(fieldId) {
    return document.getElementById(`${fieldId}_id`).value.trim();
  }

  function memberActionsCell(m) {
    const canEdit = hasPerm("edit_members");
    const canRemove = hasPerm("remove_members");
    const btns = [];
    btns.push(`<button class="icon-btn" title="View" data-view="${m.id}">👁</button>`);
    if (canEdit) btns.push(`<button class="icon-btn" title="Edit" data-edit="${m.id}">✎</button>`);
    if (canRemove) {
      if (m.status === "active") btns.push(`<button class="icon-btn" title="Deactivate" data-deactivate="${m.id}">⏸</button>`);
      else btns.push(`<button class="icon-btn" title="Reactivate" data-reactivate="${m.id}">▶</button>`);
      btns.push(`<button class="icon-btn danger" title="Delete" data-delete="${m.id}">🗑</button>`);
    }
    return `<div class="adm-actions-cell">${btns.join("")}</div>`;
  }

  function renderMembersTable(data) {
    const wrap = document.getElementById("membersTableWrap");
    if (!data.results.length) { wrap.innerHTML = `<div class="adm-empty">No members match these filters.</div>`; }
    else {
      const rows = data.results.map((m) => `
        <tr>
          <td><div class="adm-row-member">${memberAvatarHtml(m)}${escapeHtml(m.name)}</div></td>
          <td>${escapeHtml(m.member_id)}</td>
          <td>${escapeHtml(m.email)}</td>
          <td>${escapeHtml(m.mobile || "—")}</td>
          <td>${escapeHtml(m.sponsor_name || "—")}</td>
          <td>${roleBadge(m.role)}</td>
          <td>${rankBadge(m.rank)}</td>
          <td>${m.points_balance}</td>
          <td>${m.team_size}</td>
          <td>${statusBadge(m.status)}</td>
          <td>${formatDate(m.created_at)}</td>
          <td>${memberActionsCell(m)}</td>
        </tr>`).join("");
      wrap.innerHTML = `<table class="adm-table"><thead><tr>
        <th>Member</th><th>ID</th><th>Email</th><th>Mobile</th><th>Sponsor</th><th>Role</th><th>Rank</th><th>Points</th><th>Team</th><th>Status</th><th>Joined</th><th>Actions</th>
      </tr></thead><tbody>${rows}</tbody></table>`;
    }

    const totalPages = Math.max(data.total_pages, 1);
    document.getElementById("membersPagination").innerHTML = `
      <span>${data.total} member${data.total === 1 ? "" : "s"} — page ${data.page} of ${totalPages}</span>
      <div class="controls">
        <button class="adm-btn sm" id="membersPrev" ${data.page <= 1 ? "disabled" : ""}>← Prev</button>
        <button class="adm-btn sm" id="membersNext" ${data.page >= totalPages ? "disabled" : ""}>Next →</button>
      </div>`;
    const prevBtn = document.getElementById("membersPrev");
    const nextBtn = document.getElementById("membersNext");
    if (prevBtn) prevBtn.onclick = () => { memberState.page--; loadMembers(); };
    if (nextBtn) nextBtn.onclick = () => { memberState.page++; loadMembers(); };

    wrap.querySelectorAll("[data-view]").forEach((b) => b.onclick = () => openMemberDrawer(b.dataset.view));
    wrap.querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => openMemberForm(b.dataset.edit));
    wrap.querySelectorAll("[data-deactivate]").forEach((b) => b.onclick = () => deactivateMember(b.dataset.deactivate));
    wrap.querySelectorAll("[data-reactivate]").forEach((b) => b.onclick = () => reactivateMember(b.dataset.reactivate));
    wrap.querySelectorAll("[data-delete]").forEach((b) => b.onclick = () => deleteMember(b.dataset.delete));
  }

  async function loadMembers() {
    if (!hasPerm("view_members")) {
      document.getElementById("membersTableWrap").innerHTML = `<div class="adm-empty">You don't have permission to view members.</div>`;
      return;
    }
    const wrap = document.getElementById("membersTableWrap");
    wrap.innerHTML = `<div class="adm-loading">Loading members…</div>`;
    const params = new URLSearchParams({
      page: memberState.page, ordering: memberState.ordering,
      ...(memberState.search ? { search: memberState.search } : {}),
      ...(memberState.status ? { status: memberState.status } : {}),
      ...(memberState.role ? { role: memberState.role } : {}),
    });
    try {
      const data = await authedFetch(`/api/admin/members/?${params}`);
      renderMembersTable(data);
    } catch (err) {
      wrap.innerHTML = `<div class="adm-empty">${escapeHtml(err.message)}</div>`;
    }
  }

  function wireMemberToolbar() {
    let searchTimer;
    document.getElementById("memberSearch").addEventListener("input", (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { memberState.search = e.target.value.trim(); memberState.page = 1; loadMembers(); }, 350);
    });
    document.getElementById("memberStatusFilter").addEventListener("change", (e) => { memberState.status = e.target.value; memberState.page = 1; loadMembers(); });
    document.getElementById("memberRoleFilter").addEventListener("change", (e) => { memberState.role = e.target.value; memberState.page = 1; loadMembers(); });
    document.getElementById("memberSort").addEventListener("change", (e) => { memberState.ordering = e.target.value; memberState.page = 1; loadMembers(); });
    document.getElementById("addMemberBtn").addEventListener("click", () => openMemberForm(null));
  }

  // ---------------------------------------------------------------------
  // Add / edit member form
  // ---------------------------------------------------------------------

  async function openMemberForm(memberId) {
    const isEdit = !!memberId;
    let member = null;
    if (isEdit) {
      try { member = (await authedFetch(`/api/admin/members/${memberId}/`)).member; }
      catch (err) { toast(err.message, "error"); return; }
    }
    const canChangeRole = currentUser.role === "super_admin";
    openModal(`
      <h3>${isEdit ? "Edit Member" : "Add Member"}</h3>
      <div class="adm-form-field"><label>Name</label><input class="adm-input" id="fName" value="${escapeHtml(member?.name || "")}"></div>
      <div class="adm-form-field"><label>Email</label><input class="adm-input" id="fEmail" type="email" value="${escapeHtml(member?.email || "")}" ${isEdit ? "disabled" : ""}></div>
      ${isEdit ? "" : `<div class="adm-form-field"><label>Password</label><input class="adm-input" id="fPassword" type="password"></div>`}
      <div class="adm-form-field"><label>Mobile</label><input class="adm-input" id="fMobile" value="${escapeHtml(member?.mobile || "")}"></div>
      ${memberTypeaheadHtml("fParent", "Sponsor (optional)", "Search by name, ID, or email…", member?.parent ? `${member.sponsor_name || ""} (${member.parent})` : "", member?.parent || "")}
      ${canChangeRole ? `
      <div class="adm-form-field"><label>Role</label>
        <select class="adm-select" id="fRole">
          <option value="member" ${member?.role === "member" ? "selected" : ""}>Member</option>
          <option value="admin" ${member?.role === "admin" ? "selected" : ""}>Admin</option>
          <option value="super_admin" ${member?.role === "super_admin" ? "selected" : ""}>Super Admin</option>
        </select>
      </div>` : ""}
      <div class="adm-form-error" id="fError"></div>
      <div class="adm-modal-actions">
        <button class="adm-btn" id="fCancel">Cancel</button>
        <button class="adm-btn primary" id="fSubmit">${isEdit ? "Save Changes" : "Create Member"}</button>
      </div>
    `);
    wireMemberTypeahead("fParent", { excludeId: memberId });
    document.getElementById("fCancel").onclick = closeModal;
    document.getElementById("fSubmit").onclick = async () => {
      const errEl = document.getElementById("fError");
      errEl.classList.remove("show");
      const body = {
        name: document.getElementById("fName").value.trim(),
        mobile: document.getElementById("fMobile").value.trim(),
      };
      const parentVal = memberTypeaheadValue("fParent");
      if (parentVal) body.parent = parentVal;
      if (canChangeRole) body.role = document.getElementById("fRole").value;
      try {
        if (isEdit) {
          await authedFetch(`/api/admin/members/${memberId}/`, { method: "PATCH", body: JSON.stringify(body) });
          toast("Member updated.", "success");
        } else {
          body.email = document.getElementById("fEmail").value.trim();
          body.password = document.getElementById("fPassword").value;
          if (!body.email || !body.password) { errEl.textContent = "Email and password are required."; errEl.classList.add("show"); return; }
          await authedFetch("/api/admin/members/", { method: "POST", body: JSON.stringify(body) });
          toast("Member created.", "success");
        }
        closeModal();
        loadMembers();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.add("show");
      }
    };
  }

  async function deactivateMember(id) {
    const ok = await confirmDialog("Deactivate member?", "This blocks their login but keeps all history intact. They can be reactivated at any time.", "Deactivate", true);
    if (!ok) return;
    try {
      await authedFetch(`/api/admin/members/${id}/deactivate/`, { method: "POST", body: "{}" });
      toast("Member deactivated.", "success");
      loadMembers();
    } catch (err) { toast(err.message, "error"); }
  }
  async function reactivateMember(id) {
    try {
      await authedFetch(`/api/admin/members/${id}/reactivate/`, { method: "POST", body: "{}" });
      toast("Member reactivated.", "success");
      loadMembers();
    } catch (err) { toast(err.message, "error"); }
  }
  async function deleteMember(id) {
    const ok = await confirmDialog("Delete member permanently?", "This cannot be undone. Members who still have downline must be reassigned first.", "Delete", true);
    if (!ok) return;
    try {
      await authedFetch(`/api/admin/members/${id}/`, { method: "DELETE" });
      toast("Member deleted.", "success");
      loadMembers();
    } catch (err) { toast(err.message, "error"); }
  }

  // ---------------------------------------------------------------------
  // Member detail drawer
  // ---------------------------------------------------------------------

  const DRAWER_TABS = ["overview", "network", "goals", "achievements", "points", "income", "activity"];

  function openDrawer() {
    document.getElementById("drawerOverlay").classList.add("open");
    document.getElementById("memberDrawer").classList.add("open");
  }
  function closeDrawer() {
    document.getElementById("drawerOverlay").classList.remove("open");
    document.getElementById("memberDrawer").classList.remove("open");
  }
  document.getElementById("drawerCloseBtn").addEventListener("click", closeDrawer);
  document.getElementById("drawerOverlay").addEventListener("click", closeDrawer);

  async function openMemberDrawer(id) {
    const content = document.getElementById("drawerContent");
    content.innerHTML = `<div class="adm-loading">Loading member…</div>`;
    openDrawer();
    let member;
    try { member = (await authedFetch(`/api/admin/members/${id}/`)).member; }
    catch (err) { content.innerHTML = `<div class="adm-empty">${escapeHtml(err.message)}</div>`; return; }

    content.innerHTML = `
      <div class="adm-drawer-head">
        <div class="ph">${escapeHtml(initials(member.name))}</div>
        <div>
          <h2>${escapeHtml(member.name)}</h2>
          <div class="sub">${escapeHtml(member.member_id)} · ${escapeHtml(member.email)}</div>
        </div>
      </div>
      <div class="adm-tabs" id="drawerTabs">
        ${DRAWER_TABS.map((t, i) => `<button class="adm-tab ${i === 0 ? "active" : ""}" data-tab="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join("")}
      </div>
      ${DRAWER_TABS.map((t, i) => `<div class="adm-tab-panel ${i === 0 ? "active" : ""}" id="tab-${t}"><div class="adm-loading">Loading…</div></div>`).join("")}
    `;

    document.querySelectorAll("#drawerTabs .adm-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#drawerTabs .adm-tab").forEach((b) => b.classList.remove("active"));
        document.querySelectorAll(".adm-tab-panel").forEach((p) => p.classList.remove("active"));
        btn.classList.add("active");
        document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
      });
    });

    renderOverviewTab(member);
    loadNetworkTab(member.id);
    loadGoalsTab();
    loadAchievementsTab(member.id);
    loadPointsTab(member.id);
    loadIncomeTab(member.id);
    loadActivityTab(member.id);
  }

  function renderOverviewTab(member) {
    const canUploadPhoto = member.id === currentUser.id || hasPerm("upload_photos") || currentUser.role === "super_admin";
    const canDeletePhoto = member.id === currentUser.id || hasPerm("delete_photos") || currentUser.role === "super_admin";
    const photoUrl = member.profile_photo ? proofUrl(member.profile_photo) : null;

    document.getElementById("tab-overview").innerHTML = `
      <div style="display:flex; align-items:center; gap:16px; margin-bottom:20px;">
        ${photoUrl
          ? `<img src="${photoUrl}" alt="" style="width:72px; height:72px; border-radius:50%; object-fit:cover; border:1px solid var(--adm-line-strong);">`
          : `<div style="width:72px; height:72px; border-radius:50%; background:var(--gold); color:var(--charcoal-deep); display:grid; place-items:center; font-weight:700; font-size:1.3rem;">${escapeHtml(initials(member.name))}</div>`}
        <div>
          ${canUploadPhoto ? `<input class="adm-input" id="memberPhotoUpload" type="file" accept="image/jpeg,image/png,image/webp" style="font-size:.76rem;">` : ""}
          <div style="display:flex; gap:10px; align-items:center; margin-top:6px;">
            ${canUploadPhoto ? `<span style="font-size:.72rem; color:var(--adm-gray);">Selecting a file uploads it immediately.</span>` : ""}
            ${photoUrl && canDeletePhoto ? `<button class="adm-btn sm danger" id="memberPhotoRemove" type="button">Remove Photo</button>` : ""}
          </div>
        </div>
      </div>
      <div class="adm-kv-grid">
        <div class="kv"><div class="k">Member ID</div><div class="v">${escapeHtml(member.member_id)}</div></div>
        <div class="kv"><div class="k">Status</div><div class="v">${statusBadge(member.status)}</div></div>
        <div class="kv"><div class="k">Email</div><div class="v">${escapeHtml(member.email)}</div></div>
        <div class="kv"><div class="k">Mobile</div><div class="v">${escapeHtml(member.mobile || "—")}</div></div>
        <div class="kv"><div class="k">Sponsor</div><div class="v">${escapeHtml(member.sponsor_name || "—")}</div></div>
        <div class="kv"><div class="k">Role</div><div class="v">${roleBadge(member.role)}</div></div>
        <div class="kv"><div class="k">Rank</div><div class="v">${rankBadge(member.rank)}</div></div>
        <div class="kv"><div class="k">Points Balance</div><div class="v">${member.points_balance}</div></div>
        <div class="kv"><div class="k">Total Income Paid</div><div class="v">₹${member.total_income_paid}</div></div>
        <div class="kv"><div class="k">Joined</div><div class="v">${formatDate(member.created_at)}</div></div>
        <div class="kv"><div class="k">Direct Team</div><div class="v">${member.team_size}</div></div>
      </div>
      <div class="adm-modal-actions" style="justify-content:flex-start; margin-top:18px;">
        ${hasPerm("edit_members") ? `<button class="adm-btn primary sm" id="drawerEditBtn">Edit Member</button>` : ""}
        ${hasPerm("edit_hierarchy") ? `<button class="adm-btn sm" id="drawerReassignBtn">Reassign Sponsor</button>` : ""}
      </div>
    `;
    const editBtn = document.getElementById("drawerEditBtn");
    if (editBtn) editBtn.onclick = () => openMemberForm(member.id);
    const reassignBtn = document.getElementById("drawerReassignBtn");
    if (reassignBtn) reassignBtn.onclick = () => openReassignSponsorModal(member);

    const photoInput = document.getElementById("memberPhotoUpload");
    if (photoInput) {
      photoInput.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const form = new FormData();
        form.append("photo", file);
        try {
          await authedFetch(`/api/members/${member.id}/photo/`, { method: "POST", body: form });
          toast("Photo updated.", "success");
          openMemberDrawer(member.id); // refresh drawer with the new photo
          loadMembers();
        } catch (err) { toast(err.message, "error"); }
      });
    }
    const removeBtn = document.getElementById("memberPhotoRemove");
    if (removeBtn) {
      removeBtn.onclick = async () => {
        const ok = await confirmDialog("Remove this photo?", "This deletes the uploaded photo. It can be re-uploaded at any time.", "Remove", true);
        if (!ok) return;
        try {
          await authedFetch(`/api/members/${member.id}/photo/`, { method: "DELETE" });
          toast("Photo removed.", "success");
          openMemberDrawer(member.id);
          loadMembers();
        } catch (err) { toast(err.message, "error"); }
      };
    }
  }

  function openReassignSponsorModal(member) {
    openModal(`
      <h3>Reassign Sponsor</h3>
      <p style="color:var(--adm-text-dim); font-size:.85rem;">Changing <strong>${escapeHtml(member.name)}</strong>'s sponsor updates the MLM hierarchy. This cannot create a circular relationship — the server will reject that.</p>
      ${memberTypeaheadHtml("fNewSponsor", "New sponsor", "Search by name, ID, or email… (blank = no sponsor / root)", "", "")}
      <div class="adm-form-error" id="fReassignError"></div>
      <div class="adm-modal-actions">
        <button class="adm-btn" id="fReassignCancel">Cancel</button>
        <button class="adm-btn primary" id="fReassignSubmit">Reassign</button>
      </div>
    `);
    wireMemberTypeahead("fNewSponsor", { excludeId: member.id });
    document.getElementById("fReassignCancel").onclick = closeModal;
    document.getElementById("fReassignSubmit").onclick = async () => {
      const val = memberTypeaheadValue("fNewSponsor");
      const errEl = document.getElementById("fReassignError");
      try {
        await authedFetch(`/api/admin/members/${member.id}/reassign-sponsor/`, {
          method: "POST", body: JSON.stringify({ sponsor_id: val || null }),
        });
        toast("Sponsor reassigned.", "success");
        closeModal();
        openMemberDrawer(member.id); // refresh drawer with new sponsor
        loadMembers();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.add("show");
      }
    };
  }

  async function loadNetworkTab(id) {
    const el = document.getElementById("tab-network");
    try {
      const data = await authedFetch(`/api/members/${id}/hierarchy/?depth=1`);
      const kids = data.tree.children || [];
      el.innerHTML = `
        <p style="color:var(--adm-text-dim); font-size:.85rem; margin-bottom:14px;">
          ${data.parent ? `Sponsor: <strong>${escapeHtml(data.parent.name)}</strong>` : "No sponsor (root of their branch)"}
          — ${kids.length} direct referral${kids.length === 1 ? "" : "s"}.
          The full interactive network view lives under <strong>MLM Network</strong> in the sidebar.
        </p>
        ${kids.length ? `<table class="adm-table"><thead><tr><th>Name</th><th>ID</th><th>Status</th><th>Points</th></tr></thead><tbody>
          ${kids.map((k) => `<tr><td>${escapeHtml(k.name)}</td><td>${escapeHtml(k.member_id)}</td><td>${statusBadge(k.status)}</td><td>${k.points_balance}</td></tr>`).join("")}
        </tbody></table>` : `<div class="adm-empty">No direct referrals yet.</div>`}
      `;
    } catch (err) {
      el.innerHTML = `<div class="adm-empty">${escapeHtml(err.message)}</div>`;
    }
  }

  async function loadGoalsTab() {
    // Goals aren't per-member assigned in the current model (they're
    // global, opt-in via achievement submission) -- show active goals so
    // an admin can see what this member could still work toward.
    const el = document.getElementById("tab-goals");
    try {
      const data = await authedFetch(`/api/goals/?status=active&page_size=50`);
      el.innerHTML = data.results.length ? `<table class="adm-table"><thead><tr><th>Goal</th><th>Target</th><th>Points</th><th>Income</th></tr></thead><tbody>
        ${data.results.map((g) => `<tr><td>${escapeHtml(g.name)}</td><td>${escapeHtml(g.target)}</td><td>${g.points}</td><td>₹${g.income_amount}</td></tr>`).join("")}
      </tbody></table>` : `<div class="adm-empty">No active goals right now.</div>`;
    } catch (err) {
      el.innerHTML = `<div class="adm-empty">${escapeHtml(err.message)}</div>`;
    }
  }

  async function loadAchievementsTab(id) {
    const el = document.getElementById("tab-achievements");
    try {
      const data = await authedFetch(`/api/achievements/?member=${id}&page_size=50`);
      el.innerHTML = data.results.length ? `<table class="adm-table"><thead><tr><th>Goal</th><th>Progress</th><th>Status</th><th>Submitted</th></tr></thead><tbody>
        ${data.results.map((a) => `<tr><td>${escapeHtml(a.goal_name)}</td><td>${escapeHtml(a.progress)}</td><td>${statusBadge(a.approval_status)}</td><td>${formatDate(a.submitted_at)}</td></tr>`).join("")}
      </tbody></table>` : `<div class="adm-empty">No achievement submissions yet.</div>`;
    } catch (err) {
      el.innerHTML = `<div class="adm-empty">${escapeHtml(err.message)}</div>`;
    }
  }

  async function loadPointsTab(id) {
    const el = document.getElementById("tab-points");
    try {
      const data = await authedFetch(`/api/members/${id}/points/history/?page_size=50`);
      el.innerHTML = `
        <div class="adm-kv-grid" style="grid-template-columns:1fr;"><div class="kv"><div class="k">Current Balance</div><div class="v">${data.balance}</div></div></div>
        ${data.results.length ? `<table class="adm-table" style="margin-top:14px;"><thead><tr><th>Points</th><th>Reason</th><th>Date</th></tr></thead><tbody>
          ${data.results.map((t) => `<tr><td>${t.points > 0 ? "+" : ""}${t.points}</td><td>${escapeHtml(t.reason)}</td><td>${formatDate(t.created_at)}</td></tr>`).join("")}
        </tbody></table>` : `<div class="adm-empty">No point transactions yet.</div>`}
      `;
    } catch (err) {
      el.innerHTML = `<div class="adm-empty">${escapeHtml(err.message)}</div>`;
    }
  }

  async function loadIncomeTab(id) {
    const el = document.getElementById("tab-income");
    try {
      const data = await authedFetch(`/api/members/${id}/income/history/?page_size=50`);
      el.innerHTML = data.results.length ? `<table class="adm-table"><thead><tr><th>Goal</th><th>Amount</th><th>Status</th><th>Created</th></tr></thead><tbody>
        ${data.results.map((r) => `<tr><td>${escapeHtml(r.goal_name || "—")}</td><td>₹${r.amount}</td><td>${statusBadge(r.status)}</td><td>${formatDate(r.created_at)}</td></tr>`).join("")}
      </tbody></table>` : `<div class="adm-empty">No income records yet.</div>`;
    } catch (err) {
      el.innerHTML = `<div class="adm-empty">${escapeHtml(err.message)}</div>`;
    }
  }

  async function loadActivityTab(id) {
    const el = document.getElementById("tab-activity");
    if (!hasPerm("view_audit_logs")) { el.innerHTML = `<div class="adm-empty">You don't have permission to view activity logs.</div>`; return; }
    try {
      const data = await authedFetch(`/api/admin/audit-logs/?page_size=50`);
      const relevant = data.results.filter((a) => String(a.target_id) === String(id));
      el.innerHTML = relevant.length ? `<table class="adm-table"><thead><tr><th>Action</th><th>By</th><th>When</th></tr></thead><tbody>
        ${relevant.map((a) => `<tr><td>${escapeHtml(a.action.replace(/_/g, " "))}</td><td>${escapeHtml(a.actor_name || "System")}</td><td>${formatDate(a.created_at)}</td></tr>`).join("")}
      </tbody></table>` : `<div class="adm-empty">No recorded activity for this member yet.</div>`;
    } catch (err) {
      el.innerHTML = `<div class="adm-empty">${escapeHtml(err.message)}</div>`;
    }
  }

  // ---------------------------------------------------------------------
  // MLM Network (interactive flow chart)
  // ---------------------------------------------------------------------

  const NODE_W = 190, NODE_H = 114, H_GAP = 46, V_GAP = 90;

  const netState = {
    rootId: null,
    dataById: new Map(),   // id -> node datum {id, member_id, name, status, points_balance, profile_photo, has_children, children: null|[]}
    levelFilter: 0,        // 0 = all / manual expand; N = auto-expand N levels from root
    statusFilter: "",
    zoomBehavior: null,
    svgSel: null,
    highlightId: null,
  };

  function netDatumFromApiNode(apiNode) {
    return {
      id: apiNode.id,
      member_id: apiNode.member_id,
      name: apiNode.name,
      status: apiNode.status,
      points_balance: apiNode.points_balance,
      rank: apiNode.rank,
      profile_photo: apiNode.profile_photo,
      has_children: apiNode.has_children,
      team_direct: Array.isArray(apiNode.children) ? apiNode.children.length : null,
      team_total: apiNode.team_total != null ? apiNode.team_total : null,
      children: Array.isArray(apiNode.children) ? apiNode.children.map(netDatumFromApiNode) : null,
    };
  }

  function netRegisterAll(node) {
    netState.dataById.set(node.id, node);
    (node.children || []).forEach(netRegisterAll);
  }

  async function loadNetworkRoots() {
    const sel = document.getElementById("networkRootSelect");
    try {
      const data = await authedFetch("/api/admin/members/?root_only=1&page_size=50&ordering=-created_at");
      if (!data.results.length) {
        sel.innerHTML = `<option value="">No root members found</option>`;
        return;
      }
      sel.innerHTML = data.results.map((m) => `<option value="${m.id}">${escapeHtml(m.name)} (${escapeHtml(m.member_id)})</option>`).join("");
      sel.value = String(data.results[0].id);
      await setNetworkRoot(data.results[0].id);
    } catch (err) {
      sel.innerHTML = `<option value="">${escapeHtml(err.message)}</option>`;
    }
  }

  async function setNetworkRoot(id, depth) {
    document.getElementById("networkLoading").style.display = "flex";
    try {
      const useDepth = depth != null ? depth : (netState.levelFilter || 2);
      const data = await authedFetch(`/api/members/${id}/hierarchy/?depth=${useDepth}`);
      netState.rootId = Number(id);
      netState.dataById.clear();
      const root = netDatumFromApiNode(data.tree);
      netRegisterAll(root);
      renderNetwork(true);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      document.getElementById("networkLoading").style.display = "none";
    }
  }

  async function expandNetworkNode(id) {
    const node = netState.dataById.get(id);
    if (!node) return;
    if (node.children === null) {
      // Not loaded yet -- lazy fetch one level from the server.
      try {
        const data = await authedFetch(`/api/members/${id}/hierarchy/?depth=1`);
        const fresh = netDatumFromApiNode(data.tree);
        node.children = fresh.children || [];
        node.children.forEach((c) => netState.dataById.set(c.id, c));
      } catch (err) {
        toast(err.message, "error");
        return;
      }
    } else {
      // Already loaded -- this is a manual collapse toggle.
      node._collapsed = !node._collapsed;
      renderNetwork(false);
      return;
    }
    node._collapsed = false;
    renderNetwork(false);
  }

  function visibleChildren(node) {
    if (!node.children) return null;
    if (node._collapsed) return null;
    return node.children;
  }

  function renderNetwork(fit) {
    const root = netState.dataById.get(netState.rootId);
    if (!root) return;
    const wrap = document.getElementById("networkCanvasWrap");
    const width = wrap.clientWidth || 900;

    const hierarchyRoot = d3.hierarchy(root, (d) => visibleChildren(d));
    const treeLayout = d3.tree().nodeSize([NODE_W + H_GAP, NODE_H + V_GAP]);
    treeLayout(hierarchyRoot);

    const svg = d3.select("#networkSvg");
    svg.selectAll("*").remove();
    netState.svgSel = svg;

    // One shared circular clip-path, reused by every node's photo <image> --
    // each node group has its own transform, so this single definition
    // clips correctly for all of them without needing a unique id per node.
    svg.append("defs").append("clipPath").attr("id", "netAvatarClip")
      .append("circle").attr("cx", 26).attr("cy", 26).attr("r", 15);

    const g = svg.append("g").attr("class", "viewport");

    const zoom = d3.zoom().scaleExtent([0.25, 2]).on("zoom", (event) => {
      g.attr("transform", event.transform);
    });
    svg.call(zoom);
    netState.zoomBehavior = zoom;
    wrap.addEventListener("mousedown", () => wrap.classList.add("grabbing"));
    wrap.addEventListener("mouseup", () => wrap.classList.remove("grabbing"));

    // Links
    g.selectAll(".net-link")
      .data(hierarchyRoot.links())
      .join("path")
      .attr("class", "net-link")
      .attr("d", d3.linkVertical().x((d) => d.x).y((d) => d.y + NODE_H / 2));

    // Nodes
    const nodeSel = g.selectAll(".net-node")
      .data(hierarchyRoot.descendants())
      .join("g")
      .attr("class", (d) => {
        let cls = "net-node";
        if (netState.highlightId === d.data.id) cls += " is-highlight";
        if (netState.statusFilter && d.data.status !== netState.statusFilter) cls += " is-dim";
        return cls;
      })
      .attr("transform", (d) => `translate(${d.x - NODE_W / 2}, ${d.y})`);

    nodeSel.append("rect").attr("class", "card-bg").attr("width", NODE_W).attr("height", NODE_H).attr("rx", 12);

    nodeSel.append("circle").attr("class", "n-avatar-bg").attr("cx", 26).attr("cy", 26).attr("r", 15);
    nodeSel.append("text").attr("class", "n-avatar-txt").attr("x", 26).attr("y", 27).text((d) => initials(d.data.name));
    nodeSel.filter((d) => d.data.profile_photo).each(function (d) {
      d3.select(this).append("image")
        .attr("href", proofUrl(d.data.profile_photo))
        .attr("x", 11).attr("y", 11).attr("width", 30).attr("height", 30)
        .attr("clip-path", "url(#netAvatarClip)")
        .attr("preserveAspectRatio", "xMidYMid slice");
    });

    nodeSel.append("circle")
      .attr("class", "n-status-dot")
      .attr("cx", NODE_W - 14).attr("cy", 14).attr("r", 5)
      .attr("fill", (d) => (d.data.status === "active" ? "#5B8C5A" : "#B5533C"));

    nodeSel.append("text").attr("class", "n-name").attr("x", 48).attr("y", 22).text((d) => truncate(d.data.name, 17));
    nodeSel.append("text").attr("class", "n-id").attr("x", 48).attr("y", 36).text((d) => d.data.member_id);

    nodeSel.append("text").attr("class", "n-rank").attr("x", 14).attr("y", 56)
      .text((d) => (d.data.rank || "").toUpperCase());

    nodeSel.append("text").attr("class", "n-meta").attr("x", 14).attr("y", 76)
      .text((d) => `⭐ ${d.data.points_balance ?? 0} pts`);
    // Total downline (whole subtree), with the direct-referral count as a
    // hover tooltip -- the card only has room for one number, and "total
    // team" is what an admin scanning the chart actually wants to see.
    nodeSel.append("text").attr("class", "n-meta").attr("x", 14).attr("y", 94)
      .text((d) => `👥 ${d.data.team_total != null ? d.data.team_total : (d.data.team_direct != null ? d.data.team_direct : "?")} team`)
      .append("title")
      .text((d) => `${d.data.team_direct != null ? d.data.team_direct : "?"} direct referral${d.data.team_direct === 1 ? "" : "s"}`);

    // Expand/collapse affordance -- separate click target from the card body.
    // A larger invisible circle sits behind the visible one purely to widen
    // the tappable area on touch devices (WCAG/platform guidance is ~44px
    // touch targets; the visible 10px-radius dot stays small and clean).
    nodeSel.filter((d) => d.data.has_children).each(function (d) {
      const grp = d3.select(this).append("g")
        .attr("class", "net-expand")
        .attr("transform", `translate(${NODE_W / 2}, ${NODE_H + 2})`);
      grp.append("circle").attr("r", 20).attr("fill", "transparent").attr("pointer-events", "all");
      grp.append("circle").attr("r", 10);
      grp.append("text").text(d.data._collapsed || !d.data.children ? "+" : "−");
      grp.on("click", (event) => {
        event.stopPropagation();
        expandNetworkNode(d.data.id);
      });
    });

    // Card body click -> open member drawer
    nodeSel.on("click", (event, d) => {
      if (event.target.closest(".net-expand")) return;
      openMemberDrawer(d.data.id);
    });

    if (fit) fitNetworkToScreen();
  }

  function truncate(str, n) { return str && str.length > n ? str.slice(0, n - 1) + "…" : str; }

  function fitNetworkToScreen() {
    const wrap = document.getElementById("networkCanvasWrap");
    const svg = netState.svgSel;
    if (!svg || !netState.zoomBehavior) return;
    const g = svg.select(".viewport").node();
    if (!g) return;
    const bbox = g.getBBox();
    if (!bbox.width || !bbox.height) return;
    const width = wrap.clientWidth, height = wrap.clientHeight;
    const scale = Math.min(0.9 * width / bbox.width, 0.9 * height / bbox.height, 1.4);
    const tx = width / 2 - scale * (bbox.x + bbox.width / 2);
    const ty = 40 - scale * bbox.y;
    svg.transition().duration(400).call(netState.zoomBehavior.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  }

  function wireNetworkToolbar() {
    document.getElementById("networkRootSelect").addEventListener("change", (e) => {
      if (e.target.value) setNetworkRoot(e.target.value);
    });
    document.getElementById("networkLevelFilter").addEventListener("change", (e) => {
      netState.levelFilter = Number(e.target.value);
      if (netState.rootId) setNetworkRoot(netState.rootId, netState.levelFilter || 2);
    });
    document.getElementById("networkStatusFilter").addEventListener("change", (e) => {
      netState.statusFilter = e.target.value;
      renderNetwork(false);
    });
    document.getElementById("networkZoomIn").addEventListener("click", () => {
      if (netState.svgSel && netState.zoomBehavior) netState.svgSel.transition().call(netState.zoomBehavior.scaleBy, 1.25);
    });
    document.getElementById("networkZoomOut").addEventListener("click", () => {
      if (netState.svgSel && netState.zoomBehavior) netState.svgSel.transition().call(netState.zoomBehavior.scaleBy, 0.8);
    });
    document.getElementById("networkFit").addEventListener("click", fitNetworkToScreen);

    let searchTimer;
    const searchInput = document.getElementById("networkSearch");
    const resultsBox = document.getElementById("networkSearchResults");
    searchInput.addEventListener("input", (e) => {
      clearTimeout(searchTimer);
      const q = e.target.value.trim();
      if (!q) { resultsBox.classList.remove("open"); return; }
      searchTimer = setTimeout(async () => {
        try {
          const data = await authedFetch(`/api/admin/members/?search=${encodeURIComponent(q)}&page_size=6`);
          if (!data.results.length) {
            resultsBox.innerHTML = `<div class="adm-search-empty">No matches.</div>`;
          } else {
            resultsBox.innerHTML = data.results.map((m) => `
              <div class="adm-search-item" data-id="${m.id}">
                <div class="n">${escapeHtml(m.name)}</div>
                <div class="m">${escapeHtml(m.member_id)} · ${escapeHtml(m.email)}</div>
              </div>`).join("");
            resultsBox.querySelectorAll("[data-id]").forEach((el) => {
              el.addEventListener("click", () => navigateNetworkToMember(el.dataset.id));
            });
          }
          resultsBox.classList.add("open");
        } catch (err) { toast(err.message, "error"); }
      }, 320);
    });
    document.addEventListener("click", (e) => {
      if (!e.target.closest("#networkSearch") && !e.target.closest("#networkSearchResults")) resultsBox.classList.remove("open");
    });
  }

  async function navigateNetworkToMember(id) {
    document.getElementById("networkSearchResults").classList.remove("open");
    document.getElementById("networkSearch").value = "";
    document.getElementById("networkLoading").style.display = "flex";
    try {
      const { ancestors } = await authedFetch(`/api/admin/members/${id}/ancestors/`);
      const rootId = ancestors.length ? ancestors[0].id : Number(id);

      // Switch the tree root to the true top of this member's branch if needed.
      if (netState.rootId !== rootId) {
        const sel = document.getElementById("networkRootSelect");
        if ([...sel.options].some((o) => o.value === String(rootId))) sel.value = String(rootId);
        await setNetworkRoot(rootId, 1);
      }
      // Walk down the ancestor chain, expanding each node so the match becomes visible.
      for (const anc of ancestors) {
        const node = netState.dataById.get(anc.id);
        if (node && (node.children === null || node._collapsed)) {
          await expandNetworkNode(anc.id);
        }
      }
      netState.highlightId = Number(id);
      renderNetwork(false);
      setTimeout(centerOnHighlighted, 150);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      document.getElementById("networkLoading").style.display = "none";
    }
  }

  function centerOnHighlighted() {
    const svg = netState.svgSel;
    if (!svg || !netState.zoomBehavior) return;
    const target = svg.select(".net-node.is-highlight").node();
    if (!target) return;
    const wrap = document.getElementById("networkCanvasWrap");
    const transform = target.getAttribute("transform");
    const match = /translate\(([-\d.]+),\s*([-\d.]+)\)/.exec(transform);
    if (!match) return;
    const x = parseFloat(match[1]) + NODE_W / 2, y = parseFloat(match[2]) + NODE_H / 2;
    const width = wrap.clientWidth, height = wrap.clientHeight;
    svg.transition().duration(450).call(
      netState.zoomBehavior.transform,
      d3.zoomIdentity.translate(width / 2 - x, height / 2 - y).scale(1)
    );
  }

  async function loadNetworkSection() {
    if (!hasPerm("view_hierarchy")) {
      document.getElementById("networkCanvasWrap").innerHTML = `<div class="adm-empty">You don't have permission to view the network.</div>`;
      return;
    }
    if (netState.rootId === null) {
      await loadNetworkRoots();
    } else {
      renderNetwork(false);
    }
  }

  // ---------------------------------------------------------------------
  // Goals
  // ---------------------------------------------------------------------

  let goalStatusFilterVal = "";

  function goalActionsCell(g) {
    const btns = [];
    if (hasPerm("edit_goals")) {
      btns.push(`<button class="icon-btn" title="Edit" data-goal-edit="${g.id}">✎</button>`);
      if (g.status !== "archived") {
        const nextStatus = g.status === "active" ? "inactive" : "active";
        btns.push(`<button class="icon-btn" title="${nextStatus === "active" ? "Activate" : "Deactivate"}" data-goal-toggle="${g.id}" data-next="${nextStatus}">${nextStatus === "active" ? "▶" : "⏸"}</button>`);
        btns.push(`<button class="icon-btn danger" title="Archive" data-goal-archive="${g.id}">🗄</button>`);
      }
    }
    return `<div class="adm-actions-cell">${btns.join("")}</div>`;
  }

  async function loadGoals() {
    if (!hasPerm("view_goals")) {
      document.getElementById("goalsTableWrap").innerHTML = `<div class="adm-empty">You don't have permission to view goals.</div>`;
      return;
    }
    const wrap = document.getElementById("goalsTableWrap");
    wrap.innerHTML = `<div class="adm-loading">Loading goals…</div>`;
    try {
      const params = new URLSearchParams({ page_size: 50, ...(goalStatusFilterVal ? { status: goalStatusFilterVal } : {}) });
      const data = await authedFetch(`/api/goals/?${params}`);
      if (!data.results.length) { wrap.innerHTML = `<div class="adm-empty">No goals yet.</div>`; return; }
      const rows = data.results.map((g) => `
        <tr>
          <td>${escapeHtml(g.name)}</td>
          <td>${escapeHtml(g.target)}</td>
          <td>${g.points}</td>
          <td>₹${g.income_amount}</td>
          <td>${g.start_date ? formatDate(g.start_date) : "—"}</td>
          <td>${g.end_date ? formatDate(g.end_date) : "—"}</td>
          <td><span class="adm-badge ${g.status === "active" ? "active" : g.status === "archived" ? "rejected" : "pending"}">${escapeHtml(g.status)}</span></td>
          <td>${g.participants_count}</td>
          <td>${g.completed_count}</td>
          <td>${goalActionsCell(g)}</td>
        </tr>`).join("");
      wrap.innerHTML = `<table class="adm-table"><thead><tr>
        <th>Name</th><th>Target</th><th>Points</th><th>Income</th><th>Start</th><th>End</th><th>Status</th><th>Participants</th><th>Completed</th><th>Actions</th>
      </tr></thead><tbody>${rows}</tbody></table>`;

      wrap.querySelectorAll("[data-goal-edit]").forEach((b) => b.onclick = () => openGoalForm(b.dataset.goalEdit));
      wrap.querySelectorAll("[data-goal-toggle]").forEach((b) => b.onclick = () => setGoalStatus(b.dataset.goalToggle, b.dataset.next));
      wrap.querySelectorAll("[data-goal-archive]").forEach((b) => b.onclick = () => archiveGoal(b.dataset.goalArchive));
    } catch (err) {
      wrap.innerHTML = `<div class="adm-empty">${escapeHtml(err.message)}</div>`;
    }
  }

  async function openGoalForm(goalId) {
    const isEdit = !!goalId;
    let goal = null;
    if (isEdit) {
      try { goal = (await authedFetch(`/api/goals/${goalId}/`)).goal; }
      catch (err) { toast(err.message, "error"); return; }
    }
    openModal(`
      <h3>${isEdit ? "Edit Goal" : "Create Goal"}</h3>
      <div class="adm-form-field"><label>Name</label><input class="adm-input" id="gName" value="${escapeHtml(goal?.name || "")}"></div>
      <div class="adm-form-field"><label>Description</label><textarea class="adm-input" id="gDesc" rows="3">${escapeHtml(goal?.description || "")}</textarea></div>
      <div class="adm-form-field"><label>Target</label><input class="adm-input" id="gTarget" type="number" step="0.01" value="${goal?.target ?? 0}"></div>
      <div class="adm-form-field"><label>Points reward</label><input class="adm-input" id="gPoints" type="number" value="${goal?.points ?? 0}"></div>
      <div class="adm-form-field"><label>Income reward (₹)</label><input class="adm-input" id="gIncome" type="number" step="0.01" value="${goal?.income_amount ?? 0}"></div>
      <div class="adm-form-field"><label>Start date</label><input class="adm-input" id="gStart" type="date" value="${goal?.start_date || ""}"></div>
      <div class="adm-form-field"><label>End date</label><input class="adm-input" id="gEnd" type="date" value="${goal?.end_date || ""}"></div>
      ${isEdit ? `<div class="adm-form-field"><label>Status</label>
        <select class="adm-select" id="gStatus">
          <option value="active" ${goal.status === "active" ? "selected" : ""}>Active</option>
          <option value="inactive" ${goal.status === "inactive" ? "selected" : ""}>Inactive</option>
          <option value="archived" ${goal.status === "archived" ? "selected" : ""}>Archived</option>
        </select>
      </div>` : ""}
      <div class="adm-form-error" id="gError"></div>
      <div class="adm-modal-actions">
        <button class="adm-btn" id="gCancel">Cancel</button>
        <button class="adm-btn primary" id="gSubmit">${isEdit ? "Save Changes" : "Create Goal"}</button>
      </div>
    `);
    document.getElementById("gCancel").onclick = closeModal;
    document.getElementById("gSubmit").onclick = async () => {
      const errEl = document.getElementById("gError");
      const body = {
        name: document.getElementById("gName").value.trim(),
        description: document.getElementById("gDesc").value.trim(),
        target: document.getElementById("gTarget").value,
        points: document.getElementById("gPoints").value,
        income_amount: document.getElementById("gIncome").value,
        start_date: document.getElementById("gStart").value || null,
        end_date: document.getElementById("gEnd").value || null,
      };
      if (isEdit) body.status = document.getElementById("gStatus").value;
      if (!body.name) { errEl.textContent = "Name is required."; errEl.classList.add("show"); return; }
      try {
        if (isEdit) await authedFetch(`/api/goals/${goalId}/`, { method: "PATCH", body: JSON.stringify(body) });
        else await authedFetch("/api/goals/", { method: "POST", body: JSON.stringify(body) });
        toast(isEdit ? "Goal updated." : "Goal created.", "success");
        closeModal();
        loadGoals();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.add("show");
      }
    };
  }

  async function setGoalStatus(id, status) {
    try {
      await authedFetch(`/api/goals/${id}/`, { method: "PATCH", body: JSON.stringify({ status }) });
      toast(`Goal marked ${status}.`, "success");
      loadGoals();
    } catch (err) { toast(err.message, "error"); }
  }

  async function archiveGoal(id) {
    const ok = await confirmDialog("Archive this goal?", "Archived goals stop accepting new submissions, but existing achievements/points/income tied to it are kept.", "Archive", true);
    if (!ok) return;
    try {
      await authedFetch(`/api/goals/${id}/`, { method: "DELETE" });
      toast("Goal archived.", "success");
      loadGoals();
    } catch (err) { toast(err.message, "error"); }
  }

  function wireGoalsToolbar() {
    document.getElementById("goalStatusFilter").addEventListener("change", (e) => { goalStatusFilterVal = e.target.value; loadGoals(); });
    document.getElementById("addGoalBtn").addEventListener("click", () => openGoalForm(null));
  }

  // ---------------------------------------------------------------------
  // Achievements
  // ---------------------------------------------------------------------

  let achStatusFilterVal = "submitted";
  let achPage = 1;

  function proofUrl(file) {
    if (!file) return "";
    return file.startsWith("http") ? file : `${apiBase()}${file}`;
  }

  async function loadAchievements() {
    if (!hasPerm("approve_achievements")) {
      document.getElementById("achievementsTableWrap").innerHTML = `<div class="adm-empty">You don't have permission to review achievements.</div>`;
      return;
    }
    const wrap = document.getElementById("achievementsTableWrap");
    wrap.innerHTML = `<div class="adm-loading">Loading achievements…</div>`;
    try {
      const params = new URLSearchParams({ page: achPage, page_size: 15, ...(achStatusFilterVal ? { status: achStatusFilterVal } : {}) });
      const data = await authedFetch(`/api/achievements/?${params}`);
      if (!data.results.length) { wrap.innerHTML = `<div class="adm-empty">Nothing here.</div>`; document.getElementById("achievementsPagination").innerHTML = ""; return; }
      const rows = data.results.map((a) => `
        <tr>
          <td>${escapeHtml(a.member_name)}</td>
          <td>${escapeHtml(a.goal_name)}</td>
          <td>${escapeHtml(a.progress)} / ${escapeHtml(a.target_snapshot)}</td>
          <td>${formatDate(a.submitted_at)}</td>
          <td>${a.proofs.length ? `${a.proofs.length} file${a.proofs.length === 1 ? "" : "s"}` : "—"}</td>
          <td><span class="adm-badge ${a.approval_status}">${escapeHtml(a.approval_status)}</span></td>
          <td><div class="adm-actions-cell">
            <button class="adm-btn sm" data-ach-view="${a.id}">View</button>
            ${a.approval_status === "submitted" ? `<button class="adm-btn sm primary" data-ach-approve="${a.id}">Approve</button><button class="adm-btn sm danger" data-ach-reject="${a.id}">Reject</button>` : ""}
          </div></td>
        </tr>`).join("");
      wrap.innerHTML = `<table class="adm-table"><thead><tr>
        <th>Member</th><th>Goal</th><th>Progress</th><th>Submitted</th><th>Proof</th><th>Status</th><th>Actions</th>
      </tr></thead><tbody>${rows}</tbody></table>`;

      const totalPages = Math.max(data.total_pages, 1);
      document.getElementById("achievementsPagination").innerHTML = `
        <span>${data.total} submission${data.total === 1 ? "" : "s"} — page ${data.page} of ${totalPages}</span>
        <div class="controls">
          <button class="adm-btn sm" id="achPrev" ${data.page <= 1 ? "disabled" : ""}>← Prev</button>
          <button class="adm-btn sm" id="achNext" ${data.page >= totalPages ? "disabled" : ""}>Next →</button>
        </div>`;
      const prevBtn = document.getElementById("achPrev"), nextBtn = document.getElementById("achNext");
      if (prevBtn) prevBtn.onclick = () => { achPage--; loadAchievements(); };
      if (nextBtn) nextBtn.onclick = () => { achPage++; loadAchievements(); };

      wrap.querySelectorAll("[data-ach-view]").forEach((b) => b.onclick = () => viewAchievement(data.results.find((a) => String(a.id) === b.dataset.achView)));
      wrap.querySelectorAll("[data-ach-approve]").forEach((b) => b.onclick = () => approveAchievement(b.dataset.achApprove));
      wrap.querySelectorAll("[data-ach-reject]").forEach((b) => b.onclick = () => rejectAchievement(b.dataset.achReject));
    } catch (err) {
      wrap.innerHTML = `<div class="adm-empty">${escapeHtml(err.message)}</div>`;
    }
  }

  function viewAchievement(a) {
    if (!a) return;
    openModal(`
      <h3>${escapeHtml(a.goal_name)}</h3>
      <div class="adm-kv-grid">
        <div class="kv"><div class="k">Member</div><div class="v">${escapeHtml(a.member_name)}</div></div>
        <div class="kv"><div class="k">Progress</div><div class="v">${escapeHtml(a.progress)} / ${escapeHtml(a.target_snapshot)}</div></div>
        <div class="kv"><div class="k">Submitted</div><div class="v">${formatDate(a.submitted_at)}</div></div>
        <div class="kv"><div class="k">Status</div><div class="v"><span class="adm-badge ${a.approval_status}">${escapeHtml(a.approval_status)}</span></div></div>
      </div>
      ${a.notes ? `<p style="margin-top:12px; font-size:.85rem; color:var(--adm-text-dim);"><strong>Notes:</strong> ${escapeHtml(a.notes)}</p>` : ""}
      <div style="margin-top:14px;">
        <div style="font-size:.76rem; text-transform:uppercase; color:var(--adm-gray); margin-bottom:8px;">Proof files</div>
        ${a.proofs.length ? a.proofs.map((p) => `<div style="margin-bottom:6px;"><a href="${proofUrl(p.file)}" target="_blank" rel="noopener" style="color:var(--gold); font-size:.84rem;">${escapeHtml(p.original_name || "View file")}</a></div>`).join("") : `<div class="adm-empty" style="padding:12px 0;">No proof files attached.</div>`}
      </div>
      <div class="adm-modal-actions"><button class="adm-btn" id="avClose">Close</button></div>
    `);
    document.getElementById("avClose").onclick = closeModal;
  }

  async function approveAchievement(id) {
    const ok = await confirmDialog("Approve this achievement?", "This creates the points transaction (and an income record, if the goal offers one) immediately.", "Approve", false);
    if (!ok) return;
    try {
      await authedFetch(`/api/admin/achievements/${id}/approve/`, { method: "POST", body: "{}" });
      toast("Achievement approved.", "success");
      loadAchievements();
    } catch (err) { toast(err.message, "error"); }
  }

  function rejectAchievement(id) {
    openModal(`
      <h3>Reject Achievement</h3>
      <div class="adm-form-field"><label>Reason (required)</label><textarea class="adm-input" id="rejReason" rows="3" placeholder="Let the member know why…"></textarea></div>
      <div class="adm-form-error" id="rejError"></div>
      <div class="adm-modal-actions">
        <button class="adm-btn" id="rejCancel">Cancel</button>
        <button class="adm-btn danger" id="rejSubmit">Reject</button>
      </div>
    `);
    document.getElementById("rejCancel").onclick = closeModal;
    document.getElementById("rejSubmit").onclick = async () => {
      const reason = document.getElementById("rejReason").value.trim();
      const errEl = document.getElementById("rejError");
      if (!reason) { errEl.textContent = "A reason is required."; errEl.classList.add("show"); return; }
      try {
        await authedFetch(`/api/admin/achievements/${id}/reject/`, { method: "POST", body: JSON.stringify({ notes: reason }) });
        toast("Achievement rejected.", "success");
        closeModal();
        loadAchievements();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.add("show");
      }
    };
  }

  function wireAchievementsToolbar() {
    document.getElementById("achStatusFilter").addEventListener("change", (e) => { achStatusFilterVal = e.target.value; achPage = 1; loadAchievements(); });
  }

  // ---------------------------------------------------------------------
  // Points
  // ---------------------------------------------------------------------

  async function loadPointsSection() {
    if (!hasPerm("view_points")) {
      document.getElementById("pointsKpiGrid").innerHTML = `<div class="adm-empty" style="grid-column:1/-1;">You don't have permission to view points.</div>`;
      return;
    }
    try {
      const data = await authedFetch("/api/admin/points/overview/");
      document.getElementById("pointsKpiGrid").innerHTML = `
        <div class="adm-kpi"><b>${data.total_issued}</b><div class="label">Total Points Issued</div></div>
        <div class="adm-kpi"><b>${data.total_held}</b><div class="label">Total Points Currently Held</div></div>
      `;
      const wrap = document.getElementById("pointsTableWrap");
      wrap.innerHTML = data.recent.length ? `<table class="adm-table"><thead><tr><th>Member</th><th>Points</th><th>Reason</th><th>By</th><th>Date</th></tr></thead><tbody>
        ${data.recent.map((t) => `<tr><td>${escapeHtml(t.member_name)}</td><td>${t.points > 0 ? "+" : ""}${t.points}</td><td>${escapeHtml(t.reason)}</td><td>${escapeHtml(t.created_by_name || "System")}</td><td>${formatDate(t.created_at)}</td></tr>`).join("")}
      </tbody></table>` : `<div class="adm-empty">No transactions yet.</div>`;
    } catch (err) {
      document.getElementById("pointsKpiGrid").innerHTML = `<div class="adm-empty" style="grid-column:1/-1;">${escapeHtml(err.message)}</div>`;
    }
  }

  function openAdjustPointsModal() {
    openModal(`
      <h3>Adjust Points</h3>
      <div class="adm-form-field"><label>Member — internal ID</label><input class="adm-input" id="pMember" placeholder="e.g. 42"></div>
      <div class="adm-form-field"><label>Points (positive to add, negative to remove)</label><input class="adm-input" id="pPoints" type="number"></div>
      <div class="adm-form-field"><label>Reason (required)</label><input class="adm-input" id="pReason" placeholder="e.g. Manual correction for…"></div>
      <div class="adm-form-error" id="pError"></div>
      <div class="adm-modal-actions">
        <button class="adm-btn" id="pCancel">Cancel</button>
        <button class="adm-btn primary" id="pSubmit">Apply</button>
      </div>
    `);
    document.getElementById("pCancel").onclick = closeModal;
    document.getElementById("pSubmit").onclick = async () => {
      const errEl = document.getElementById("pError");
      const body = {
        member: document.getElementById("pMember").value.trim(),
        points: document.getElementById("pPoints").value,
        reason: document.getElementById("pReason").value.trim(),
      };
      if (!body.member || body.points === "" || !body.reason) {
        errEl.textContent = "Member, points, and reason are all required.";
        errEl.classList.add("show");
        return;
      }
      try {
        await authedFetch("/api/admin/points/adjust/", { method: "POST", body: JSON.stringify(body) });
        toast("Points adjusted.", "success");
        closeModal();
        loadPointsSection();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.add("show");
      }
    };
  }

  function wirePointsToolbar() {
    document.getElementById("adjustPointsBtn").addEventListener("click", openAdjustPointsModal);
  }

  // ---------------------------------------------------------------------
  // Income
  // ---------------------------------------------------------------------

  let incomeStatusFilterVal = "";
  let incomePage = 1;

  function incomeActionsCell(r) {
    if (!hasPerm("edit_income")) return "—";
    const order = ["pending", "approved", "paid"];
    const idx = order.indexOf(r.status);
    const btns = [];
    if (idx >= 0 && idx < order.length - 1) {
      const next = order[idx + 1];
      btns.push(`<button class="adm-btn sm primary" data-income-status="${r.id}" data-next="${next}">Mark ${next[0].toUpperCase() + next.slice(1)}</button>`);
    }
    if (r.status === "pending" || r.status === "approved") {
      btns.push(`<button class="adm-btn sm danger" data-income-status="${r.id}" data-next="rejected">Reject</button>`);
    }
    return `<div class="adm-actions-cell">${btns.join("")}</div>`;
  }

  async function loadIncomeSection() {
    if (!hasPerm("view_income")) {
      document.getElementById("incomeKpiGrid").innerHTML = `<div class="adm-empty" style="grid-column:1/-1;">You don't have permission to view income.</div>`;
      return;
    }
    const wrap = document.getElementById("incomeTableWrap");
    wrap.innerHTML = `<div class="adm-loading">Loading…</div>`;
    try {
      const params = new URLSearchParams({ page: incomePage, page_size: 15, ...(incomeStatusFilterVal ? { status: incomeStatusFilterVal } : {}) });
      const data = await authedFetch(`/api/admin/income/?${params}`);
      document.getElementById("incomeKpiGrid").innerHTML = `
        <div class="adm-kpi"><b>₹${data.totals.pending}</b><div class="label">Pending</div></div>
        <div class="adm-kpi"><b>₹${data.totals.approved}</b><div class="label">Approved</div></div>
        <div class="adm-kpi"><b>₹${data.totals.paid}</b><div class="label">Paid</div></div>
        <div class="adm-kpi"><b>₹${data.totals.rejected}</b><div class="label">Rejected</div></div>
        <div class="adm-kpi"><b>₹${data.totals.total}</b><div class="label">Total</div></div>
      `;
      if (!data.results.length) { wrap.innerHTML = `<div class="adm-empty">No income records match this filter.</div>`; document.getElementById("incomePagination").innerHTML = ""; return; }
      const rows = data.results.map((r) => `
        <tr>
          <td>${escapeHtml(r.member_name)}</td>
          <td>${escapeHtml(r.goal_name || "—")}</td>
          <td>₹${r.amount}</td>
          <td><span class="adm-badge ${r.status}">${escapeHtml(r.status)}</span></td>
          <td>${formatDate(r.created_at)}</td>
          <td>${incomeActionsCell(r)}</td>
        </tr>`).join("");
      wrap.innerHTML = `<table class="adm-table"><thead><tr><th>Member</th><th>Goal</th><th>Amount</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table>`;

      const totalPages = Math.max(data.total_pages, 1);
      document.getElementById("incomePagination").innerHTML = `
        <span>${data.total} record${data.total === 1 ? "" : "s"} — page ${data.page} of ${totalPages}</span>
        <div class="controls">
          <button class="adm-btn sm" id="incomePrev" ${data.page <= 1 ? "disabled" : ""}>← Prev</button>
          <button class="adm-btn sm" id="incomeNext" ${data.page >= totalPages ? "disabled" : ""}>Next →</button>
        </div>`;
      const prevBtn = document.getElementById("incomePrev"), nextBtn = document.getElementById("incomeNext");
      if (prevBtn) prevBtn.onclick = () => { incomePage--; loadIncomeSection(); };
      if (nextBtn) nextBtn.onclick = () => { incomePage++; loadIncomeSection(); };

      wrap.querySelectorAll("[data-income-status]").forEach((b) => {
        b.onclick = () => updateIncomeStatus(b.dataset.incomeStatus, b.dataset.next);
      });
    } catch (err) {
      wrap.innerHTML = `<div class="adm-empty">${escapeHtml(err.message)}</div>`;
    }
  }

  async function updateIncomeStatus(id, status) {
    const ok = await confirmDialog(`Mark income as ${status}?`, "This updates the record and notifies the member.", "Confirm", status === "rejected");
    if (!ok) return;
    try {
      await authedFetch(`/api/admin/income/${id}/`, { method: "PATCH", body: JSON.stringify({ status }) });
      toast(`Marked ${status}.`, "success");
      loadIncomeSection();
    } catch (err) { toast(err.message, "error"); }
  }

  function wireIncomeToolbar() {
    document.getElementById("incomeStatusFilter").addEventListener("change", (e) => { incomeStatusFilterVal = e.target.value; incomePage = 1; loadIncomeSection(); });
  }

  // ---------------------------------------------------------------------
  // Site Content (CMS)
  // ---------------------------------------------------------------------

  function wireContentTabs() {
    document.querySelectorAll("[data-content-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-content-tab]").forEach((b) => b.classList.remove("active"));
        document.querySelectorAll("#section-content .adm-tab-panel").forEach((p) => p.classList.remove("active"));
        btn.classList.add("active");
        document.getElementById(`content-${btn.dataset.contentTab}`).classList.add("active");
      });
    });
  }

  async function loadSiteContentJson(key, textareaId) {
    try {
      const data = await authedFetch(`/api/content/${key}/`);
      document.getElementById(textareaId).value = JSON.stringify(data.content.data, null, 2);
      return data.content.data;
    } catch (err) { toast(err.message, "error"); return {}; }
  }

  async function saveSiteContentJson(key, textareaId) {
    const raw = document.getElementById(textareaId).value;
    let parsed;
    try { parsed = raw.trim() ? JSON.parse(raw) : {}; }
    catch { toast("That's not valid JSON — check for a stray comma or quote.", "error"); return; }
    try {
      await authedFetch(`/api/content/${key}/`, { method: "PUT", body: JSON.stringify({ data: parsed }) });
      toast("Saved.", "success");
    } catch (err) { toast(err.message, "error"); }
  }

  // ---- Homepage: structured fields on top of the same free-form JSON ----

  function addHomepageStatRow(value, label) {
    const wrap = document.getElementById("hpStatsRows");
    const row = document.createElement("div");
    row.className = "adm-stat-row";
    row.style.cssText = "display:flex; gap:8px; margin-bottom:8px; align-items:center;";
    row.innerHTML = `
      <input class="adm-input hp-stat-value" placeholder="e.g. 10+" style="width:90px;" value="${escapeHtml(value || "")}">
      <input class="adm-input hp-stat-label" placeholder="e.g. Years of Excellence" style="flex:1;" value="${escapeHtml(label || "")}">
      <button class="icon-btn danger" type="button" title="Remove">🗑</button>
    `;
    row.querySelector("button").onclick = () => row.remove();
    wrap.appendChild(row);
  }

  function collectHomepageStats() {
    return [...document.querySelectorAll("#hpStatsRows .adm-stat-row")].map((row) => ({
      value: row.querySelector(".hp-stat-value").value.trim(),
      label: row.querySelector(".hp-stat-label").value.trim(),
    })).filter((s) => s.value || s.label);
  }

  async function loadHomepageContent() {
    const data = await loadSiteContentJson("homepage", "homepageJson");
    document.getElementById("hpBadge").value = data.badge || "";
    document.getElementById("hpTitle").value = data.hero_title || "";
    document.getElementById("hpSubtitle").value = data.hero_subtitle || "";
    document.getElementById("hpCtaPrimaryLabel").value = data.cta_primary_label || "";
    document.getElementById("hpCtaPrimaryUrl").value = data.cta_primary_url || "";
    document.getElementById("hpCtaSecondaryLabel").value = data.cta_secondary_label || "";
    document.getElementById("hpCtaSecondaryUrl").value = data.cta_secondary_url || "";
    document.getElementById("hpStatsRows").innerHTML = "";
    (data.stats || []).forEach((s) => addHomepageStatRow(s.value, s.label));
  }

  async function saveHomepageContent() {
    const rawText = document.getElementById("homepageJson").value;
    let base;
    try { base = rawText.trim() ? JSON.parse(rawText) : {}; }
    catch { toast("The advanced JSON box isn't valid JSON — fix or clear it before saving.", "error"); return; }

    const merged = {
      ...base,
      badge: document.getElementById("hpBadge").value.trim(),
      hero_title: document.getElementById("hpTitle").value.trim(),
      hero_subtitle: document.getElementById("hpSubtitle").value.trim(),
      cta_primary_label: document.getElementById("hpCtaPrimaryLabel").value.trim(),
      cta_primary_url: document.getElementById("hpCtaPrimaryUrl").value.trim(),
      cta_secondary_label: document.getElementById("hpCtaSecondaryLabel").value.trim(),
      cta_secondary_url: document.getElementById("hpCtaSecondaryUrl").value.trim(),
      stats: collectHomepageStats(),
    };
    try {
      await authedFetch("/api/content/homepage/", { method: "PUT", body: JSON.stringify({ data: merged }) });
      document.getElementById("homepageJson").value = JSON.stringify(merged, null, 2);
      toast("Homepage content saved.", "success");
    } catch (err) { toast(err.message, "error"); }
  }

  // ---- Achievements copy: same pattern ----

  function addAchievementItemRow(title, description) {
    const wrap = document.getElementById("acItemsRows");
    const row = document.createElement("div");
    row.className = "adm-achitem-row";
    row.style.cssText = "border:1px solid var(--adm-line); border-radius:10px; padding:10px; margin-bottom:8px;";
    row.innerHTML = `
      <div style="display:flex; gap:8px; align-items:flex-start;">
        <div style="flex:1;">
          <input class="adm-input ac-item-title" placeholder="Highlight title" style="width:100%; margin-bottom:6px;" value="${escapeHtml(title || "")}">
          <textarea class="adm-input ac-item-desc" placeholder="Short description" rows="2" style="width:100%;">${escapeHtml(description || "")}</textarea>
        </div>
        <button class="icon-btn danger" type="button" title="Remove">🗑</button>
      </div>
    `;
    row.querySelector("button").onclick = () => row.remove();
    wrap.appendChild(row);
  }

  function collectAchievementItems() {
    return [...document.querySelectorAll("#acItemsRows .adm-achitem-row")].map((row) => ({
      title: row.querySelector(".ac-item-title").value.trim(),
      description: row.querySelector(".ac-item-desc").value.trim(),
    })).filter((i) => i.title || i.description);
  }

  async function loadAchievementsContent() {
    const data = await loadSiteContentJson("achievements", "achievementsJson");
    document.getElementById("acEyebrow").value = data.eyebrow || "";
    document.getElementById("acHeading").value = data.heading || "";
    document.getElementById("acItemsRows").innerHTML = "";
    (data.items || []).forEach((i) => addAchievementItemRow(i.title, i.description));
  }

  async function saveAchievementsContent() {
    const rawText = document.getElementById("achievementsJson").value;
    let base;
    try { base = rawText.trim() ? JSON.parse(rawText) : {}; }
    catch { toast("The advanced JSON box isn't valid JSON — fix or clear it before saving.", "error"); return; }

    const merged = {
      ...base,
      eyebrow: document.getElementById("acEyebrow").value.trim(),
      heading: document.getElementById("acHeading").value.trim(),
      items: collectAchievementItems(),
    };
    try {
      await authedFetch("/api/content/achievements/", { method: "PUT", body: JSON.stringify({ data: merged }) });
      document.getElementById("achievementsJson").value = JSON.stringify(merged, null, 2);
      toast("Achievements content saved.", "success");
    } catch (err) { toast(err.message, "error"); }
  }

  function teamActionsCell(t) {
    return `<div class="adm-actions-cell">
      <button class="icon-btn" title="Edit" data-team-edit="${t.id}">✎</button>
      <button class="icon-btn" title="${t.is_active ? "Deactivate" : "Activate"}" data-team-toggle="${t.id}" data-next="${!t.is_active}">${t.is_active ? "⏸" : "▶"}</button>
      <button class="icon-btn danger" title="Delete" data-team-delete="${t.id}">🗑</button>
    </div>`;
  }

  async function loadTeamTab() {
    const wrap = document.getElementById("teamTableWrap");
    wrap.innerHTML = `<div class="adm-loading">Loading…</div>`;
    try {
      const data = await authedFetch("/api/team/");
      const items = data.team;
      wrap.innerHTML = items.length ? `<table class="adm-table"><thead><tr><th>Name</th><th>Position</th><th>Status</th><th>Order</th><th>Actions</th></tr></thead><tbody>
        ${items.map((t) => `<tr><td>${escapeHtml(t.name)}</td><td>${escapeHtml(t.position || "—")}</td><td>${t.is_active ? statusBadge("active") : statusBadge("inactive")}</td><td>${t.order}</td><td>${teamActionsCell(t)}</td></tr>`).join("")}
      </tbody></table>` : `<div class="adm-empty">No team members yet.</div>`;
      wrap.querySelectorAll("[data-team-edit]").forEach((b) => b.onclick = () => openTeamForm(items.find((t) => String(t.id) === b.dataset.teamEdit)));
      wrap.querySelectorAll("[data-team-toggle]").forEach((b) => b.onclick = () => toggleTeamMember(b.dataset.teamToggle, b.dataset.next === "true"));
      wrap.querySelectorAll("[data-team-delete]").forEach((b) => b.onclick = () => deleteTeamMember(b.dataset.teamDelete));
    } catch (err) {
      wrap.innerHTML = `<div class="adm-empty">${escapeHtml(err.message)}</div>`;
    }
  }

  function openTeamForm(member) {
    const isEdit = !!member;
    const existingPhoto = member?.photo ? (member.photo.startsWith("http") ? member.photo : `${apiBase()}${member.photo}`) : null;
    openModal(`
      <h3>${isEdit ? "Edit Team Member" : "Add Team Member"}</h3>
      <div class="adm-form-field"><label>Name</label><input class="adm-input" id="tName" value="${escapeHtml(member?.name || "")}"></div>
      <div class="adm-form-field"><label>Position</label><input class="adm-input" id="tPosition" value="${escapeHtml(member?.position || "")}"></div>
      <div class="adm-form-field"><label>Description</label><textarea class="adm-input" id="tDesc" rows="3">${escapeHtml(member?.description || "")}</textarea></div>
      <div class="adm-form-field"><label>Order</label><input class="adm-input" id="tOrder" type="number" value="${member?.order ?? 0}"></div>
      <div class="adm-form-field">
        <label>Photo</label>
        ${existingPhoto ? `<img src="${existingPhoto}" alt="" style="display:block; width:64px; height:64px; border-radius:50%; object-fit:cover; margin-bottom:8px;">` : ""}
        <input class="adm-input" id="tPhoto" type="file" accept="image/jpeg,image/png,image/webp">
        <div style="font-size:.72rem; color:var(--adm-gray); margin-top:4px;">${existingPhoto ? "Choose a file to replace it, or leave blank to keep the current photo." : "Optional — JPEG, PNG, or WebP."}</div>
      </div>
      <div class="adm-form-error" id="tError"></div>
      <div class="adm-modal-actions">
        <button class="adm-btn" id="tCancel">Cancel</button>
        <button class="adm-btn primary" id="tSubmit">${isEdit ? "Save Changes" : "Create"}</button>
      </div>
    `);
    document.getElementById("tCancel").onclick = closeModal;
    document.getElementById("tSubmit").onclick = async () => {
      const name = document.getElementById("tName").value.trim();
      const errEl = document.getElementById("tError");
      if (!name) { errEl.textContent = "Name is required."; errEl.classList.add("show"); return; }

      const form = new FormData();
      form.append("name", name);
      form.append("position", document.getElementById("tPosition").value.trim());
      form.append("description", document.getElementById("tDesc").value.trim());
      form.append("order", document.getElementById("tOrder").value);
      const photoFile = document.getElementById("tPhoto").files[0];
      if (photoFile) form.append("photo", photoFile);

      try {
        if (isEdit) await authedFetch(`/api/team/${member.id}/`, { method: "PATCH", body: form });
        else await authedFetch("/api/team/", { method: "POST", body: form });
        toast(isEdit ? "Updated." : "Created.", "success");
        closeModal();
        loadTeamTab();
      } catch (err) { errEl.textContent = err.message; errEl.classList.add("show"); }
    };
  }

  async function toggleTeamMember(id, nextActive) {
    try {
      await authedFetch(`/api/team/${id}/`, { method: "PATCH", body: JSON.stringify({ is_active: nextActive }) });
      toast("Updated.", "success");
      loadTeamTab();
    } catch (err) { toast(err.message, "error"); }
  }

  async function deleteTeamMember(id) {
    const ok = await confirmDialog("Remove this team member?", "This deletes them from the public team page.", "Delete", true);
    if (!ok) return;
    try {
      await authedFetch(`/api/team/${id}/`, { method: "DELETE" });
      toast("Removed.", "success");
      loadTeamTab();
    } catch (err) { toast(err.message, "error"); }
  }

  function productActionsCell(p) {
    return `<div class="adm-actions-cell">
      <button class="icon-btn" title="Edit" data-prod-edit="${p.id}">✎</button>
      <button class="icon-btn" title="${p.is_active ? "Deactivate" : "Activate"}" data-prod-toggle="${p.id}" data-next="${!p.is_active}">${p.is_active ? "⏸" : "▶"}</button>
      <button class="icon-btn danger" title="Delete" data-prod-delete="${p.id}">🗑</button>
    </div>`;
  }

  async function loadProductsTab() {
    const wrap = document.getElementById("productsTableWrap");
    wrap.innerHTML = `<div class="adm-loading">Loading…</div>`;
    try {
      const data = await authedFetch("/api/products/");
      const items = data.products;
      wrap.innerHTML = items.length ? `<table class="adm-table"><thead><tr><th>Name</th><th>Price</th><th>Status</th><th>Order</th><th>Actions</th></tr></thead><tbody>
        ${items.map((p) => `<tr><td>${escapeHtml(p.name)}</td><td>₹${p.price}</td><td>${p.is_active ? statusBadge("active") : statusBadge("inactive")}</td><td>${p.order}</td><td>${productActionsCell(p)}</td></tr>`).join("")}
      </tbody></table>` : `<div class="adm-empty">No products yet.</div>`;
      wrap.querySelectorAll("[data-prod-edit]").forEach((b) => b.onclick = () => openProductForm(items.find((p) => String(p.id) === b.dataset.prodEdit)));
      wrap.querySelectorAll("[data-prod-toggle]").forEach((b) => b.onclick = () => toggleProduct(b.dataset.prodToggle, b.dataset.next === "true"));
      wrap.querySelectorAll("[data-prod-delete]").forEach((b) => b.onclick = () => deleteProduct(b.dataset.prodDelete));
    } catch (err) {
      wrap.innerHTML = `<div class="adm-empty">${escapeHtml(err.message)}</div>`;
    }
  }

  function openProductForm(product) {
    const isEdit = !!product;
    openModal(`
      <h3>${isEdit ? "Edit Product" : "Add Product"}</h3>
      <div class="adm-form-field"><label>Name</label><input class="adm-input" id="pdName" value="${escapeHtml(product?.name || "")}"></div>
      <div class="adm-form-field"><label>Description</label><textarea class="adm-input" id="pdDesc" rows="3">${escapeHtml(product?.description || "")}</textarea></div>
      <div class="adm-form-field"><label>Price (₹)</label><input class="adm-input" id="pdPrice" type="number" step="0.01" value="${product?.price ?? 0}"></div>
      <div class="adm-form-field"><label>Order</label><input class="adm-input" id="pdOrder" type="number" value="${product?.order ?? 0}"></div>
      <div class="adm-form-field">
        <label>Images</label>
        ${isEdit ? `
          <div id="pdImagesGrid" style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:8px;"></div>
          <input class="adm-input" id="pdImageUpload" type="file" accept="image/jpeg,image/png,image/webp,image/gif">
          <div style="font-size:.72rem; color:var(--adm-gray); margin-top:4px;">Selecting a file uploads it immediately and adds it to the gallery below.</div>
        ` : `<div style="font-size:.78rem; color:var(--adm-gray);">Save the product first, then reopen it to add images.</div>`}
      </div>
      <div class="adm-form-error" id="pdError"></div>
      <div class="adm-modal-actions">
        <button class="adm-btn" id="pdCancel">Cancel</button>
        <button class="adm-btn primary" id="pdSubmit">${isEdit ? "Save Changes" : "Create"}</button>
      </div>
    `);

    let currentProduct = product;
    function renderProductImages() {
      const grid = document.getElementById("pdImagesGrid");
      if (!grid) return;
      const images = currentProduct?.images || [];
      grid.innerHTML = images.length ? images.map((url) => `
        <div style="position:relative;">
          <img src="${proofUrl(url)}" alt="" style="width:64px; height:64px; object-fit:cover; border-radius:8px; border:1px solid var(--adm-line);">
          <button data-remove-img="${escapeHtml(url)}" title="Remove" style="position:absolute; top:-6px; right:-6px; width:18px; height:18px; border-radius:50%; background:var(--adm-danger); color:#fff; border:none; font-size:.7rem; cursor:pointer; line-height:1;">×</button>
        </div>`).join("") : `<div style="font-size:.78rem; color:var(--adm-gray);">No images yet.</div>`;
      grid.querySelectorAll("[data-remove-img]").forEach((b) => {
        b.onclick = async () => {
          try {
            const data = await authedFetch(`/api/products/${currentProduct.id}/images/`, { method: "DELETE", body: JSON.stringify({ url: b.dataset.removeImg }) });
            currentProduct = data.product;
            renderProductImages();
            loadProductsTab();
          } catch (err) { toast(err.message, "error"); }
        };
      });
    }
    if (isEdit) {
      renderProductImages();
      document.getElementById("pdImageUpload").addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const form = new FormData();
        form.append("file", file);
        try {
          const data = await authedFetch(`/api/products/${currentProduct.id}/images/`, { method: "POST", body: form });
          currentProduct = data.product;
          renderProductImages();
          loadProductsTab();
          toast("Image added.", "success");
        } catch (err) { toast(err.message, "error"); }
        e.target.value = "";
      });
    }

    document.getElementById("pdCancel").onclick = closeModal;
    document.getElementById("pdSubmit").onclick = async () => {
      const body = {
        name: document.getElementById("pdName").value.trim(),
        description: document.getElementById("pdDesc").value.trim(),
        price: document.getElementById("pdPrice").value,
        order: document.getElementById("pdOrder").value,
      };
      const errEl = document.getElementById("pdError");
      if (!body.name) { errEl.textContent = "Name is required."; errEl.classList.add("show"); return; }
      try {
        if (isEdit) await authedFetch(`/api/products/${product.id}/`, { method: "PATCH", body: JSON.stringify(body) });
        else await authedFetch("/api/products/", { method: "POST", body: JSON.stringify(body) });
        toast(isEdit ? "Updated." : "Created.", "success");
        closeModal();
        loadProductsTab();
      } catch (err) { errEl.textContent = err.message; errEl.classList.add("show"); }
    };
  }

  async function toggleProduct(id, nextActive) {
    try {
      await authedFetch(`/api/products/${id}/`, { method: "PATCH", body: JSON.stringify({ is_active: nextActive }) });
      toast("Updated.", "success");
      loadProductsTab();
    } catch (err) { toast(err.message, "error"); }
  }

  async function deleteProduct(id) {
    const ok = await confirmDialog("Remove this product?", "This deletes it from the public product listing.", "Delete", true);
    if (!ok) return;
    try {
      await authedFetch(`/api/products/${id}/`, { method: "DELETE" });
      toast("Removed.", "success");
      loadProductsTab();
    } catch (err) { toast(err.message, "error"); }
  }

  function wireContentToolbar() {
    document.getElementById("saveHomepageBtn").addEventListener("click", saveHomepageContent);
    document.getElementById("saveAchievementsContentBtn").addEventListener("click", saveAchievementsContent);
    document.getElementById("hpAddStatBtn").addEventListener("click", () => addHomepageStatRow("", ""));
    document.getElementById("acAddItemBtn").addEventListener("click", () => addAchievementItemRow("", ""));
    document.getElementById("addTeamMemberBtn").addEventListener("click", () => openTeamForm(null));
    document.getElementById("addProductBtn").addEventListener("click", () => openProductForm(null));
  }

  async function loadContentSection() {
    if (!hasPerm("edit_site_content")) {
      document.querySelector("#section-content").innerHTML = `<div class="adm-empty">You don't have permission to manage site content.</div>`;
      return;
    }
    loadHomepageContent();
    loadAchievementsContent();
    loadTeamTab();
    loadProductsTab();
  }

  // ---------------------------------------------------------------------
  // Messages
  // ---------------------------------------------------------------------

  const msgState = { page: 1, search: "", isRead: "", isArchived: "false" };

  async function loadMessages() {
    if (!hasPerm("view_messages")) {
      document.getElementById("messagesTableWrap").innerHTML = `<div class="adm-empty">You don't have permission to view messages.</div>`;
      return;
    }
    const wrap = document.getElementById("messagesTableWrap");
    wrap.innerHTML = `<div class="adm-loading">Loading…</div>`;
    try {
      const params = new URLSearchParams({
        page: msgState.page, page_size: 15, is_archived: msgState.isArchived,
        ...(msgState.search ? { search: msgState.search } : {}),
        ...(msgState.isRead ? { is_read: msgState.isRead } : {}),
      });
      const data = await authedFetch(`/api/admin/messages/?${params}`);
      if (!data.results.length) { wrap.innerHTML = `<div class="adm-empty">No messages here.</div>`; document.getElementById("messagesPagination").innerHTML = ""; return; }
      const rows = data.results.map((m) => `
        <tr style="${m.is_read ? "" : "font-weight:600;"}">
          <td>${escapeHtml(m.name)}</td>
          <td>${escapeHtml(m.email)}</td>
          <td>${escapeHtml(truncate(m.message, 60))}</td>
          <td>${formatDate(m.created_at)}</td>
          <td>${m.admin_reply ? statusBadge("approved") : statusBadge("pending")}</td>
          <td><div class="adm-actions-cell">
            <button class="adm-btn sm" data-msg-view="${m.id}">View</button>
            ${hasPerm("manage_messages") ? `<button class="icon-btn danger" title="${m.is_archived ? "Unarchive" : "Archive"}" data-msg-archive="${m.id}" data-next="${!m.is_archived}">🗄</button>` : ""}
          </div></td>
        </tr>`).join("");
      wrap.innerHTML = `<table class="adm-table"><thead><tr><th>From</th><th>Email</th><th>Message</th><th>Received</th><th>Reply</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table>`;

      const totalPages = Math.max(data.total_pages, 1);
      document.getElementById("messagesPagination").innerHTML = `
        <span>${data.total} message${data.total === 1 ? "" : "s"} — page ${data.page} of ${totalPages}</span>
        <div class="controls">
          <button class="adm-btn sm" id="msgPrev" ${data.page <= 1 ? "disabled" : ""}>← Prev</button>
          <button class="adm-btn sm" id="msgNext" ${data.page >= totalPages ? "disabled" : ""}>Next →</button>
        </div>`;
      const prevBtn = document.getElementById("msgPrev"), nextBtn = document.getElementById("msgNext");
      if (prevBtn) prevBtn.onclick = () => { msgState.page--; loadMessages(); };
      if (nextBtn) nextBtn.onclick = () => { msgState.page++; loadMessages(); };

      wrap.querySelectorAll("[data-msg-view]").forEach((b) => b.onclick = () => viewMessage(data.results.find((m) => String(m.id) === b.dataset.msgView)));
      wrap.querySelectorAll("[data-msg-archive]").forEach((b) => b.onclick = () => archiveMessage(b.dataset.msgArchive, b.dataset.next === "true"));
    } catch (err) {
      wrap.innerHTML = `<div class="adm-empty">${escapeHtml(err.message)}</div>`;
    }
  }

  async function viewMessage(m) {
    if (!m) return;
    if (!m.is_read && hasPerm("manage_messages")) {
      authedFetch(`/api/admin/messages/${m.id}/`, { method: "PATCH", body: JSON.stringify({ is_read: true }) }).then(loadMessages).catch(() => {});
    }
    openModal(`
      <h3>${escapeHtml(m.name)}</h3>
      <p style="color:var(--adm-gray); font-size:.8rem; margin-top:-10px;">${escapeHtml(m.email)} · ${escapeHtml(m.phone || "no phone")} · ${formatDate(m.created_at)}</p>
      <p style="font-size:.88rem; line-height:1.6; margin:14px 0;">${escapeHtml(m.message)}</p>
      ${m.admin_reply ? `<div style="background:var(--adm-panel-2); border-radius:10px; padding:12px 14px; font-size:.84rem; margin-bottom:14px;"><strong>Your reply:</strong> ${escapeHtml(m.admin_reply)}</div>` : ""}
      ${hasPerm("manage_messages") ? `
      <div class="adm-form-field"><label>Reply</label><textarea class="adm-input" id="msgReplyText" rows="3" placeholder="Type a reply to record here…">${escapeHtml(m.admin_reply || "")}</textarea></div>
      <div class="adm-modal-actions">
        <button class="adm-btn" id="msgClose">Close</button>
        <button class="adm-btn primary" id="msgReplySubmit">Save Reply</button>
      </div>` : `<div class="adm-modal-actions"><button class="adm-btn" id="msgClose">Close</button></div>`}
    `);
    document.getElementById("msgClose").onclick = () => { closeModal(); loadMessages(); };
    const replyBtn = document.getElementById("msgReplySubmit");
    if (replyBtn) replyBtn.onclick = async () => {
      const text = document.getElementById("msgReplyText").value.trim();
      if (!text) { toast("Write a reply first.", "error"); return; }
      try {
        await authedFetch(`/api/admin/messages/${m.id}/`, { method: "PATCH", body: JSON.stringify({ admin_reply: text }) });
        toast("Reply saved.", "success");
        closeModal();
        loadMessages();
      } catch (err) { toast(err.message, "error"); }
    };
  }

  async function archiveMessage(id, nextArchived) {
    try {
      await authedFetch(`/api/admin/messages/${id}/`, { method: "PATCH", body: JSON.stringify({ is_archived: nextArchived }) });
      toast(nextArchived ? "Archived." : "Restored to inbox.", "success");
      loadMessages();
    } catch (err) { toast(err.message, "error"); }
  }

  function wireMessagesToolbar() {
    let t;
    document.getElementById("msgSearch").addEventListener("input", (e) => {
      clearTimeout(t);
      t = setTimeout(() => { msgState.search = e.target.value.trim(); msgState.page = 1; loadMessages(); }, 350);
    });
    document.getElementById("msgReadFilter").addEventListener("change", (e) => { msgState.isRead = e.target.value; msgState.page = 1; loadMessages(); });
    document.getElementById("msgArchivedFilter").addEventListener("change", (e) => { msgState.isArchived = e.target.value; msgState.page = 1; loadMessages(); });
  }

  // ---------------------------------------------------------------------
  // Reports
  // ---------------------------------------------------------------------

  const REPORT_KINDS = [
    { kind: "members", label: "Members", desc: "Every member — ID, contact info, sponsor, status, points, join date." },
    { kind: "mlm", label: "MLM Network", desc: "Sponsor relationships and direct-referral counts across the hierarchy." },
    { kind: "achievements", label: "Goals & Achievements", desc: "Every submission — goal, progress, approval status, timestamps." },
    { kind: "points", label: "Points", desc: "The full points transaction ledger." },
    { kind: "income", label: "Income", desc: "Every income record and its status history." },
  ];

  function renderReportsGrid() {
    document.getElementById("reportsGrid").innerHTML = REPORT_KINDS.map((r) => `
      <div class="adm-card">
        <h3>${r.label}</h3>
        <p style="color:var(--adm-text-dim); font-size:.84rem; margin-bottom:16px;">${r.desc}</p>
        <button class="adm-btn primary sm" data-export="${r.kind}">Export CSV</button>
      </div>`).join("");
    document.querySelectorAll("[data-export]").forEach((b) => b.onclick = () => exportReport(b.dataset.export));
  }

  async function exportReport(kind) {
    try {
      const res = await fetch(`${apiBase()}/api/admin/reports/${kind}/export/`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Export failed."); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${kind}_report.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err) { toast(err.message, "error"); }
  }

  function loadReportsSection() {
    if (!hasPerm("view_reports")) {
      document.getElementById("reportsGrid").innerHTML = `<div class="adm-empty">You don't have permission to view reports.</div>`;
      return;
    }
    renderReportsGrid();
  }

  // ---------------------------------------------------------------------
  // Permissions
  // ---------------------------------------------------------------------

  function wirePermissionsToolbar() {
    document.getElementById("loadPermsBtn").addEventListener("click", () => {
      const id = document.getElementById("permMemberId").value.trim();
      if (id) loadPermissionsFor(id);
    });
  }

  async function loadPermissionsFor(memberId) {
    const el = document.getElementById("permsList");
    el.innerHTML = `<div class="adm-loading">Loading…</div>`;
    try {
      const data = await authedFetch(`/api/admin/permissions/?member=${memberId}`);
      el.innerHTML = `<table class="adm-table"><thead><tr><th>Permission</th><th>Granted</th></tr></thead><tbody>
        ${data.permissions.map((p) => `
          <tr>
            <td>${escapeHtml(p.codename.replace(/_/g, " "))}</td>
            <td><button class="adm-btn sm ${p.granted ? "primary" : ""}" data-perm-toggle="${p.codename}" data-next="${!p.granted}">${p.granted ? "Granted — click to revoke" : "Revoked — click to grant"}</button></td>
          </tr>`).join("")}
      </tbody></table>`;
      el.querySelectorAll("[data-perm-toggle]").forEach((b) => {
        b.onclick = () => togglePermission(memberId, b.dataset.permToggle, b.dataset.next === "true");
      });
    } catch (err) {
      el.innerHTML = `<div class="adm-empty">${escapeHtml(err.message)}</div>`;
    }
  }

  async function togglePermission(memberId, codename, grant) {
    try {
      await authedFetch("/api/admin/permissions/assign/", {
        method: "POST", body: JSON.stringify({ member: memberId, codename, action: grant ? "grant" : "revoke" }),
      });
      toast(`Permission ${grant ? "granted" : "revoked"}.`, "success");
      loadPermissionsFor(memberId);
    } catch (err) { toast(err.message, "error"); }
  }

  function loadPermissionsSection() {
    if (currentUser.role !== "super_admin") {
      document.getElementById("permsList").innerHTML = `<div class="adm-empty">Only super admins can manage permissions.</div>`;
    }
  }

  // ---------------------------------------------------------------------
  // Audit Logs
  // ---------------------------------------------------------------------

  const AUDIT_ACTIONS = [
    "member_created", "member_edited", "member_deleted", "member_deactivated", "member_reactivated",
    "sponsor_reassigned", "goal_created", "goal_updated", "achievement_submitted", "achievement_approved",
    "achievement_rejected", "achievement_proof_uploaded", "points_adjusted", "income_updated",
    "content_updated", "message_updated", "message_deleted", "permission_granted", "permission_revoked",
    "report_exported",
  ];

  function populateAuditActionFilter() {
    const sel = document.getElementById("auditActionFilter");
    AUDIT_ACTIONS.forEach((a) => {
      const opt = document.createElement("option");
      opt.value = a; opt.textContent = a.replace(/_/g, " ");
      sel.appendChild(opt);
    });
  }

  const auditState = { page: 1, action: "", actor: "" };

  async function loadAuditLogs() {
    if (!hasPerm("view_audit_logs")) {
      document.getElementById("auditTableWrap").innerHTML = `<div class="adm-empty">You don't have permission to view audit logs.</div>`;
      return;
    }
    const wrap = document.getElementById("auditTableWrap");
    wrap.innerHTML = `<div class="adm-loading">Loading…</div>`;
    try {
      const params = new URLSearchParams({
        page: auditState.page, page_size: 20,
        ...(auditState.action ? { action: auditState.action } : {}),
        ...(auditState.actor ? { actor: auditState.actor } : {}),
      });
      const data = await authedFetch(`/api/admin/audit-logs/?${params}`);
      if (!data.results.length) { wrap.innerHTML = `<div class="adm-empty">No matching activity.</div>`; document.getElementById("auditPagination").innerHTML = ""; return; }
      const rows = data.results.map((a) => `
        <tr>
          <td>${escapeHtml(a.actor_name || "System")}</td>
          <td>${escapeHtml(a.action.replace(/_/g, " "))}</td>
          <td>${escapeHtml(a.target_model || "—")}${a.target_id ? " #" + escapeHtml(a.target_id) : ""}</td>
          <td>${formatDate(a.created_at)}</td>
          <td>${a.ip_address ? escapeHtml(a.ip_address) : "—"}</td>
        </tr>`).join("");
      wrap.innerHTML = `<table class="adm-table"><thead><tr><th>Admin</th><th>Action</th><th>Target</th><th>When</th><th>IP</th></tr></thead><tbody>${rows}</tbody></table>`;

      const totalPages = Math.max(data.total_pages, 1);
      document.getElementById("auditPagination").innerHTML = `
        <span>${data.total} entr${data.total === 1 ? "y" : "ies"} — page ${data.page} of ${totalPages}</span>
        <div class="controls">
          <button class="adm-btn sm" id="auditPrev" ${data.page <= 1 ? "disabled" : ""}>← Prev</button>
          <button class="adm-btn sm" id="auditNext" ${data.page >= totalPages ? "disabled" : ""}>Next →</button>
        </div>`;
      const prevBtn = document.getElementById("auditPrev"), nextBtn = document.getElementById("auditNext");
      if (prevBtn) prevBtn.onclick = () => { auditState.page--; loadAuditLogs(); };
      if (nextBtn) nextBtn.onclick = () => { auditState.page++; loadAuditLogs(); };
    } catch (err) {
      wrap.innerHTML = `<div class="adm-empty">${escapeHtml(err.message)}</div>`;
    }
  }

  function wireAuditToolbar() {
    document.getElementById("auditActionFilter").addEventListener("change", (e) => { auditState.action = e.target.value; auditState.page = 1; loadAuditLogs(); });
    let t;
    document.getElementById("auditActorFilter").addEventListener("input", (e) => {
      clearTimeout(t);
      t = setTimeout(() => { auditState.actor = e.target.value.trim(); auditState.page = 1; loadAuditLogs(); }, 350);
    });
  }

  // ---------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------

  function loadSettingsSection() {
    document.getElementById("settingsName").textContent = currentUser.name;
    document.getElementById("settingsEmail").textContent = currentUser.email;
    document.getElementById("settingsRole").textContent = currentUser.role.replace("_", " ");
  }

  function wireSettingsToolbar() {
    document.getElementById("sendResetBtn").addEventListener("click", async () => {
      try {
        await authedFetch("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email: currentUser.email }) });
        toast("If your email is registered, a reset link is on its way.", "success");
      } catch (err) { toast(err.message, "error"); }
    });
  }

  // ---------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------

  window.addEventListener("load", () => {
    const loader = document.getElementById("loader");
    if (loader) setTimeout(() => loader.classList.add("hide"), 300);
  });

  async function checkAccessAndBoot() {
    const token = getToken();
    const app = document.getElementById("adminApp");
    const denied = document.getElementById("adminDenied");

    if (!token) { denied.style.display = "block"; return; }

    try {
      const data = await authedFetch("/api/auth/me");
      if (!["admin", "super_admin"].includes(data.user.role)) {
        denied.style.display = "block";
        return;
      }
      currentUser = data.user;

      document.getElementById("admUserAvatar").textContent = initials(currentUser.name);
      document.getElementById("admUserName").textContent = currentUser.name;
      document.getElementById("admUserRole").textContent = currentUser.role.replace("_", " ");

      app.classList.add("is-visible");
      wireNav();
      wireMemberToolbar();
      wireNetworkToolbar();
      wireGoalsToolbar();
      wireAchievementsToolbar();
      wirePointsToolbar();
      wireIncomeToolbar();
      wireContentTabs();
      wireContentToolbar();
      wireMessagesToolbar();
      wirePermissionsToolbar();
      wireAuditToolbar();
      populateAuditActionFilter();
      wireSettingsToolbar();
      applyPermissionsToNav();

      const initialSection = (window.location.hash || "").replace("#", "") || "dashboard";
      showSection(initialSection);
      refreshUnreadDot();
    } catch {
      denied.style.display = "block";
    }
  }

  document.addEventListener("DOMContentLoaded", checkAccessAndBoot);
})();
