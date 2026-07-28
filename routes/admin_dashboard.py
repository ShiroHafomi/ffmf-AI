"""Admin dashboard — standalone HTML page served at /admin/dashboard.

Zero-build: embedded CSS + vanilla JS + Chart.js via CDN. Calls same-origin
/admin/* JSON endpoints. Requires X-Admin-Key header (user enters in UI).
"""

from fastapi import APIRouter
from fastapi.responses import HTMLResponse

router = APIRouter()


_PAGE = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>FFMS AI · Admin Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<style>
  :root {
    --bg: #0f1220;
    --bg-soft: #171a2e;
    --card: #1c2038;
    --card-2: #232847;
    --line: #2c3157;
    --text: #e8eaf6;
    --muted: #9aa0c3;
    --brand: #6c8cff;
    --brand-2: #9a6cff;
    --good: #37d39b;
    --warn: #ffcc66;
    --bad: #ff6b8b;
    --radius: 16px;
    --shadow: 0 10px 40px rgba(0,0,0,.35);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Segoe UI", system-ui, -apple-system, Roboto, Helvetica, Arial, sans-serif;
    background: radial-gradient(1200px 600px at 80% -10%, #23305e 0%, transparent 60%),
                radial-gradient(1000px 500px at -10% 10%, #3a2260 0%, transparent 55%),
                var(--bg);
    color: var(--text);
    min-height: 100vh;
  }
  header.top {
    padding: 28px 32px;
    display: flex; align-items: center; gap: 16px;
    border-bottom: 1px solid var(--line);
    background: rgba(15,18,32,.6);
    backdrop-filter: blur(8px);
    position: sticky; top: 0; z-index: 10;
  }
  .logo {
    width: 44px; height: 44px; border-radius: 12px;
    background: linear-gradient(135deg, var(--brand), var(--brand-2));
    display: grid; place-items: center; font-weight: 800; font-size: 20px;
    box-shadow: var(--shadow);
  }
  header.top h1 { font-size: 20px; margin: 0; letter-spacing: .2px; }
  header.top p { margin: 2px 0 0; color: var(--muted); font-size: 13px; }
  .wrap { max-width: 1140px; margin: 0 auto; padding: 28px 24px 80px; }

  .controls {
    display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end;
    background: var(--card); border: 1px solid var(--line);
    border-radius: var(--radius); padding: 18px; box-shadow: var(--shadow);
  }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .field label { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .6px; }
  .field input {
    background: var(--bg-soft); border: 1px solid var(--line); color: var(--text);
    border-radius: 10px; padding: 11px 13px; font-size: 15px; min-width: 160px; outline: none;
  }
  .field input:focus { border-color: var(--brand); box-shadow: 0 0 0 3px rgba(108,140,255,.2); }
  button.go {
    background: linear-gradient(135deg, var(--brand), var(--brand-2));
    color: white; border: 0; border-radius: 10px; padding: 12px 22px;
    font-size: 15px; font-weight: 600; cursor: pointer;
    transition: transform .08s ease, filter .2s;
  }
  button.go:hover { filter: brightness(1.08); }
  button.go:active { transform: translateY(1px); }
  button.go:disabled { opacity: .6; cursor: default; }
  button.danger {
    background: linear-gradient(135deg, var(--bad), #d64a6e);
    color: white; border: 0; border-radius: 10px; padding: 12px 22px;
    font-size: 15px; font-weight: 600; cursor: pointer;
  }
  button.danger:hover { filter: brightness(1.08); }

  .tabs { display: flex; gap: 6px; margin: 26px 0 16px; flex-wrap: wrap; }
  .tab {
    background: transparent; border: 1px solid var(--line); color: var(--muted);
    padding: 9px 18px; border-radius: 999px; cursor: pointer; font-size: 14px; font-weight: 600;
    transition: all .15s;
  }
  .tab.active { color: white; background: var(--card-2); border-color: var(--brand); }
  .tab:hover:not(.active) { border-color: var(--brand); color: var(--text); }

  .grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 16px; }
  .card {
    background: var(--card); border: 1px solid var(--line); border-radius: var(--radius);
    padding: 20px; box-shadow: var(--shadow);
  }
  .card h3 { margin: 0 0 14px; font-size: 13px; color: var(--muted); text-transform: uppercase; letter-spacing: .6px; }
  .col-12 { grid-column: span 12; } .col-8 { grid-column: span 8; }
  .col-6 { grid-column: span 6; } .col-4 { grid-column: span 4; } .col-3 { grid-column: span 3; }
  @media (max-width: 860px) { .col-8,.col-6,.col-4,.col-3 { grid-column: span 12; } }

  .big-num { font-size: 40px; font-weight: 800; line-height: 1.1; }
  .sub { color: var(--muted); font-size: 13px; margin-top: 4px; }
  .row { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; padding: 8px 0; border-bottom: 1px dashed var(--line); }
  .row:last-child { border-bottom: 0; }
  .row .k { color: var(--muted); font-size: 13px; } .row .v { font-weight: 700; }

  .badge { display: inline-block; padding: 5px 12px; border-radius: 999px; font-size: 12px; font-weight: 700; letter-spacing: .3px; }
  .badge.normal, .badge.positive { background: rgba(55,211,155,.14); color: var(--good); }
  .badge.warning, .badge.surplus { background: rgba(255,204,102,.16); color: var(--warn); }
  .badge.abnormal, .badge.deficit, .badge.high { background: rgba(255,107,139,.16); color: var(--bad); }
  .badge.admin { background: linear-gradient(135deg, var(--brand), var(--brand-2)); color: white; }
  .chip { display: inline-block; padding: 4px 10px; margin: 3px 4px 0 0; border-radius: 8px;
          background: var(--bg-soft); border: 1px solid var(--line); font-size: 12px; color: var(--muted); }

  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid var(--line); }
  th { color: var(--muted); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: .5px; }
  td { color: var(--text); }
  tr:hover td { background: var(--bg-soft); }
  .actions { display: flex; gap: 6px; }
  .btn-sm {
    padding: 6px 12px; font-size: 12px; border-radius: 8px; border: 1px solid var(--line);
    background: var(--bg-soft); color: var(--text); cursor: pointer; transition: all .15s;
  }
  .btn-sm:hover { border-color: var(--brand); color: var(--brand); }
  .btn-sm.danger:hover { border-color: var(--bad); color: var(--bad); }
  .btn-sm:disabled { opacity: .5; cursor: not-allowed; }

  ul.clean { list-style: none; margin: 0; padding: 0; }
  ul.clean li { padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; margin-bottom: 8px; background: var(--bg-soft); font-size: 14px; }
  .pri-high { border-left: 3px solid var(--bad); }
  .pri-medium { border-left: 3px solid var(--warn); }
  .pri-low { border-left: 3px solid var(--good); }

  .empty { color: var(--muted); font-size: 14px; padding: 20px; text-align: center; }
  .status-bar { margin-top: 14px; min-height: 20px; font-size: 14px; }
  .status-bar.err { color: var(--bad); }
  .status-bar.loading { color: var(--brand); }
  .status-bar.ok { color: var(--good); }
  .hidden { display: none !important; }
  .muted { color: var(--muted); }
  canvas { max-height: 280px; }
  .pagination { display: flex; gap: 6px; justify-content: center; margin-top: 16px; flex-wrap: wrap; }
  .page-btn {
    padding: 8px 14px; border: 1px solid var(--line); border-radius: 8px;
    background: var(--bg-soft); color: var(--text); cursor: pointer; font-size: 13px;
  }
  .page-btn.active { background: var(--brand); border-color: var(--brand); color: white; }
  .page-btn:disabled { opacity: .5; cursor: not-allowed; }
  .page-btn:hover:not(:disabled):not(.active) { border-color: var(--brand); }

  .modal { position: fixed; inset: 0; background: rgba(0,0,0,.6); display: none; align-items: center; justify-content: center; z-index: 100; }
  .modal.show { display: flex; }
  .modal-box { background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); padding: 24px; min-width: 360px; max-width: 90vw; box-shadow: var(--shadow); }
  .modal-box h3 { margin: 0 0 16px; }
  .modal-box .field { margin-bottom: 12px; }
  .modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px; }
  .logs { max-height: 400px; overflow-y: auto; font-family: monospace; font-size: 12px; }
  .log-line { padding: 4px 8px; border-bottom: 1px solid var(--line); white-space: pre-wrap; word-break: break-word; }
  .log-line.error { background: rgba(255,107,139,.1); border-left: 3px solid var(--bad); }
  .log-line.warn  { background: rgba(255,204,102,.1); border-left: 3px solid var(--warn); }
  .log-line.info  { background: rgba(108,140,255,.1); border-left: 3px solid var(--brand); }
</style>
</head>
<body>
<header class="top">
  <div class="logo">⚙</div>
  <div>
    <h1>FFMS AI · Admin Dashboard</h1>
    <p>System-wide management & monitoring</p>
  </div>
</header>

<div class="wrap">
  <div class="controls">
    <div class="field">
      <label for="akey">X-Admin-Key <span class="muted">(required)</span></label>
      <input id="akey" type="password" placeholder="Enter admin API key" />
    </div>
    <button class="go" id="load">Load Dashboard</button>
  </div>

  <div class="status-bar" id="status"></div>

  <div class="tabs">
    <button class="tab active" data-tab="overview">Overview</button>
    <button class="tab" data-tab="users">Users</button>
    <button class="tab" data-tab="households">Households</button>
    <button class="tab" data-tab="expenses">Expenses</button>
    <button class="tab" data-tab="budgets">Budgets</button>
    <button class="tab" data-tab="categories">Categories</button>
    <button class="tab" data-tab="incomes">Incomes</button>
    <button class="tab" data-tab="cache">Cache</button>
    <button class="tab" data-tab="health">Health</button>
    <button class="tab" data-tab="logs">Logs</button>
  </div>

  <!-- OVERVIEW -->
  <section id="tab-overview" class="grid">
    <div class="card col-3"><h3>Total Users</h3><div class="big-num" id="st-users">—</div></div>
    <div class="card col-3"><h3>Total Households</h3><div class="big-num" id="st-households">—</div></div>
    <div class="card col-3"><h3>Total Expenses</h3><div class="big-num" id="st-expenses">—</div></div>
    <div class="card col-3"><h3>Total Incomes</h3><div class="big-num" id="st-incomes">—</div></div>
    <div class="card col-6">
      <h3>Cache Status</h3>
      <div class="row"><span class="k">Total Entries</span><span class="v" id="ch-total">—</span></div>
      <div class="row"><span class="k">Active</span><span class="v" id="ch-active">—</span></div>
      <div class="row"><span class="k">Expired</span><span class="v" id="ch-expired">—</span></div>
      <div class="row"><span class="k">TTL (sec)</span><span class="v" id="ch-ttl">—</span></div>
      <div class="row"><span class="k">Max Entries</span><span class="v" id="ch-max">—</span></div>
    </div>
    <div class="card col-6">
      <h3>Cache by Household</h3>
      <div id="ch-by-household" class="muted">Loading…</div>
    </div>
  </section>

  <!-- USERS -->
  <section id="tab-users" class="grid hidden">
    <div class="card col-12">
      <h3>All Users</h3>
      <div id="users-table" class="muted">Loading…</div>
      <div class="pagination" id="users-pagination"></div>
    </div>
  </section>

  <!-- HOUSEHOLDS -->
  <section id="tab-households" class="grid hidden">
    <div class="card col-12">
      <h3>All Households</h3>
      <div id="households-table" class="muted">Loading…</div>
      <div class="pagination" id="households-pagination"></div>
    </div>
  </section>

  <!-- EXPENSES -->
  <section id="tab-expenses" class="grid hidden">
    <div class="card col-12">
      <h3>All Expenses</h3>
      <div class="controls" style="margin-bottom:16px">
        <div class="field"><label>Household Filter</label><input id="exp-household" type="number" min="1" placeholder="All households" /></div>
        <button class="go" id="exp-load">Filter</button>
      </div>
      <div id="expenses-table" class="muted">Loading…</div>
      <div class="pagination" id="expenses-pagination"></div>
    </div>
  </section>

  <!-- BUDGETS -->
  <section id="tab-budgets" class="grid hidden">
    <div class="card col-12">
      <h3>All Budgets</h3>
      <div class="controls" style="margin-bottom:16px">
        <div class="field"><label>Household Filter</label><input id="bud-household" type="number" min="1" placeholder="All households" /></div>
        <button class="go" id="bud-load">Filter</button>
      </div>
      <div id="budgets-table" class="muted">Loading…</div>
      <div class="pagination" id="budgets-pagination"></div>
    </div>
  </section>

  <!-- CATEGORIES -->
  <section id="tab-categories" class="grid hidden">
    <div class="card col-12">
      <h3>All Categories</h3>
      <div class="controls" style="margin-bottom:16px">
        <div class="field"><label>Household Filter</label><input id="cat-household" type="number" min="1" placeholder="All households" /></div>
        <button class="go" id="cat-load">Filter</button>
      </div>
      <div id="categories-table" class="muted">Loading…</div>
      <div class="pagination" id="categories-pagination"></div>
    </div>
  </section>

  <!-- INCOMES -->
  <section id="tab-incomes" class="grid hidden">
    <div class="card col-12">
      <h3>All Incomes</h3>
      <div class="controls" style="margin-bottom:16px">
        <div class="field"><label>Household Filter</label><input id="inc-household" type="number" min="1" placeholder="All households" /></div>
        <button class="go" id="inc-load">Filter</button>
      </div>
      <div id="incomes-table" class="muted">Loading…</div>
      <div class="pagination" id="incomes-pagination"></div>
    </div>
  </section>

  <!-- CACHE -->
  <section id="tab-cache" class="grid hidden">
    <div class="card col-6">
      <h3>Cache Stats</h3>
      <div class="row"><span class="k">Total Entries</span><span class="v" id="cache-total">—</span></div>
      <div class="row"><span class="k">Active</span><span class="v" id="cache-active">—</span></div>
      <div class="row"><span class="k">Expired</span><span class="v" id="cache-expired">—</span></div>
      <div class="row"><span class="k">TTL (seconds)</span><span class="v" id="cache-ttl">—</span></div>
      <div class="row"><span class="k">Max Entries</span><span class="v" id="cache-max">—</span></div>
      <div style="margin-top:16px">
        <button class="danger" id="cache-clear-all">Clear All Cache</button>
      </div>
    </div>
    <div class="card col-6">
      <h3>Clear by Household</h3>
      <div class="field" style="margin-bottom:12px"><label>Household ID</label><input id="cache-hid" type="number" min="1" placeholder="e.g. 1" /></div>
      <button class="go" id="cache-clear-hid">Clear This Household</button>
    </div>
  </section>

  <!-- HEALTH -->
  <section id="tab-health" class="grid hidden">
    <div class="card col-6">
      <h3>System Health</h3>
      <div id="health-sys" class="muted">Loading…</div>
    </div>
    <div class="card col-6">
      <h3>Database Pool</h3>
      <div id="health-db" class="muted">Loading…</div>
    </div>
    <div class="card col-6">
      <h3>Cache</h3>
      <div id="health-cache" class="muted">Loading…</div>
    </div>
    <div class="card col-6">
      <h3>Rate Limit</h3>
      <div id="health-rl" class="muted">Loading…</div>
    </div>
  </section>

  <!-- LOGS -->
  <section id="tab-logs" class="grid hidden">
    <div class="card col-12">
      <h3>Application Logs</h3>
      <div class="controls" style="margin-bottom:16px">
        <div class="field"><label>Level</label>
          <select id="log-level" style="background:var(--bg-soft);border:1px solid var(--line);color:var(--text);border-radius:10px;padding:11px 13px;font-size:15px;min-width:160px">
            <option value="">All</option>
            <option value="ERROR">ERROR</option>
            <option value="WARNING">WARNING</option>
            <option value="INFO">INFO</option>
            <option value="DEBUG">DEBUG</option>
          </select>
        </div>
        <div class="field"><label>Date (YYYY-MM-DD)</label><input id="log-date" type="text" placeholder="2026-07-28" /></div>
        <button class="go" id="log-load">Load Logs</button>
      </div>
      <div id="logs-container" class="logs muted">Select filters and click Load Logs</div>
    </div>
  </section>
</div>

<!-- Modals -->
<div class="modal" id="modal-user-role">
  <div class="modal-box">
    <h3>Change User Role</h3>
    <div class="field"><label>User ID</label><input id="mur-id" type="number" readonly /></div>
    <div class="field"><label>New Role</label><select id="mur-role" style="background:var(--bg-soft);border:1px solid var(--line);color:var(--text);border-radius:10px;padding:11px 13px;font-size:15px"><option value="3">Member (3)</option><option value="1">Admin (1)</option></select></div>
    <div class="modal-actions">
      <button class="btn-sm" id="mur-cancel">Cancel</button>
      <button class="go" id="mur-save">Save</button>
    </div>
  </div>
</div>

<div class="modal" id="modal-household-members">
  <div class="modal-box" style="max-width:600px;">
    <h3>Household Members</h3>
    <div id="hm-table-container"></div>
    <div class="modal-actions" style="justify-content:flex-end;">
      <button class="go" id="hm-close">Close</button>
    </div>
  </div>
</div>

<div class="modal" id="modal-confirm">
  <div class="modal-box">
    <h3 id="confirm-title">Confirm</h3>
    <p id="confirm-msg" class="muted"></p>
    <div class="modal-actions">
      <button class="btn-sm" id="confirm-cancel">Cancel</button>
      <button class="danger" id="confirm-ok">Confirm</button>
    </div>
  </div>
</div>

<script>
const $ = (id) => document.getElementById(id);
let usersPage = 1, householdsPage = 1, expensesPage = 1, budgetsPage = 1, categoriesPage = 1, incomesPage = 1;
let actingUserId = 1;

const fmt = (n) => (n === null || n === undefined || isNaN(n)) ? "—" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(n));
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "'");

function headers() {
  const key = $("akey").value.trim();
  return key ? { "X-Admin-Key": key } : {};
}

async function getJSON(url) {
  const res = await fetch(url, { headers: headers() });
  let body = null;
  try { body = await res.json(); } catch (e) {}
  if (!res.ok) {
    const detail = body && body.detail ? (typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail)) : res.statusText;
    throw new Error(detail + " (HTTP " + res.status + ")");
  }
  return body;
}

function setStatus(msg, kind) {
  const el = $("status");
  el.textContent = msg || "";
  el.className = "status-bar" + (kind ? " " + kind : "");
}

// ─── Tabs ───
document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
  t.classList.add("active");
  const tab = t.dataset.tab;
  document.querySelectorAll('[id^="tab-"]').forEach(s => s.classList.toggle("hidden", s.id !== "tab-" + tab));
}));

// ─── Pagination helper ───
function renderPagination(containerId, page, totalPages, onPageChange) {
  const el = $(containerId);
  if (totalPages <= 1) { el.innerHTML = ""; return; }
  let html = "";
  if (page > 1) html += `<button class="page-btn" data-page="${page - 1}">‹ Prev</button>`;
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, page + 2);
  for (let i = start; i <= end; i++) {
    html += `<button class="page-btn${i === page ? " active" : ""}" data-page="${i}">${i}</button>`;
  }
  if (page < totalPages) html += `<button class="page-btn" data-page="${page + 1}">Next ›</button>`;
  el.innerHTML = html;
  el.querySelectorAll(".page-btn").forEach(b => b.addEventListener("click", () => onPageChange(Number(b.dataset.page))));
}

// ─── Confirm Modal ───
function showConfirm(title, msg, onConfirm) {
  $("confirm-title").textContent = title;
  $("confirm-msg").textContent = msg;
  confirmAction = onConfirm;
  $("modal-confirm").classList.add("show");
}
$("confirm-cancel").addEventListener("click", () => { $("modal-confirm").classList.remove("show"); confirmAction = null; });
$("confirm-ok").addEventListener("click", () => { if (confirmAction) confirmAction(); $("modal-confirm").classList.remove("show"); confirmAction = null; });

// ─── User Role Modal ───
let editUserId = null;
$("mur-cancel").addEventListener("click", () => { $("modal-user-role").classList.remove("show"); });
$("mur-save").addEventListener("click", async () => {
  if (!editUserId) return;
  const roleId = Number($("mur-role").value);
  try {
    await fetch("/admin/users/" + editUserId + "/role", { method: "PUT", headers: { ...headers(), "Content-Type": "application/json" }, body: JSON.stringify({ role_id: roleId }) });
    setStatus("Role updated", "ok");
    $("modal-user-role").classList.remove("show");
    loadUsers();
  } catch (e) { setStatus("Error: " + e.message, "err"); }
});

function openRoleModal(userId, currentRole) {
  editUserId = userId;
  $("mur-id").value = userId;
  $("mur-role").value = String(currentRole);
  $("modal-user-role").classList.add("show");
}

// ─── Household Members Modal ───
$("hm-close").addEventListener("click", () => { $("modal-household-members").classList.remove("show"); });

// ─── Load: Overview ───
async function loadOverview() {
  try {
    const [stats, cacheStats, health] = await Promise.all([
      getJSON("/admin/stats"),
      getJSON("/admin/cache"),
      getJSON("/admin/health"),
    ]);
    $("st-users").textContent = fmt(stats.total_users);
    $("st-households").textContent = fmt(stats.total_households);
    $("st-expenses").textContent = fmt(stats.total_expenses);
    $("st-incomes").textContent = fmt(stats.total_incomes);
    $("ch-total").textContent = fmt(cacheStats.total_entries);
    $("ch-active").textContent = fmt(cacheStats.active_entries);
    $("ch-expired").textContent = fmt(cacheStats.expired_entries);
    $("ch-ttl").textContent = fmt(cacheStats.ttl_seconds);
    $("ch-max").textContent = fmt(cacheStats.max_entries);

    const byH = cacheStats.by_household || {};
    if (Object.keys(byH).length) {
      $("ch-by-household").innerHTML = Object.entries(byH)
        .sort((a,b) => b[1] - a[1])
        .slice(0, 20)
        .map(([hid, cnt]) => `<span class="chip">HH ${hid}: ${cnt}</span>`).join("");
    } else {
      $("ch-by-household").innerHTML = '<span class="muted">No cached data</span>';
    }

    // Health
    const h = health;
    $("health-sys").innerHTML = `<div class="row"><span class="k">Status</span><span class="v badge">${h.status}</span></div>
      <div class="row"><span class="k">Uptime</span><span class="v">${Math.floor(h.uptime_seconds/3600)}h ${Math.floor((h.uptime_seconds%3600)/60)}m</span></div>`;
    if (h.database) {
      $("health-db").innerHTML = `<div class="row"><span class="k">Pool Size</span><span class="v">${h.database.pool_size}</span></div>
        <div class="row"><span class="k">Active</span><span class="v">${h.database.active_connections}</span></div>
        <div class="row"><span class="k">Idle</span><span class="v">${h.database.idle_connections}</span></div>`;
    }
    if (h.cache) {
      $("health-cache").innerHTML = `<div class="row"><span class="k">Active Entries</span><span class="v">${h.cache.active_entries}</span></div>
        <div class="row"><span class="k">Total Entries</span><span class="v">${h.cache.total_entries}</span></div>`;
    }
    if (h.rate_limit_per_minute) {
      $("health-rl").innerHTML = `<div class="row"><span class="k">Requests/Min</span><span class="v">${h.rate_limit_per_minute}</span></div>`;
    }
  } catch (e) { setStatus("Overview error: " + e.message, "err"); }
}

// ─── Load: Users ───
async function loadUsers(page = 1) {
  usersPage = page;
  try {
    const data = await getJSON("/admin/users?page=" + page + "&page_size=50");
    renderUsersTable(data);
    renderPagination("users-pagination", data.page, data.total_pages, loadUsers);
  } catch (e) { setStatus("Users error: " + e.message, "err"); }
}

function renderUsersTable(data) {
  const rows = data.users;
  if (!rows.length) { $("users-table").innerHTML = '<div class="empty">No users found</div>'; return; }
  let html = `<table><thead><tr><th>ID</th><th>Display ID</th><th>Email</th><th>Name</th><th>Role</th><th>Household</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead><tbody>`;
  for (const u of rows) {
    const roleBadge = u.role_id === 1 ? '<span class="badge admin">Admin</span>' : '<span class="badge">Member</span>';
    html += `<tr>
      <td>${u.id}</td>
      <td>${esc(u.display_id || "")}</td>
      <td>${esc(u.email)}</td>
      <td>${esc(u.name || u.full_name || "")}</td>
      <td>${roleBadge}</td>
      <td>${u.household_id ? "#" + u.household_id : '<span class="muted">—</span>'}</td>
      <td>${u.status === 1 ? '<span class="badge normal">Active</span>' : '<span class="badge warning">Inactive</span>'}</td>
      <td>${esc(u.created_at)}</td>
      <td class="actions">
        <button class="btn-sm" onclick="openRoleModal(${u.id}, ${u.role_id})">Change Role</button>
        <button class="btn-sm danger" onclick="confirmDeleteUser(${u.id})">Delete</button>
      </td>
    </tr>`;
  }
  html += "</tbody></table>";
  $("users-table").innerHTML = html;
}

function confirmDeleteUser(userId) {
  showConfirm("Delete User", "Permanently delete user #" + userId + "? This cannot be undone.", async () => {
    try {
      // acting_user_id: we fetch the first admin to use as the acting user
      const adminRes = await getJSON("/admin/users?search=admin&page_size=1");
      let actingId = 1;
      if (adminRes.users && adminRes.users.length > 0 && adminRes.users[0].role_id === 1) {
        actingId = adminRes.users[0].id;
      }
      await fetch("/admin/users/" + userId + "?acting_user_id=" + actingId, { method: "DELETE", headers: headers() });
      setStatus("User deleted", "ok");
      loadUsers(usersPage);
    } catch (e) { setStatus("Error: " + e.message, "err"); }
  });
}

// ─── Load: Households ───
async function loadHouseholds(page = 1) {
  householdsPage = page;
  try {
    const data = await getJSON("/admin/households?page=" + page + "&page_size=50");
    renderHouseholdsTable(data);
    renderPagination("households-pagination", data.page, data.total_pages, loadHouseholds);
  } catch (e) { setStatus("Households error: " + e.message, "err"); }
}

function renderHouseholdsTable(data) {
  const rows = data.households;
  if (!rows.length) { $("households-table").innerHTML = '<div class="empty">No households</div>'; return; }
  let html = `<table><thead><tr><th>ID</th><th>Name</th><th>Description</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead><tbody>`;
  for (const h of rows) {
    const statusBadge = h.is_deleted ? '<span class="badge abnormal">Deleted</span>' : '<span class="badge normal">Active</span>';
    html += `<tr>
      <td>${h.id}</td>
      <td>${esc(h.name)}</td>
      <td>${esc(h.description || "")}</td>
      <td>${statusBadge}</td>
      <td>${esc(h.created_at)}</td>
      <td class="actions">
        ${!h.is_deleted ? `<button class="btn-sm danger" onclick="confirmDeleteHousehold(${h.id})">Soft-Delete</button>` : ""}
        <button class="btn-sm" onclick="loadHouseholdMembers(${h.id})">View Members</button>
      </td>
    </tr>`;
  }
  html += "</tbody></table>";
  $("households-table").innerHTML = html;
}

function confirmDeleteHousehold(hid) {
  showConfirm("Soft-Delete Household", "Mark household #" + hid + " as deleted? This hides it but preserves data.", async () => {
    try {
      await fetch("/admin/households/" + hid, { method: "DELETE", headers: headers() });
      setStatus("Household soft-deleted", "ok");
      loadHouseholds(householdsPage);
    } catch (e) { setStatus("Error: " + e.message, "err"); }
  });
}

async function loadHouseholdMembers(hid) {
  try {
    const data = await getJSON("/admin/households/" + hid + "/members");
    const rows = data.members;
    if (!rows.length) { setStatus("No members in household #" + hid, "muted"); return; }
    let html = `<table><thead><tr><th>User ID</th><th>Email</th><th>Name</th><th>Role</th><th>Joined</th></tr></thead><tbody>`;
    for (const m of rows) {
      html += `<tr><td>${m.user_id}</td><td>${esc(m.email)}</td><td>${esc(m.name || "")}</td><td><span class="badge">${esc(m.role)}</span></td><td>${esc(m.joined_at || "")}</td></tr>`;
    }
    html += "</tbody></table>";
    $("hm-table-container").innerHTML = html;
    $("modal-household-members").classList.add("show");
  } catch (e) { setStatus("Error: " + e.message, "err"); }
}

// ─── Generic table loader ───
async function loadGenericTable(endpoint, pageVar, page, pageSize, containerId, paginationId, renderFn, filterFn) {
  window[pageVar] = page;
  try {
    let url = endpoint + "?page=" + page + "&page_size=" + pageSize;
    if (filterFn) url += filterFn();
    const data = await getJSON(url);
    renderFn(data);
    renderPagination(paginationId, data.page, data.total_pages, (p) => window[`load${endpoint.split("/")[2].charAt(0).toUpperCase() + endpoint.split("/")[2].slice(1)}`](p));
  } catch (e) { setStatus("Error: " + e.message, "err"); }
}

function loadExpenses(page = 1) {
  const hid = $("exp-household").value.trim();
  const filter = hid ? "&household_id=" + hid : "";
  loadGenericTable("/admin/expenses", "expensesPage", page, 50, "expenses-table", "expenses-pagination", renderExpensesTable, () => filter);
}
function renderExpensesTable(data) {
  const rows = data.expenses;
  if (!rows.length) { $("expenses-table").innerHTML = '<div class="empty">No expenses</div>'; return; }
  let html = `<table><thead><tr><th>ID</th><th>Household</th><th>Category</th><th>Amount</th><th>Description</th><th>Date</th><th>User</th></tr></thead><tbody>`;
  for (const e of rows) {
    html += `<tr><td>${e.id}</td><td>${e.household_id}</td><td>${esc(e.category_name || "")}</td><td>${fmt(e.amount)}</td><td>${esc(e.description || "")}</td><td>${esc(e.expense_date)}</td><td>${e.user_id || "—"}</td></tr>`;
  }
  html += "</tbody></table>";
  $("expenses-table").innerHTML = html;
}

function loadBudgets(page = 1) {
  const hid = $("bud-household").value.trim();
  const filter = hid ? "&household_id=" + hid : "";
  loadGenericTable("/admin/budgets", "budgetsPage", page, 50, "budgets-table", "budgets-pagination", renderBudgetsTable, () => filter);
}
function renderBudgetsTable(data) {
  const rows = data.budgets;
  if (!rows.length) { $("budgets-table").innerHTML = '<div class="empty">No budgets</div>'; return; }
  let html = `<table><thead><tr><th>ID</th><th>Household</th><th>Category</th><th>Year</th><th>Month</th><th>Amount</th></tr></thead><tbody>`;
  for (const b of rows) {
    html += `<tr><td>${b.id}</td><td>${b.household_id}</td><td>${esc(b.category_name || "")}</td><td>${b.year}</td><td>${b.month}</td><td>${fmt(b.amount)}</td></tr>`;
  }
  html += "</tbody></table>";
  $("budgets-table").innerHTML = html;
}

function loadCategories(page = 1) {
  const hid = $("cat-household").value.trim();
  const filter = hid ? "&household_id=" + hid : "";
  loadGenericTable("/admin/categories", "categoriesPage", page, 50, "categories-table", "categories-pagination", renderCategoriesTable, () => filter);
}
function renderCategoriesTable(data) {
  const rows = data.categories;
  if (!rows.length) { $("categories-table").innerHTML = '<div class="empty">No categories</div>'; return; }
  let html = `<table><thead><tr><th>ID</th><th>Household</th><th>Name</th><th>Icon</th><th>Color</th><th>Created</th></tr></thead><tbody>`;
  for (const c of rows) {
    html += `<tr><td>${c.id}</td><td>${c.household_id}</td><td>${esc(c.name)}</td><td>${esc(c.icon || "")}</td><td><span style="display:inline-block;width:16px;height:16px;border-radius:4px;background:${esc(c.color || "#000")}"></span></td><td>${esc(c.created_at)}</td></tr>`;
  }
  html += "</tbody></table>";
  $("categories-table").innerHTML = html;
}

function loadIncomes(page = 1) {
  const hid = $("inc-household").value.trim();
  const filter = hid ? "&household_id=" + hid : "";
  loadGenericTable("/admin/incomes", "incomesPage", page, 50, "incomes-table", "incomes-pagination", renderIncomesTable, () => filter);
}
function renderIncomesTable(data) {
  const rows = data.incomes;
  if (!rows.length) { $("incomes-table").innerHTML = '<div class="empty">No incomes</div>'; return; }
  let html = `<table><thead><tr><th>ID</th><th>Household</th><th>User</th><th>Amount</th><th>Source</th><th>Date</th></tr></thead><tbody>`;
  for (const i of rows) {
    html += `<tr><td>${i.id}</td><td>${i.household_id}</td><td>${esc(i.user_name || "")}</td><td>${fmt(i.amount)}</td><td>${esc(i.source || "")}</td><td>${esc(i.income_date)}</td></tr>`;
  }
  html += "</tbody></table>";
  $("incomes-table").innerHTML = html;
}

// ─── Cache ───
async function loadCache() {
  try {
    const c = await getJSON("/admin/cache");
    $("cache-total").textContent = fmt(c.total_entries);
    $("cache-active").textContent = fmt(c.active_entries);
    $("cache-expired").textContent = fmt(c.expired_entries);
    $("cache-ttl").textContent = fmt(c.ttl_seconds);
    $("cache-max").textContent = fmt(c.max_entries);
  } catch (e) { setStatus("Cache error: " + e.message, "err"); }
}
$("cache-clear-all").addEventListener("click", () => showConfirm("Clear All Cache", "Remove ALL cached predictions?", async () => {
  try {
    const res = await fetch("/admin/cache/clear", { method: "POST", headers: { ...headers(), "Content-Type": "application/json" }, body: JSON.stringify({}) });
    const d = await res.json();
    setStatus("Cleared " + d.cleared + " entries", "ok");
    loadCache();
    loadOverview();
  } catch (e) { setStatus("Error: " + e.message, "err"); }
}));
$("cache-clear-hid").addEventListener("click", async () => {
  const hid = Number($("cache-hid").value);
  if (!hid) { setStatus("Enter a household ID", "err"); return; }
  try {
    const res = await fetch("/admin/cache/clear", { method: "POST", headers: { ...headers(), "Content-Type": "application/json" }, body: JSON.stringify({ household_id: hid }) });
    const d = await res.json();
    setStatus("Cleared " + d.cleared + " entries for household #" + hid, "ok");
    loadCache();
    loadOverview();
  } catch (e) { setStatus("Error: " + e.message, "err"); }
}));

// ─── Health ───
async function loadHealth() {
  try {
    const h = await getJSON("/admin/health");
    // Already rendered in loadOverview
  } catch (e) { setStatus("Health error: " + e.message, "err"); }
}

// ─── Logs ───
$("log-load").addEventListener("click", async () => {
  const level = $("log-level").value;
  const date = $("log-date").value.trim();
  try {
    const data = await getJSON("/admin/logs" + (level ? "?level=" + level : "") + (date ? (level ? "&" : "?") + "date=" + date : "") + "&limit=500");
    renderLogs(data.logs);
  } catch (e) { setStatus("Logs error: " + e.message, "err"); }
});
function renderLogs(logs) {
  if (!logs.length) { $("logs-container").innerHTML = '<div class="empty">No log entries match filters</div>'; return; }
  let html = "";
  for (const l of logs) {
    const cls = (l.level || "").toLowerCase().includes("error") ? "error" : (l.level || "").toLowerCase().includes("warn") ? "warn" : "info";
    html += `<div class="log-line ${cls}">[${l.timestamp || ""}] ${esc(l.level || "")} ${esc(l.source || "")}: ${esc(l.message)}</div>`;
  }
  $("logs-container").innerHTML = html;
}

// ─── Init ───
async function fetchActingUserId() {
  try {
    const data = await getJSON("/admin/users?search=admin&page_size=1");
    if (data.users && data.users.length > 0 && data.users[0].role_id === 1) {
      actingUserId = data.users[0].id;
      return true;
    }
  } catch (e) {
    console.warn("Could not fetch acting user ID:", e.message);
  }
  // Fallback: find any admin
  try {
    const data = await getJSON("/admin/users?page_size=100");
    for (const u of data.users) {
      if (u.role_id === 1) {
        actingUserId = u.id;
        return true;
      }
    }
  } catch (e) {
    console.warn("Could not fetch users for acting ID:", e.message);
  }
  actingUserId = 1; // Ultimate fallback
  return false;
}

$("load").addEventListener("click", async () => {
  if (!$("akey").value.trim()) { setStatus("Enter X-Admin-Key first", "err"); return; }
  $("load").disabled = true;
  setStatus("Loading dashboard…", "loading");
  try {
    await loadOverview();
    // Fetch acting admin user ID
    await fetchActingUserId();
    // Load first page of each table
    await loadUsers(1);
    await loadHouseholds(1);
    await loadExpenses(1);
    await loadBudgets(1);
    await loadCategories(1);
    await loadIncomes(1);
    await loadCache();
    await loadHealth();
    setStatus("Dashboard loaded (acting as user #" + actingUserId + ")", "ok");
  } catch (e) {
    setStatus("Error: " + e.message, "err");
  } finally {
    $("load").disabled = false;
  }
});

// Keyboard shortcut
$("akey").addEventListener("keydown", e => { if (e.key === "Enter") $("load").click(); });
</script>
</body>
</html>
"""


@router.get("/admin/dashboard", response_class=HTMLResponse, include_in_schema=False)
def admin_dashboard() -> HTMLResponse:
    """Serve the standalone admin HTML dashboard."""
    return HTMLResponse(content=_PAGE)