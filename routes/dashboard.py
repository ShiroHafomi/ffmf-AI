"""Standalone web dashboard for the FFMS AI Microservice — GET /dashboard.

A single, zero-build HTML page (embedded CSS + vanilla JS + Chart.js via CDN)
served directly by the FastAPI app. It calls the service's own JSON endpoints
(``/predict`` and ``/insights``) same-origin, so there is no CORS or node_modules
involved. Purely a presentation layer — it adds no new data or business logic.

Note: this route is intentionally NOT rate-limited and NOT behind the API-key
middleware path check beyond the global one; it only serves static HTML. The XHR
calls it makes still carry the ``X-API-Key`` the user enters (if any).
"""

from fastapi import APIRouter
from fastapi.responses import HTMLResponse

router = APIRouter()


_PAGE = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>FFMS AI · Dashboard</title>
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
    font-size: 15px; font-weight: 600; cursor: pointer; transition: transform .08s ease, filter .2s;
  }
  button.go:hover { filter: brightness(1.08); }
  button.go:active { transform: translateY(1px); }
  button.go:disabled { opacity: .6; cursor: default; }

  .tabs { display: flex; gap: 6px; margin: 26px 0 16px; }
  .tab {
    background: transparent; border: 1px solid var(--line); color: var(--muted);
    padding: 9px 18px; border-radius: 999px; cursor: pointer; font-size: 14px; font-weight: 600;
    transition: all .15s;
  }
  .tab.active { color: white; background: var(--card-2); border-color: var(--brand); }

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
  .chip { display: inline-block; padding: 4px 10px; margin: 3px 4px 0 0; border-radius: 8px;
          background: var(--bg-soft); border: 1px solid var(--line); font-size: 12px; color: var(--muted); }

  ul.clean { list-style: none; margin: 0; padding: 0; }
  ul.clean li { padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; margin-bottom: 8px; background: var(--bg-soft); font-size: 14px; }
  .pri-high { border-left: 3px solid var(--bad); }
  .pri-medium { border-left: 3px solid var(--warn); }
  .pri-low { border-left: 3px solid var(--good); }

  .empty { color: var(--muted); font-size: 14px; padding: 20px; text-align: center; }
  .status-bar { margin-top: 14px; min-height: 20px; font-size: 14px; }
  .status-bar.err { color: var(--bad); }
  .status-bar.loading { color: var(--brand); }
  .hidden { display: none !important; }
  .muted { color: var(--muted); }
  canvas { max-height: 280px; }
</style>
</head>
<body>
<header class="top">
  <div class="logo">₣</div>
  <div>
    <h1>FFMS AI · Financial Dashboard</h1>
    <p>Household expense forecasting &amp; insights</p>
  </div>
</header>

<div class="wrap">
  <div class="controls">
    <div class="field">
      <label for="hid">Household ID</label>
      <input id="hid" type="number" min="1" value="1" placeholder="e.g. 1" />
    </div>
    <div class="field">
      <label for="key">X-API-Key <span class="muted">(optional)</span></label>
      <input id="key" type="password" placeholder="leave blank if disabled" />
    </div>
    <button class="go" id="load">Analyze</button>
  </div>

  <div class="tabs">
    <button class="tab active" data-tab="predict">Prediction</button>
    <button class="tab" data-tab="insights">Insights</button>
  </div>

  <div class="status-bar" id="status"></div>

  <!-- PREDICT TAB -->
  <section id="tab-predict" class="grid">
    <div class="card col-4">
      <h3>Next Month Forecast</h3>
      <div class="big-num" id="p-predicted">—</div>
      <div class="sub" id="p-method">Awaiting data…</div>
      <div style="margin-top:14px"><span class="badge normal" id="p-status">—</span></div>
    </div>
    <div class="card col-4">
      <h3>Vs. Last Month</h3>
      <div class="row"><span class="k">Last month</span><span class="v" id="p-last">—</span></div>
      <div class="row"><span class="k">Predicted</span><span class="v" id="p-pred2">—</span></div>
      <div class="row"><span class="k">Change</span><span class="v" id="p-change">—</span></div>
      <div class="row"><span class="k">Budget</span><span class="v" id="p-budget">—</span></div>
    </div>
    <div class="card col-4">
      <h3>Confidence &amp; Interval</h3>
      <div id="p-conf"><span class="chip">confidence —</span></div>
      <div class="sub" style="margin-top:10px" id="p-interval">—</div>
      <div class="sub" style="margin-top:10px" id="p-expl"></div>
    </div>
    <div class="card col-8">
      <h3>Forecast &amp; Prediction Interval</h3>
      <canvas id="chart-predict"></canvas>
    </div>
    <div class="card col-4">
      <h3>Suggestions</h3>
      <ul class="clean" id="p-suggestions"><li class="muted">—</li></ul>
    </div>
  </section>

  <!-- INSIGHTS TAB -->
  <section id="tab-insights" class="grid hidden">
    <div class="card col-3">
      <h3>Expense Forecast</h3>
      <div class="big-num" id="i-expense">—</div>
      <div class="sub" id="i-expense-status"></div>
    </div>
    <div class="card col-3">
      <h3>Income Forecast</h3>
      <div class="big-num" id="i-income">—</div>
      <div class="sub" id="i-income-status"></div>
    </div>
    <div class="card col-3">
      <h3>Projected Savings</h3>
      <div class="big-num" id="i-savings">—</div>
      <div class="sub" id="i-savings-status"></div>
    </div>
    <div class="card col-3">
      <h3>Forecast Quality</h3>
      <div class="row"><span class="k">MAE</span><span class="v" id="i-mae">—</span></div>
      <div class="row"><span class="k">MAPE</span><span class="v" id="i-mape">—</span></div>
      <div class="row"><span class="k">Skill vs naive</span><span class="v" id="i-skill">—</span></div>
    </div>
    <div class="card col-8">
      <h3>Category Forecast (next month)</h3>
      <canvas id="chart-categories"></canvas>
    </div>
    <div class="card col-4">
      <h3>Anomalies</h3>
      <ul class="clean" id="i-anomalies"><li class="muted">—</li></ul>
    </div>
    <div class="card col-6">
      <h3>Recommended Actions</h3>
      <ul class="clean" id="i-actions"><li class="muted">—</li></ul>
    </div>
    <div class="card col-6">
      <h3>Category Alerts &amp; Cutbacks</h3>
      <ul class="clean" id="i-cutbacks"><li class="muted">—</li></ul>
    </div>
  </section>
</div>

<script>
const $ = (id) => document.getElementById(id);
let predictChart = null, catChart = null;

const fmt = (n) => (n === null || n === undefined || isNaN(n))
  ? "—"
  : new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(n));
const pct = (n) => (n === null || n === undefined || isNaN(n)) ? "—" : (Number(n) >= 0 ? "+" : "") + Number(n).toFixed(1) + "%";

function setStatus(msg, kind) {
  const el = $("status");
  el.textContent = msg || "";
  el.className = "status-bar" + (kind ? " " + kind : "");
}

function headers() {
  const key = $("key").value.trim();
  return key ? { "X-API-Key": key } : {};
}

async function getJSON(url) {
  const res = await fetch(url, { headers: headers() });
  let body = null;
  try { body = await res.json(); } catch (e) { /* ignore */ }
  if (!res.ok) {
    const detail = body && body.detail ? (typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail)) : res.statusText;
    throw new Error(detail + " (HTTP " + res.status + ")");
  }
  return body;
}

// ─────────── Tabs ───────────
document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
  t.classList.add("active");
  const tab = t.dataset.tab;
  $("tab-predict").classList.toggle("hidden", tab !== "predict");
  $("tab-insights").classList.toggle("hidden", tab !== "insights");
}));

// ─────────── Render: Predict ───────────
function renderPredict(d) {
  $("p-predicted").textContent = fmt(d.predicted);
  $("p-method").textContent = d.prediction_method ? ("model: " + d.prediction_method) : "";
  const st = $("p-status"); st.textContent = d.status || "—"; st.className = "badge " + (d.status || "normal");

  $("p-last").textContent = fmt(d.last_month);
  $("p-pred2").textContent = fmt(d.predicted);
  $("p-change").textContent = pct(d.increase_percent);
  $("p-budget").textContent = d.budget != null ? fmt(d.budget) : "—";

  $("p-conf").innerHTML = '<span class="chip">confidence ' + (d.prediction_confidence || "—") + '</span>'
    + (d.prediction_method ? '<span class="chip">' + d.prediction_method + '</span>' : '');
  const iv = d.prediction_interval;
  $("p-interval").textContent = (iv && iv.length === 2) ? ("Interval: " + fmt(iv[0]) + " – " + fmt(iv[1])) : "";
  $("p-expl").textContent = d.prediction_explanation || "";

  const sug = (d.prediction_suggestions && d.prediction_suggestions.length) ? d.prediction_suggestions
            : (d.suggestion ? [d.suggestion] : []);
  $("p-suggestions").innerHTML = sug.length ? sug.map(s => "<li>" + escapeHtml(s) + "</li>").join("")
                                            : '<li class="muted">No suggestions.</li>';

  const iv2 = (iv && iv.length === 2) ? iv : [d.predicted, d.predicted];
  const labels = ["Last month", "Predicted", "Interval low", "Interval high"];
  const data = [d.last_month, d.predicted, iv2[0], iv2[1]];
  const colors = ["#9aa0c3", "#6c8cff", "#37d39b", "#ff6b8b"];
  if (predictChart) predictChart.destroy();
  predictChart = new Chart($("chart-predict"), {
    type: "bar",
    data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: 8 }] },
    options: baseChartOpts()
  });
}

// ─────────── Render: Insights ───────────
function renderInsights(d) {
  const ex = (d.predictions && d.predictions.expense) || {};
  const inc = (d.predictions && d.predictions.income) || null;
  const sav = d.savings || {};

  $("i-expense").textContent = fmt(ex.predicted);
  $("i-expense-status").innerHTML = ex.status ? '<span class="badge ' + ex.status + '">' + ex.status + "</span> " + pct(ex.increase_percent) : "";

  $("i-income").textContent = inc ? fmt(inc.predicted) : "—";
  $("i-income-status").innerHTML = (inc && inc.status) ? '<span class="badge ' + inc.status + '">' + inc.status + "</span> " + pct(inc.increase_percent) : '<span class="muted">no income data</span>';

  $("i-savings").textContent = sav.surplus != null ? fmt(sav.surplus) : "—";
  $("i-savings-status").innerHTML = sav.status ? '<span class="badge ' + sav.status + '">' + sav.status + "</span>" : "";

  const fq = (d.predictions && d.predictions.forecast_quality) || null;
  $("i-mae").textContent = fq ? fmt(fq.mae) : "—";
  $("i-mape").textContent = fq ? (fq.mape_percent + "%") : "—";
  $("i-skill").textContent = (fq && fq.skill_vs_naive != null) ? fq.skill_vs_naive : "—";

  // Anomalies
  const an = d.anomalies || [];
  $("i-anomalies").innerHTML = an.length
    ? an.map(a => '<li class="' + (a.direction === "high" ? "pri-high" : "pri-medium") + '"><b>' + a.month + "</b> · " + fmt(a.amount) + " (" + pct(a.deviation_percent) + " vs median)</li>").join("")
    : '<li class="muted">No anomalies detected.</li>';

  // Actions
  const acts = d.recommended_actions || [];
  $("i-actions").innerHTML = acts.length
    ? acts.map(a => '<li class="pri-' + (a.priority || "low") + '"><b>' + (a.priority || "") + "</b> · " + escapeHtml(a.text || "") + "</li>").join("")
    : '<li class="muted">No actions — all good!</li>';

  // Cutbacks + alerts
  const levers = (d.cutback_suggestions && d.cutback_suggestions.levers) || [];
  const alerts = (d.alert_thresholds && d.alert_thresholds.result && d.alert_thresholds.result.alerts) || [];
  let cb = "";
  alerts.forEach(a => { cb += '<li class="pri-high"><b>' + a.lever + "</b> · " + a.budget_usage + "% of budget (alert " + a.threshold + "%)</li>"; });
  levers.forEach(l => { cb += '<li class="pri-medium"><b>' + l.lever + "</b> · cut " + fmt(l.suggested_cutback) + " to hit budget " + fmt(l.budget) + "</li>"; });
  $("i-cutbacks").innerHTML = cb || '<li class="muted">No overspending — nice work!</li>';

  // Category forecast chart
  const cats = (d.predictions && d.predictions.category_forecast) || [];
  const top = cats.slice(0, 8);
  if (catChart) catChart.destroy();
  if (top.length) {
    catChart = new Chart($("chart-categories"), {
      type: "bar",
      data: {
        labels: top.map(c => c.category),
        datasets: [
          { label: "Last", data: top.map(c => c.last), backgroundColor: "#3a3f66", borderRadius: 6 },
          { label: "Predicted", data: top.map(c => c.predicted), backgroundColor: "#6c8cff", borderRadius: 6 },
        ]
      },
      options: baseChartOpts(true)
    });
  } else {
    if (catChart) { catChart.destroy(); catChart = null; }
  }
}

function baseChartOpts(legend) {
  return {
    responsive: true,
    plugins: {
      legend: { display: !!legend, labels: { color: "#9aa0c3" } },
      tooltip: { callbacks: { label: (c) => " " + fmt(c.parsed.y) } }
    },
    scales: {
      x: { ticks: { color: "#9aa0c3" }, grid: { color: "rgba(255,255,255,.04)" } },
      y: { ticks: { color: "#9aa0c3", callback: (v) => fmt(v) }, grid: { color: "rgba(255,255,255,.06)" } }
    }
  };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ─────────── Load ───────────
async function loadAll() {
  const hid = parseInt($("hid").value, 10);
  if (!hid || hid < 1) { setStatus("Enter a valid household ID (positive integer).", "err"); return; }
  $("load").disabled = true;
  setStatus("Loading forecast & insights…", "loading");
  try {
    const [predict, insights] = await Promise.all([
      getJSON("/predict/" + hid),
      getJSON("/insights/" + hid),
    ]);
    renderPredict(predict);
    renderInsights(insights);
    setStatus("Updated for household #" + hid + ".", "");
  } catch (e) {
    setStatus("Error: " + e.message, "err");
  } finally {
    $("load").disabled = false;
  }
}

$("load").addEventListener("click", loadAll);
$("hid").addEventListener("keydown", e => { if (e.key === "Enter") loadAll(); });
$("key").addEventListener("keydown", e => { if (e.key === "Enter") loadAll(); });
</script>
</body>
</html>
"""


@router.get("/dashboard", response_class=HTMLResponse, include_in_schema=False)
def dashboard() -> HTMLResponse:
    """Serve the standalone HTML dashboard (no build step, same-origin)."""
    return HTMLResponse(content=_PAGE)
