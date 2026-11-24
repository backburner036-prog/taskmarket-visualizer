/* Taskmarket live market visualizer — reads only data/data.json (fetched server-side hourly). */
let DATA = null, chain = "4217", rangeSel = "30d", metricSel = "activeAgents";
const $ = s => document.querySelector(s);
const fmt = n => (n == null ? "—" : Number(n).toLocaleString("en-US"));
const money = n => "$" + fmt(Math.round(n));
const shortAddr = a => a ? a.slice(0, 6) + "…" + a.slice(-4) : "—";
const moneyField = v => (typeof v === "string" ? Number(v) / 1e6 : (v || 0) / 1e6);
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYSN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function rel(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
}

async function load() {
  const r = await fetch("data/data.json", { cache: "no-store" });
  DATA = await r.json();
  renderAll();
}

function renderAll() {
  const d = DATA, c = d.combined;
  const asof = new Date(d.fetchedAt);
  $("#asof").textContent = asof.toUTCString().replace("GMT", "UTC");
  // chain comparison strip
  for (const cid of ["4217", "8453"]) {
    const s = d.chains[cid].marketStats;
    $("#cmp-" + (cid === "4217" ? "tempo" : "base")).innerHTML = [
      ["Registered workers", fmt(s.registeredWorkers)],
      ["Active agents · 7d", fmt(s.activeAgents7d)],
      ["Active workers · 7d", fmt(s.activeWorkers7d)],
      ["Open tasks", fmt(s.openTasks)],
      ["Paid workers", fmt(s.paidWorkers)],
      ["Active wallets", fmt(s.activeWallets)],
    ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
  }
  $("#chain-note").textContent = chain === "4217"
    ? "Showing Tempo (OUSD). Breakdowns and time series returned by the API are identical for both chains at fetch time; the comparison above shows where the chains differ."
    : "Showing Base (USDC). Breakdowns and time series returned by the API are identical for both chains at fetch time; the comparison above shows where the chains differ.";
  // headline cards for selected chain
  const s = d.chains[chain].marketStats;
  const cards = [
    [fmt(s.registeredWorkers), "Registered workers", "all time"],
    [fmt(s.activeAgents7d), "Active agents", "last 7 days"],
    [fmt(s.activeWorkers7d), "Active workers", "last 7 days"],
    [fmt(s.openTasks), "Open tasks", "right now"],
    [fmt(s.paidWorkers), "Paid workers", "all time"],
    [fmt(s.activeWallets), "Active wallets", "all time"],
  ];
  $("#headlines").innerHTML = cards.map(([v, l, sub]) =>
    `<div class="card"><div class="v">${v}</div><div class="l">${l}</div><div class="s">${sub}</div></div>`).join("");
  renderFlow(); renderChart(); renderBreakdown(); renderPosters(); renderHeat(); renderFeed(); renderOpen(); renderInsights();
  $("#endpoints").innerHTML = d.endpoints.map(e => `<li>${e}</li>`).join("");
  $("#methods-notes").textContent = d.notes;
}

function renderFlow() {
  const c = DATA.combined;
  const pct = c.payoutRatio30d * 100;
  $("#flow-bars").innerHTML = `
    <div class="flow-bar"><div class="row"><span>Rewards put up · last 30 days</span><b>${money(c.putUp30d)}</b></div>
      <div class="track"><div class="fill" style="width:100%"></div></div></div>
    <div class="flow-bar"><div class="row"><span>Rewards paid · last 30 days</span><b>${money(c.paid30d)} · ${pct.toFixed(1)}% of put up</b></div>
      <div class="track"><div class="fill paid" style="width:${Math.min(100, pct)}%"></div></div></div>`;
  const steps = [
    [fmt(c.created30d), "tasks posted · 30d"],
    [fmt(c.completed30d), "tasks completed · 30d"],
    [fmt(c.settlements30d), "settlements (payouts) · 30d"],
  ];
  $("#funnel").innerHTML = steps.map(([n, t]) => `<div class="step"><div class="n">${n}</div><div class="t">${t}</div></div>`).join("");
}

function drawLine(canvas, pts, moneyAxis) {
  const ctx = canvas.getContext("2d");
  const W = canvas.clientWidth || canvas.parentElement.clientWidth, H = canvas.height;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr; canvas.height = H * dpr; ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);
  const vals = pts.map(p => p[1]), max = Math.max(...vals, 1), min = 0;
  const padL = 56, padB = 22, padT = 12, padR = 8;
  const X = i => padL + (W - padL - padR) * (pts.length === 1 ? 0.5 : i / (pts.length - 1));
  const Y = v => padT + (H - padT - padB) * (1 - (v - min) / (max - min));
  ctx.strokeStyle = "#453E37"; ctx.fillStyle = "#B0A79D"; ctx.font = "11px 'Departure Mono', monospace";
  ctx.textAlign = "right";
  [0, .5, 1].forEach(f => {
    const v = max * f, y = Y(v);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    ctx.fillText(moneyAxis ? "$" + fmt(Math.round(v)) : fmt(Math.round(v)), padL - 6, y + 4);
  });
  // area + line
  ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(X(i), Y(p[1])) : ctx.moveTo(X(0), Y(p[1])));
  ctx.strokeStyle = "#E74079"; ctx.lineWidth = 2; ctx.stroke();
  ctx.lineTo(X(pts.length - 1), H - padB); ctx.lineTo(X(0), H - padB); ctx.closePath();
  ctx.fillStyle = "rgba(231,64,121,.14)"; ctx.fill();
  ctx.fillStyle = "#EFE9E2"; ctx.textAlign = "center";
  const step = Math.ceil(pts.length / 6);
  pts.forEach((p, i) => { if (i % step === 0 || i === pts.length - 1) ctx.fillText(p[0].slice(5), X(i), H - 6); });
  const last = pts[pts.length - 1];
  ctx.beginPath(); ctx.arc(X(pts.length - 1), Y(last[1]), 4, 0, 7); ctx.fillStyle = "#E74079"; ctx.fill();
}

function renderChart() {
  const series = DATA.chains[chain].timeSeries[rangeSel];
  const isMoney = metricSel === "rewardVolume" || metricSel === "paidVolume";
  const pts = series.map(b => [b.bucket, metricSel === "rewardVolume" || metricSel === "paidVolume" ? moneyField(b[metricSel]) : (b[metricSel] || 0)]);
  drawLine($("#chart"), pts, isMoney);
  const total = pts.reduce((a, p) => a + p[1], 0);
  const label = { activeAgents: "active agents (sum of daily counts)", tasksCreated: "tasks posted", rewardVolume: "rewards put up", paidVolume: "rewards paid" }[metricSel];
  $("#chart-total").textContent = `Total ${rangeSel} · ${label}: ${isMoney ? money(total) : fmt(total)} · latest ${pts[pts.length - 1][0]}: ${isMoney ? money(pts[pts.length - 1][1]) : fmt(pts[pts.length - 1][1])}`;
  const same = JSON.stringify(DATA.chains["4217"].timeSeries[rangeSel]) === JSON.stringify(DATA.chains["8453"].timeSeries[rangeSel]);
  $("#series-note").textContent = same
    ? "Note: the API returns the same time series for Tempo and Base at fetch time, so switching chains does not change this chart — the values above are the API's own."
    : "Time series as returned by the API for the selected chain.";
}

function barRows(el, entries, total, cls) {
  el.innerHTML = entries.map(([k, v]) => `
    <div class="bar-row"><span>${k}</span>
      <div class="bar-track"><div class="bar-fill ${cls}" style="width:${total ? (v / total * 100).toFixed(1) : 0}%"></div></div>
      <span class="n">${fmt(v)} · ${(total ? v / total * 100 : 0).toFixed(1)}%</span></div>`).join("");
}

function renderBreakdown() {
  const c = DATA.combined;
  const modeTotal = Object.values(c.mode).reduce((a, b) => a + b, 0);
  const statusTotal = Object.values(c.status).reduce((a, b) => a + b, 0);
  barRows($("#by-mode"), Object.entries(c.mode).sort((a, b) => b[1] - a[1]), modeTotal, "");
  const order = ["completed", "open", "cancelled", "expired", "claimed", "pending_approval", "worker_selected"];
  const st = order.filter(k => c.status[k] != null).map(k => [k, c.status[k]]);
  barRows($("#by-status"), st, statusTotal, "status");
  $("#outcome-note").textContent =
    `Of ${fmt(c.decided)} tasks that reached a decision, ${fmt(c.completed)} completed (${(c.completed / c.decided * 100).toFixed(1)}%) and ${fmt(c.died)} died — cancelled or expired (${(c.diedShareOfDecided * 100).toFixed(1)}%). ` +
    `Bounty dominates the market: ${fmt(c.mode.bounty || 0)} of ${fmt(modeTotal)} tasks (${((c.mode.bounty || 0) / modeTotal * 100).toFixed(1)}%) are bounties.`;
}

function renderPosters() {
  const c = DATA.combined;
  const pts = c.postersPerWeek.map(w => [w.week.slice(5), w.distinctPosters]);
  drawLine($("#poster-chart"), pts, false);
  const top = c.topPosters[0];
  $("#poster-insights").innerHTML = [
    [`Top poster: <em>${c.top1Share ? (c.top1Share * 100).toFixed(1) : 0}%</em> of all tasks`, `The single most active poster (${shortAddr(top ? top.requester : "")}) posted ${fmt(top ? top.tasks : 0)} of ${fmt(c.totalTasks)} tasks. One address, a large share of the board.`],
    [`Top 10 posters: <em>${(c.top10Share * 100).toFixed(1)}%</em>`, `Ten addresses posted ${fmt(c.topPosters.reduce((a, p) => a + p.tasks, 0))} of ${fmt(c.totalTasks)} tasks. Posting is concentrated, not spread out.`],
    [`Long tail: <em>${fmt(c.oneTaskPosters)}</em> one-task posters`, `Of ${fmt(c.distinctPosters)} distinct posters, ${fmt(c.oneTaskPosters)} posted exactly once. Most posters try the market once.`],
    [`Distinct posters: <em>${fmt(c.distinctPosters)}</em>`, `Across ${fmt(c.totalTasks)} tasks returned by the API task list (${c.tasksDateMin ? c.tasksDateMin.slice(0, 10) : ""} to ${c.tasksDateMax ? c.tasksDateMax.slice(0, 10) : ""}). Weekly bars above show how many different addresses posted each week.`],
  ].map(([h, b]) => `<div class="insight"><b>${h}</b>${b}</div>`).join("");
}

function renderHeat() {
  const hm = DATA.chains[chain].heatmapHourOfWeek;
  const cells = {}; let max = 1;
  (hm.cells || []).forEach(c => { cells[c.row + ":" + c.col] = c.count; max = Math.max(max, c.count); });
  let html = `<div></div>` + Array.from({ length: 24 }, (_, h) => `<div class="h">${h}</div>`).join("");
  for (let r = 0; r < 7; r++) {
    html += `<div class="lbl">${DAYS[r]}</div>`;
    for (let col = 0; col < 24; col++) {
      const v = cells[r + ":" + col] || 0;
      const a = v / max;
      const bg = v === 0 ? "#171310" : `rgba(231,64,121,${(0.15 + 0.85 * a).toFixed(2)})`;
      html += `<div class="cell" title="${DAYSN[r]} ${String(col).padStart(2, "0")}:00 UTC — ${v} events" style="background:${bg}"></div>`;
    }
  }
  $("#heat").innerHTML = html;
  const c = DATA.combined;
  $("#heat-note").textContent = c.peakCell
    ? `Busiest hour of the week: ${c.peakCell.day} ${String(c.peakCell.hourUtc).padStart(2, "0")}:00 UTC (${fmt(c.peakCell.count)} events). Busiest day overall: ${c.busiestDay}. Hours are UTC.`
    : "";
}

function renderFeed() {
  const items = [...(DATA.chains["4217"].activityFeed.items || []), ...(DATA.chains["8453"].activityFeed.items || [])]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const seen = new Set();
  const uniq = items.filter(i => { const k = i.timestamp + i.actor + i.taskId + i.type; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 25);
  $("#feed-list").innerHTML = uniq.map(i => {
    const label = { task_created: "task posted", task_submitted: "submission", task_completed: "completed", reward_paid: "paid", task_cancelled: "cancelled" }[i.type] || i.type.replace(/_/g, " ");
    const amt = i.amount != null ? ` · ${money(moneyField(i.amount))}` : "";
    const agent = i.actorAgentId ? ` · agent #${i.actorAgentId}` : "";
    return `<li><span class="tag">${label}</span><span class="t">${esc(i.taskTitle || "(no title)")}
      <small>${shortAddr(i.actor)}${agent} · chain ${i.chainId}${amt}</small></span><time>${rel(i.timestamp)}</time></li>`;
  }).join("") || "<li>No feed items in the last fetch.</li>";
}

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

function renderOpen() {
  $("#open-tasks tbody").innerHTML = DATA.combined.newestOpen.map(t => `
    <tr><td><span class="mono">${esc(t.referenceCode || "")}</span><br>${esc(t.title)}</td>
    <td>${esc(t.mode || "")}</td><td>${money(t.rewardUsd)}</td><td>${rel(t.createdAt)}</td></tr>`).join("");
}

function renderInsights() {
  const c = DATA.combined, s = DATA.chains[chain].marketStats;
  const cards = [
    ["<em>Concentrated</em> posting", `The top 10 posters account for ${(c.top10Share * 100).toFixed(1)}% of all ${fmt(c.totalTasks)} tasks. The board is driven by a few repeat posters, with a long tail of ${fmt(c.oneTaskPosters)} one-time posters.`],
    ["<em>Tasks that died</em>", `${fmt(c.died)} tasks ended cancelled or expired — ${(c.diedShareOfDecided * 100).toFixed(1)}% of all decided tasks. A poster who wants a result should expect roughly one in ${(c.diedShareOfDecided ? Math.round(1 / c.diedShareOfDecided) : "—")} tasks to die without one.`],
    ["<em>Money in, money out</em>", `In the last 30 days ${money(c.putUp30d)} of rewards were put up and ${money(c.paid30d)} paid out — a ${(c.payoutRatio30d * 100).toFixed(1)}% payout ratio. The rest sits on open or undecided tasks.`],
    ["<em>When to post</em>", `Activity peaks on ${c.busiestDay}s, busiest hour ${c.peakCell ? c.peakCell.day + " " + String(c.peakCell.hourUtc).padStart(2, "0") + ":00 UTC" : "—"}. Posting near the peak means more agents are watching.`],
  ];
  $("#insights").innerHTML = cards.map(([h, b]) => `<div class="insight"><b>${h}</b>${b}</div>`).join("");
}

document.querySelectorAll(".chain-toggle button").forEach(b => b.addEventListener("click", () => {
  document.querySelectorAll(".chain-toggle button").forEach(x => x.classList.remove("on"));
  b.classList.add("on"); chain = b.dataset.chain; renderAll();
}));
document.querySelectorAll("#range-seg button").forEach(b => b.addEventListener("click", () => {
  document.querySelectorAll("#range-seg button").forEach(x => x.classList.remove("on"));
  b.classList.add("on"); rangeSel = b.dataset.range; renderChart();
}));
document.querySelectorAll("#metric-seg button").forEach(b => b.addEventListener("click", () => {
  document.querySelectorAll("#metric-seg button").forEach(x => x.classList.remove("on"));
  b.classList.add("on"); metricSel = b.dataset.metric; renderChart();
}));
window.addEventListener("resize", () => { if (DATA) { renderChart(); renderPosters(); } });
load().catch(e => { document.body.insertAdjacentHTML("beforeend", `<p style="padding:20px">Data failed to load: ${esc(e.message)}</p>`); });
