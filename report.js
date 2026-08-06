// report.js
// Reads the persistent store in ./data/*.jsonl (falls back to ./results-*.jsonl) and
// builds a console summary + report.html.
// REAL submissions (test !== true) are what count toward the daily target; TEST runs
// are shown separately and never counted.
//
// Run:  node report.js

const fs = require("fs");
const path = require("path");

const DAILY_TARGET = 300; // real submissions per use-case (job) per day

// Prefer data/ (committed store); fall back to any stray results-*.jsonl in cwd.
const sources = [];
const dataDir = path.join(process.cwd(), "data");
if (fs.existsSync(dataDir)) {
  for (const f of fs.readdirSync(dataDir)) if (f.endsWith(".jsonl")) sources.push(path.join(dataDir, f));
}
for (const f of fs.readdirSync(process.cwd())) if (/^results-.*\.jsonl$/.test(f)) sources.push(path.join(process.cwd(), f));

if (sources.length === 0) { console.log("No data/*.jsonl or results-*.jsonl found. Run form-tester.js first."); process.exit(0); }

const entries = [];
for (const f of sources) {
  for (const line of fs.readFileSync(f, "utf8").split("\n").filter(Boolean)) {
    try { entries.push(JSON.parse(line)); } catch (_) {}
  }
}

const dateOf = (e) => (e.at || "").slice(0, 10) || "unknown";
const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };

// Group by date + job.
const groups = {};
for (const e of entries) {
  const key = `${dateOf(e)}::${e.job || "?"}`;
  (groups[key] ||= { date: dateOf(e), job: e.job || "?", realOk: 0, realFail: 0, testOk: 0, ms: [], errors: {}, picksByQ: {} });
  const g = groups[key];
  const isTest = e.test === true;
  if (e.ok) {
    if (isTest) { g.testOk++; }
    else {
      g.realOk++;
      if (typeof e.ms === "number") g.ms.push(e.ms);
      if (Array.isArray(e.picks)) {
        for (const p of e.picks) {
          const q = p.q ?? "?"; const label = (p.label || "(unknown)").trim();
          (g.picksByQ[q] ||= {}); g.picksByQ[q][label] = (g.picksByQ[q][label] || 0) + 1;
        }
      }
    }
  } else if (!isTest) {
    g.realFail++;
    const msg = (e.error || "unknown").slice(0, 120);
    g.errors[msg] = (g.errors[msg] || 0) + 1;
  }
}

const rows = Object.values(groups).sort((a, b) =>
  a.date === b.date ? a.job.localeCompare(b.job) : b.date.localeCompare(a.date));

// ---- console ----
console.log(`\nReal submissions only count toward target (${DAILY_TARGET}/use-case/day). Test runs shown separately.\n`);
for (const r of rows) {
  const total = r.realOk + r.realFail;
  const rate = total ? ((r.realOk / total) * 100).toFixed(1) : "0.0";
  const avg = r.ms.length ? Math.round(r.ms.reduce((a, b) => a + b, 0) / r.ms.length) : 0;
  console.log(`${r.date}  ${r.job}   [REAL ${r.realOk}/${DAILY_TARGET}]${r.testOk ? `  (test: ${r.testOk})` : ""}`);
  console.log(`   real ok ${r.realOk} | real fail ${r.realFail} | success ${rate}% | avg ${avg}ms | median ${median(r.ms)}ms`);
  for (const q of Object.keys(r.picksByQ).sort((a, b) => a - b)) {
    const dist = Object.entries(r.picksByQ[q]).sort((a, b) => b[1] - a[1]).map(([l, c]) => `${l} ×${c}`).join(", ");
    console.log(`   Q${Number(q) + 1}: ${dist}`);
  }
  Object.entries(r.errors).sort((a, b) => b[1] - a[1]).slice(0, 3).forEach(([m, c]) => console.log(`     ✗ ${c}x  ${m}`));
}

// ---- HTML ----
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const cards = rows.map((r) => {
  const total = r.realOk + r.realFail;
  const rate = total ? (r.realOk / total) * 100 : 0;
  const avg = r.ms.length ? Math.round(r.ms.reduce((a, b) => a + b, 0) / r.ms.length) : 0;
  const rateColor = rate >= 98 ? "#16a34a" : rate >= 90 ? "#d97706" : "#dc2626";
  const targetPct = Math.min(100, (r.realOk / DAILY_TARGET) * 100);
  const capped = r.realOk >= DAILY_TARGET;
  const targetColor = capped ? "#16a34a" : "#7c3aed";

  const picks = Object.keys(r.picksByQ).sort((a, b) => a - b).map((q) => {
    const items = Object.entries(r.picksByQ[q]).sort((a, b) => b[1] - a[1])
      .map(([l, c]) => `<li><span>${esc(l)}</span><b>${c}×</b></li>`).join("");
    return `<div class="q"><div class="qh">Q${Number(q) + 1}</div><ul>${items}</ul></div>`;
  }).join("");

  const errs = Object.entries(r.errors).sort((a, b) => b[1] - a[1])
    .map(([m, c]) => `<li><span class="c">${c}×</span> ${esc(m)}</li>`).join("");

  return `
  <div class="card">
    <div class="head"><h2>${esc(r.job)}</h2><span class="date">${esc(r.date)}</span></div>
    <div class="target">
      <div class="tlabel">Real submissions <b>${r.realOk} / ${DAILY_TARGET}</b>${capped ? ' <span class="cap">cap reached</span>' : ""}${r.testOk ? ` <span class="test">${r.testOk} test excluded</span>` : ""}</div>
      <div class="track"><div class="fill" style="width:${targetPct.toFixed(1)}%;background:${targetColor}"></div></div>
    </div>
    <div class="grid">
      <div><span>Real OK</span><b class="ok">${r.realOk}</b></div>
      <div><span>Real Fail</span><b class="fail">${r.realFail}</b></div>
      <div><span>Success</span><b style="color:${rateColor}">${rate.toFixed(1)}%</b></div>
      <div><span>Avg</span><b>${avg}ms</b></div>
      <div><span>Median</span><b>${median(r.ms)}ms</b></div>
    </div>
    ${picks ? `<div class="picks"><div class="pt">Which option was clicked (real only)</div><div class="qs">${picks}</div></div>` : ""}
    ${errs ? `<details><summary>Errors</summary><ul class="errs">${errs}</ul></details>` : ""}
  </div>`;
}).join("");

const html = `<!doctype html><meta charset="utf-8"><title>Quiz QA Report</title>
<style>
  :root{font-family:-apple-system,Segoe UI,Roboto,sans-serif}
  body{margin:0;background:#f6f5f3;color:#1a1a1a;padding:32px}
  h1{font-size:20px;margin:0 0 4px} .sub{color:#777;font-size:13px;margin-bottom:24px}
  .cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px}
  .card{background:#fff;border:1px solid #e7e5e1;border-radius:14px;padding:18px}
  .head{display:flex;justify-content:space-between;align-items:baseline}
  .head h2{font-size:15px;margin:0} .date{color:#999;font-size:12px}
  .target{margin:14px 0} .tlabel{font-size:12px;color:#555;margin-bottom:5px} .tlabel b{color:#111}
  .cap{color:#16a34a;font-weight:600} .test{color:#999}
  .track{height:9px;background:#eee;border-radius:99px;overflow:hidden} .fill{height:100%}
  .grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:6px}
  .grid div{background:#faf9f7;border-radius:8px;padding:8px;text-align:center}
  .grid span{display:block;color:#999;font-size:11px;margin-bottom:2px}
  .grid b{font-size:14px;font-variant-numeric:tabular-nums}
  .ok{color:#16a34a}.fail{color:#dc2626}
  .picks{margin-top:14px} .pt{font-size:12px;color:#555;margin-bottom:8px;font-weight:600}
  .qs{display:flex;flex-wrap:wrap;gap:10px}
  .q{flex:1;min-width:140px;background:#faf9f7;border:1px solid #eee;border-radius:10px;padding:10px}
  .qh{font-size:11px;color:#999;margin-bottom:6px;font-weight:600}
  .q ul{list-style:none;margin:0;padding:0} .q li{display:flex;justify-content:space-between;font-size:12px;padding:2px 0}
  .q li b{font-variant-numeric:tabular-nums;color:#7c3aed}
  details{margin-top:12px;font-size:12px} summary{cursor:pointer;color:#666}
  .errs{margin:8px 0 0;padding-left:16px} .errs li{margin:3px 0} .c{color:#dc2626;font-weight:600}
</style>
<h1>Quiz QA Report</h1>
<div class="sub">Generated ${new Date().toLocaleString()} · real target ${DAILY_TARGET}/use-case/day · test runs excluded</div>
<div class="cards">${cards}</div>`;

fs.writeFileSync(path.join(process.cwd(), "report.html"), html);
console.log(`\nHTML report written -> ${path.join(process.cwd(), "report.html")}\n`);